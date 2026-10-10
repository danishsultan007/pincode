import React from 'react';
import { AppState, Linking, Platform, StyleSheet, View } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { PLAY_MARKET_URL, PLAY_STORE_URL, currentVersion, isOlder } from '@/lib/version';
import { colors, space } from '@/theme/tokens';

const CHECK_TIMEOUT_MS = 3000;
const DEFAULT_MESSAGE = 'This version of pincode is no longer supported. Please update to keep using the app.';

type Config = { min_supported_version: string; message: string | null };

// Reads the one-row app_config table. Returns null on any error or timeout so
// the gate fails open — a flaky network must never lock people out.
async function fetchConfig(): Promise<Config | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const query = supabase
      .from('app_config')
      .select('min_supported_version, message')
      .eq('id', true)
      .maybeSingle()
      .then(({ data, error }) => (error ? null : (data as Config | null)));
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), CHECK_TIMEOUT_MS);
    });
    return await Promise.race([query, timeout]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Covers the app with a non-dismissible "Update required" overlay when the
// installed version is older than app_config.min_supported_version. Children
// are ALWAYS rendered (the navigator must stay mounted or router.push from a
// notification tap / auth redirect would throw); the overlay sits above them.
// The check runs in the background on mount and on each return to the
// foreground, and fails open on any error, timeout or unknown version.
export function UpdateRequiredGate({ children }: { children: React.ReactNode }) {
  const [blocked, setBlocked] = React.useState<string | null>(null); // message when blocked

  React.useEffect(() => {
    if (Platform.OS === 'web') return;
    let alive = true;
    const check = async () => {
      const installed = currentVersion();
      if (!installed) return;
      const cfg = await fetchConfig();
      if (!alive || !cfg) return;
      setBlocked(isOlder(installed, cfg.min_supported_version) ? cfg.message || DEFAULT_MESSAGE : null);
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

  const openStore = () => {
    Linking.openURL(PLAY_MARKET_URL).catch(() => Linking.openURL(PLAY_STORE_URL).catch(() => {}));
  };

  return (
    <>
      {children}
      {blocked !== null && (
        // Opaque full-window overlay: swallows touches and hides the app from screen readers.
        <View
          style={styles.overlay}
          accessibilityViewIsModal
          importantForAccessibility="yes"
          onStartShouldSetResponder={() => true}
        >
          <Screen>
            <View style={styles.wrap}>
              <Text variant="title" style={styles.center}>
                Update required
              </Text>
              <Text variant="body" style={styles.center}>
                {blocked}
              </Text>
              <Button label="Update" onPress={openStore} />
            </View>
          </Screen>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 9999, elevation: 9999, backgroundColor: colors.bg },
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.s6, gap: space.s3 },
  center: { textAlign: 'center' },
});
