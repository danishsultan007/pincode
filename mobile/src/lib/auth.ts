// Auth helpers (MOBILE-PLAN.md §5). Thin wrappers around supabase-js plus the
// browser-based Google PKCE flow, which works in Expo Go, dev builds and web.

import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { normalizeIndianPhone } from './phone';

WebBrowser.maybeCompleteAuthSession();

export async function signInWithGoogle(): Promise<void> {
  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) throw error;
    return;
  }

  // exp://…/--/auth/callback in Expo Go, pincode://auth/callback in builds.
  const redirectTo = Linking.createURL('auth/callback');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  });
  if (error) throw error;
  if (!data?.url) return;

  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (res.type === 'success' && res.url) {
    await completeAuthFromUrl(res.url);
  }
}

export async function completeAuthFromUrl(url: string): Promise<void> {
  const { queryParams } = Linking.parse(url);
  if (queryParams?.error_description) {
    throw new Error(String(queryParams.error_description));
  }
  const code = queryParams?.code;
  if (typeof code === 'string') {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
    }
  }
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
  const trimmed = identifier.trim();
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

export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: Linking.createURL('auth/callback'),
  });
  if (error) throw error;
}

export async function updatePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}
