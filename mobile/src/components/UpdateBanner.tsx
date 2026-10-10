import React from 'react';
import { AppState, Platform, Pressable, StyleSheet, View } from 'react-native';
import * as Updates from 'expo-updates';
import { usePathname } from 'expo-router';
import { useKeyboardVisible } from '@/hooks/useKeyboardVisible';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import { colors, radius, space } from '@/theme/tokens';

// Minimum gap between update checks, so hopping in and out of the app does not
// hit the update server every time.
const CHECK_EVERY_MS = 10 * 60 * 1000;

// Screens where text can sit unsent even with the keyboard hidden.
const DRAFT_ROUTES = ['/compose', '/report', '/community/new', '/profile/edit', '/onboarding', '/settings/feedback'];

// OTA updates download in the background and would otherwise only apply on the
// next cold start, which on Android can be days away. This checks on launch and
// each return to the foreground (throttled), downloads a found update, and shows
// a "tap to restart" banner once one is ready. Nothing reloads by itself, so
// nobody loses a half-typed post.
export function UpdateBanner() {
  const insets = useSafeAreaInsets();
  const { isUpdatePending, downloadedUpdate } = Updates.useUpdates();
  const pathname = usePathname();
  const keyboardVisible = useKeyboardVisible();
  // "Later" hides only the update it was tapped for; a newer download asks again.
  const [dismissedId, setDismissedId] = React.useState<string | null>(null);
  const [restarting, setRestarting] = React.useState(false);

  React.useEffect(() => {
    if (Platform.OS === 'web' || __DEV__ || !Updates.isEnabled) return;
    let alive = true;
    let busy = false;
    let lastCheck = 0;
    const check = async () => {
      if (busy || Date.now() - lastCheck < CHECK_EVERY_MS) return;
      busy = true;
      lastCheck = Date.now();
      try {
        const res = await Updates.checkForUpdateAsync();
        if (alive && res.isAvailable) await Updates.fetchUpdateAsync();
      } catch {
        // Offline or server hiccup: try again at the next foreground.
        lastCheck = 0;
      } finally {
        busy = false;
      }
    };
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  // Restarting wipes JS state, so never offer it while someone may be mid-draft:
  // keyboard open, or on a screen that holds a form.
  const drafting = keyboardVisible || DRAFT_ROUTES.some((r) => pathname.startsWith(r));
  const updateId = downloadedUpdate?.updateId ?? null;
  if (!isUpdatePending || drafting || (updateId !== null && dismissedId === updateId)) return null;

  const restart = async () => {
    setRestarting(true);
    try {
      await Updates.reloadAsync();
    } catch {
      setRestarting(false);
    }
  };

  return (
    <View style={[styles.host, { top: insets.top + space.s2 }]} pointerEvents="box-none">
      <View style={styles.card} accessibilityRole="alert">
        <View style={styles.textCol}>
          <Text variant="label">Update ready</Text>
          <Text variant="meta">Restart to get the latest version.</Text>
        </View>
        <Pressable
          onPress={() => setDismissedId(updateId)}
          accessibilityRole="button"
          accessibilityLabel="Later"
          hitSlop={8}
          style={styles.later}
        >
          <Text variant="secondary">Later</Text>
        </Pressable>
        <Pressable
          onPress={restart}
          disabled={restarting}
          accessibilityRole="button"
          accessibilityLabel="Restart now"
          hitSlop={4}
          style={[styles.restart, restarting && { opacity: 0.6 }]}
        >
          <Text variant="label" style={styles.restartText}>
            {restarting ? 'Restarting…' : 'Restart'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: space.s4, right: space.s4, zIndex: 9000, elevation: 9000, alignItems: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    width: '100%',
    maxWidth: 480,
    paddingVertical: space.s3,
    paddingHorizontal: space.s4,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    elevation: 10,
  },
  textCol: { flex: 1 },
  later: { paddingHorizontal: space.s2, paddingVertical: space.s2 },
  restart: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space.s4, paddingVertical: space.s2 },
  restartText: { color: colors.accentInk },
});
