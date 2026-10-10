import React, { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from './AuthProvider';
import { registerForPushNotificationsAsync } from '@/lib/push';

// Expo push registration + tap-to-deep-link (MOBILE-PLAN.md §3, §4 root
// layout: mounted after ToastProvider). Renders nothing — it only registers
// the push token once onboarding is done and wires notification-tap
// deep-linking via the `data.url` every notification row carries (§2.5).
export function PushProvider({ children }: { children: React.ReactNode }) {
  const { session, me } = useAuth();
  const registeredFor = useRef<string | null>(null);

  const uid = session?.user?.id ?? null;
  const onboarded = !!me?.profile.onboarded_at;

  useEffect(() => {
    if (!uid || !onboarded) {
      registeredFor.current = null;
      return;
    }
    if (registeredFor.current === uid) return;
    registeredFor.current = uid;
    registerForPushNotificationsAsync();
  }, [uid, onboarded]);

  useEffect(() => {
    // expo-notifications has no web implementation; these calls throw there.
    if (Platform.OS === 'web') return;
    const goTo = (url: unknown) => {
      // Only in-app paths: expo-router would open an absolute URL (https:, javascript:, …)
      // externally, and a payload is not trusted. "//host" is protocol-relative, so reject it.
      if (typeof url === 'string' && /^\/(?![/\\])/.test(url)) {
        router.push(url as Parameters<typeof router.push>[0]);
      } else if (__DEV__) {
        console.warn('Ignoring push url that is not an in-app path');
      }
    };

    // Cold start: the app was opened by tapping a notification.
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        const data = response?.notification.request.content.data as { url?: string } | undefined;
        if (data?.url) goTo(data.url);
      })
      .catch(() => {});

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { url?: string } | undefined;
      if (data?.url) goTo(data.url);
    });

    return () => sub.remove();
  }, []);

  return <>{children}</>;
}
