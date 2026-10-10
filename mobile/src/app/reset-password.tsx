import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { NewPasswordForm } from '@/components/auth/NewPasswordForm';
import { supabase } from '@/lib/supabase';
import { parseAuthUrl } from '@/lib/auth';
import { messageFor } from '@/lib/errors';
import { colors, space } from '@/theme/tokens';

// Landing page for the 'Forgot password?' email link. The link must be turned
// into a session before the password can be changed, and it comes in three shapes:
//   (a) ?code=…                          PKCE, from resetPasswordForEmail in the app
//   (b) #access_token=…&refresh_token=…&type=recovery
//                                        implicit, from the request-password-reset
//                                        Edge Function (username/phone reset)
//   (c) ?token_hash=…&type=recovery      email-template style links
// expo-router does not expose the URL fragment, so we read the full URL from
// expo-linking on native and from window.location on web. On web supabase-js may
// already have consumed (a)/(b) (detectSessionInUrl) and cleared the URL; the
// wait-for-session fallback covers that. We always consume the link ourselves
// when it is present, even if someone is already signed in on this device, so
// the reset applies to the account the email was sent to. Never log the URL.
export default function ResetPassword() {
  const router = useRouter();
  const { code: codeParam, error_description: errParam } = useLocalSearchParams<{ code?: string; error_description?: string }>();
  const linkUrl = Linking.useLinkingURL();
  const [status, setStatus] = useState<'checking' | 'ready' | 'failed'>('checking');
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const handled = useRef<string | null>(null);
  const latestUrl = useRef<string | null>(null);
  latestUrl.current = linkUrl;
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    const done = (s: 'ready' | 'failed', msg?: string) => {
      if (!alive.current) return;
      if (s === 'ready') {
        // The link signs in whoever it was issued for, so show who that is: a crafted
        // link would sign the user into someone else's account. Omit the line on failure.
        supabase.auth
          .getUser()
          .then(({ data }) => alive.current && setEmail(data.user?.email ?? null))
          .catch(() => {});
      }
      setStatus(s);
      if (msg) setError(msg);
    };
    // Web: keep codes/tokens out of the address bar and history, but keep
    // expo-router's history state.
    const clearUrl = () => {
      if (Platform.OS === 'web') window.history.replaceState(window.history.state, '', window.location.pathname);
    };
    const fail = (msg: string) => {
      clearUrl();
      done('failed', msg);
    };

    async function run() {
      try {
        let url: string | null;
        if (Platform.OS === 'web') {
          // getSession resolves after the client finished its own startup, including
          // detectSessionInUrl's exchange, so we never race it for a one-time code.
          await supabase.auth.getSession();
          url = window.location.href;
        } else {
          url = linkUrl ?? (await Linking.getInitialURL());
        }
        // One pass per URL: a link is single-use, so never exchange it twice.
        const key = url ?? '';
        if (handled.current === key) return;
        handled.current = key;

        const p = parseAuthUrl(url ?? '');
        const code = p.code ?? (typeof codeParam === 'string' ? codeParam : undefined);
        const errMsg = p.errorDescription ?? (typeof errParam === 'string' ? errParam : undefined) ?? p.error;
        if (errMsg) return fail(errMsg);

        const hasTokens = !!(p.accessToken && p.refreshToken);
        if (code || hasTokens || p.tokenHash) {
          // Only recovery links belong here. (A PKCE code carries no type.)
          if ((hasTokens || p.tokenHash) && p.type !== 'recovery') {
            return fail('This link is not a password reset link.');
          }
          try {
            if (code) {
              const { error: e } = await supabase.auth.exchangeCodeForSession(code);
              if (e) throw e;
            } else if (hasTokens) {
              const { error: e } = await supabase.auth.setSession({ access_token: p.accessToken!, refresh_token: p.refreshToken! });
              if (e) throw e;
            } else {
              const { error: e } = await supabase.auth.verifyOtp({ token_hash: p.tokenHash!, type: 'recovery' });
              if (e) throw e;
            }
          } catch (err) {
            return fail(messageFor(err));
          }
          clearUrl();
          return done('ready');
        }

        // No link in the URL. Web: the client already consumed it during startup, so a
        // session means ready. Native: the URL may not have arrived yet, so wait for a
        // session or for a different URL before giving up.
        for (let i = 0; i < 20; i++) {
          if (!alive.current) return;
          const { data } = await supabase.auth.getSession();
          if (data.session) return done('ready');
          if (Platform.OS !== 'web' && latestUrl.current && latestUrl.current !== url) return; // the new URL gets its own pass
          await new Promise((r) => setTimeout(r, 250));
        }
        done('failed', 'This reset link is invalid or has expired.');
      } catch (err) {
        fail(messageFor(err));
      }
    }

    run();
  }, [linkUrl, codeParam, errParam]);

  return (
    <Screen scroll>
      <Header large title="Set a new password" />
      <View style={styles.form}>
        {status === 'checking' ? (
          <ActivityIndicator color={colors.accent} />
        ) : status === 'failed' ? (
          <>
            <Text variant="body">{error ?? 'This reset link is invalid or has expired.'}</Text>
            <Text variant="secondary">Reset links work once and expire after a while. Request a new one.</Text>
            <Button label="Send a new link" onPress={() => router.replace('/forgot-password')} />
          </>
        ) : (
          <>
            {email ? <Text variant="secondary">Resetting the password for {email}</Text> : null}
            <Text variant="secondary">Choose a new password for your account.</Text>
            <NewPasswordForm submitLabel="Update password" onDone={() => router.replace('/')} />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { paddingHorizontal: space.s4, paddingTop: space.s3, paddingBottom: space.s6, gap: space.s4, width: '100%', maxWidth: 480, alignSelf: 'center' },
});
