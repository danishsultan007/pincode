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
// any of the three. Supabase Auth itself only takes an email, so a
// non-email identifier is resolved to one first via email_for_login() —
// see that function's own comment for why this doesn't leak whether an
// identifier exists (a wrong password still fails with Supabase's own
// generic error either way).
export async function signInWithIdentifier(identifier: string, password: string) {
  const trimmed = identifier.trim();
  const lookup = normalizeIndianPhone(trimmed) ?? trimmed;
  let email = trimmed;
  try {
    const { data } = await supabase.rpc('email_for_login', { p_identifier: lookup });
    if (typeof data === 'string' && data) email = data;
  } catch {
    // Fall through and let signInWithPassword produce its own error.
  }
  return signInWithEmail(email, password);
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
