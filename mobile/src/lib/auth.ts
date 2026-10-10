// Auth helpers (MOBILE-PLAN.md §5). Thin wrappers around supabase-js plus the
// browser-based Google PKCE flow, which works in Expo Go, dev builds and web.

import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { normalizeIndianPhone } from './phone';

WebBrowser.maybeCompleteAuthSession();

// One code exchange per OAuth code per process. signInWithGoogle and the
// /auth/callback route can both see the same redirect; they share this job so a
// code is never exchanged twice (codes are single-use).
const jobs = new Map<string, Promise<void>>();

export async function handleAuthUrl(url: string): Promise<'signed_in' | 'no_code'> {
  const p = parseAuthUrl(url);
  if (p.error || p.errorDescription) throw new Error(p.errorDescription ?? p.error);
  if (!p.code) return 'no_code';

  let job = jobs.get(p.code);
  if (!job) {
    job = supabase.auth.exchangeCodeForSession(p.code).then(async ({ error }) => {
      // A consumed code fails, which is fine if the session is already there.
      if (error && !(await supabase.auth.getSession()).data.session) throw error;
    });
    jobs.set(p.code, job);
  }
  await job;
  return 'signed_in';
}

// Resolves true as soon as a session exists, false after `ms`.
export function waitForSession(ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe: (() => void) | undefined;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      unsubscribe?.();
      resolve(ok);
    };
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finish(true);
    });
    unsubscribe = () => data.subscription.unsubscribe();
    timer = setTimeout(() => finish(false), ms);
    supabase.auth
      .getSession()
      .then(({ data: s }) => {
        if (s.session) finish(true);
      })
      .catch(() => {});
  });
}

// Web resolves 'signed_in' once the redirect to Google is kicked off (the session
// is completed by detectSessionInUrl on /auth/callback). Native resolves
// 'cancelled' when the user closed the browser without finishing.
export async function signInWithGoogle(): Promise<'signed_in' | 'cancelled'> {
  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) throw error;
    return 'signed_in';
  }

  // exp://…/--/auth/callback in Expo Go, pincode://auth/callback in builds.
  const redirectTo = Linking.createURL('auth/callback');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  });
  if (error) throw error;
  if (!data?.url) return 'cancelled';

  // On Android the browser can resolve as 'dismiss' while the redirect arrives
  // as a Linking event instead, so remember any redirect seen meanwhile.
  let seen: string | undefined;
  const sub = Linking.addEventListener('url', (e) => {
    if (e.url.startsWith(redirectTo)) seen = e.url;
  });
  try {
    const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    const url = res.type === 'success' && res.url ? res.url : seen;
    if (url) {
      await handleAuthUrl(url);
      return 'signed_in';
    }
    // The browser can report 'dismiss' just before the redirect event lands, or the
    // /auth/callback route may consume the link: wait up to 3s for either a
    // session or the redirect to show up here.
    const deadline = Date.now() + 3000;
    for (;;) {
      if (seen) {
        await handleAuthUrl(seen);
        return 'signed_in';
      }
      if ((await supabase.auth.getSession()).data.session) return 'signed_in';
      if (Date.now() >= deadline) return 'cancelled';
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  } finally {
    sub.remove();
  }
}

// Kept for existing callers; see handleAuthUrl.
export async function completeAuthFromUrl(url: string): Promise<void> {
  await handleAuthUrl(url);
}

export type ParsedAuthUrl = {
  code?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenHash?: string;
  type?: string;
  error?: string;
  errorDescription?: string;
};

// Pulls auth parameters out of a redirect URL, from the query string AND the
// fragment. Supabase puts PKCE codes and token_hash in the query, but implicit-flow
// links (e.g. reset emails sent by an Edge Function) arrive as
// scheme://path#access_token=…&refresh_token=…&type=recovery, and expo-router does
// not expose the fragment. Never log the result: it holds tokens.
export function parseAuthUrl(url: string): ParsedAuthUrl {
  const hashAt = url.indexOf('#');
  const beforeHash = hashAt === -1 ? url : url.slice(0, hashAt);
  const fragment = hashAt === -1 ? '' : url.slice(hashAt + 1);
  const queryAt = beforeHash.indexOf('?');
  const query = queryAt === -1 ? '' : beforeHash.slice(queryAt + 1);

  const q = new URLSearchParams(query);
  const f = new URLSearchParams(fragment);
  // Query wins; the fragment fills in what the query lacks.
  const get = (k: string) => q.get(k) || f.get(k) || undefined;

  return {
    code: get('code'),
    accessToken: get('access_token'),
    refreshToken: get('refresh_token'),
    tokenHash: get('token_hash'),
    type: get('type'),
    error: get('error'),
    errorDescription: get('error_description'),
  };
}

export async function signUpWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: Linking.createURL('auth/callback') },
  });
  if (error) throw error;
  return data;
}

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// Username, email and phone are all unique per account, so sign-in accepts
// any of the three. Supabase Auth itself only takes an email, so a username
// or phone is resolved to one on the server by the login-with-identifier
// Edge Function, which returns only a session — the email is never sent to
// the client, and an unknown identifier fails exactly like a wrong password.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function signInWithIdentifier(identifier: string, password: string) {
  const trimmed = identifier.trim().replace(/^@/, '');
  if (EMAIL_RE.test(trimmed)) return signInWithEmail(trimmed.toLowerCase(), password);

  const lookup = normalizeIndianPhone(trimmed) ?? trimmed;
  const { data, error } = await supabase.functions.invoke('login-with-identifier', {
    body: { identifier: lookup, password },
  });
  if (error) {
    // On a non-2xx response supabase-js puts the Response in error.context.
    // A non-2xx reply carries the Response in error.context. For a request that
    // never got a reply (offline, CORS failure, function missing) supabase-js puts
    // the underlying Error there instead, so check the type rather than presence.
    const ctx = (error as { context?: unknown }).context;
    if (typeof Response === 'undefined' || !(ctx instanceof Response)) {
      throw new Error("Couldn't connect. Check your internet connection and try again.");
    }
    let message = ctx.status === 404 ? 'Sign-in is temporarily unavailable. Try your email instead.' : 'Invalid login credentials';
    try {
      const body = await ctx.json();
      if (body?.message) message = body.message;
    } catch {
      // Non-JSON body: keep the generic message.
    }
    throw new Error(message);
  }

  const { data: session, error: sessionError } = await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  });
  if (sessionError) throw sessionError;
  return session;
}

// The reset link lands on /reset-password (not /auth/callback, which would
// just sign the user in and go home without asking for a new password).
// A username or phone is resolved to the account's email by the
// request-password-reset Edge Function, so the email never reaches the client
// and the reply is the same whether or not an account matched.
export async function sendPasswordReset(identifier: string): Promise<void> {
  const trimmed = identifier.trim().replace(/^@/, '');
  const redirectTo = Linking.createURL('reset-password');
  if (EMAIL_RE.test(trimmed)) {
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed.toLowerCase(), { redirectTo });
    if (error) throw error;
    return;
  }

  const lookup = normalizeIndianPhone(trimmed) ?? trimmed;
  const { error } = await supabase.functions.invoke('request-password-reset', {
    body: { identifier: lookup, redirectTo },
  });
  if (error) {
    // Same as signInWithIdentifier: no Response in error.context means no reply at all.
    const ctx = (error as { context?: unknown }).context;
    if (typeof Response === 'undefined' || !(ctx instanceof Response)) {
      throw new Error("Couldn't connect. Check your internet connection and try again.");
    }
    let message = ctx.status === 404 ? 'Password reset is temporarily unavailable. Try your email instead.' : 'Something went wrong. Try again.';
    try {
      const body = await ctx.json();
      if (body?.message) message = body.message;
    } catch {
      // Non-JSON body: keep the generic message.
    }
    throw new Error(message);
  }
}

export async function updatePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

// Both signInWithGoogle's caller and the /auth/callback route can see the same
// failed redirect. Whoever calls this first for a message gets to show the toast.
let lastToast: { message: string; at: number } | null = null;
export function claimErrorToast(message: string): boolean {
  const now = Date.now();
  if (lastToast && lastToast.message === message && now - lastToast.at < 10000) return false;
  lastToast = { message, at: now };
  return true;
}
