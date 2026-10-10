import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { claimErrorToast, handleAuthUrl, waitForSession } from '@/lib/auth';
import { messageFor } from '@/lib/errors';
import { useToast } from '@/providers/ToastProvider';
import { colors, space } from '@/theme/tokens';

// Completes OAuth/email links (MOBILE-PLAN.md §4/§5). On web,
// `detectSessionInUrl` on the client already does the code exchange, so we
// just wait for the session. On native, expo-router navigates here with the
// deep link's query as route params; signInWithGoogle may also be handling the
// same redirect, so both go through handleAuthUrl, which exchanges a code once.
// We only go home once a session exists; otherwise back to /welcome with a toast.
export default function AuthCallback() {
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ code?: string; error?: string; error_description?: string }>();
  const linkUrl = Linking.useLinkingURL();
  const handled = useRef<string | null>(null);
  const mounted = useRef(true);
  const runId = useRef(0);

  const code = typeof params.code === 'string' ? params.code : undefined;
  const paramError = typeof params.error === 'string' ? params.error : undefined;
  const paramErrorDescription = typeof params.error_description === 'string' ? params.error_description : undefined;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    async function run() {
      // Results from a superseded run (a newer link arrived) are ignored.
      const my = ++runId.current;
      const current = () => mounted.current && runId.current === my;
      try {
        let ok: boolean;
        if (Platform.OS === 'web') {
          // The session comes from detectSessionInUrl; as before, go home either way.
          await waitForSession(5000);
          ok = true;
        } else {
          // Route params are the current deep link; the linking URL and the
          // initial URL are fallbacks for links that carry no params.
          const search = new URLSearchParams();
          if (code) search.set('code', code);
          if (paramError) search.set('error', paramError);
          if (paramErrorDescription) search.set('error_description', paramErrorDescription);
          const fromParams = search.toString() ? `x://auth/callback?${search.toString()}` : undefined;
          // Skip the (possibly stale cold-start) initial URL when a live link is known.
          const url = fromParams ?? linkUrl ?? (await Linking.getInitialURL()) ?? undefined;
          if (!current()) return;
          if (url) await handleAuthUrl(url);
          ok = await waitForSession(5000);
          if (!ok) throw new Error('Sign-in did not complete. Please try again.');
        }
        if (current() && ok) router.replace('/');
      } catch (err) {
        if (!current()) return;
        const message = messageFor(err);
        if (claimErrorToast(message)) toast.show(message);
        if (router.canGoBack()) router.back();
        else router.replace('/welcome');
      }
    }

    // A link is never processed twice (StrictMode / re-renders with the same URL).
    const key = Platform.OS === 'web' ? 'web' : (code ?? paramError ?? linkUrl ?? 'none');
    if (handled.current === key) return;
    // A late-arriving link replaces a 'none' run that is still waiting.
    handled.current = key;
    run();
  }, [code, paramError, paramErrorDescription, linkUrl, router, toast]);

  return (
    <View style={styles.wrap}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    padding: space.s6,
    gap: space.s3,
  },
});
