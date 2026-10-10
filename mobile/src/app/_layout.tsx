import React from 'react';
import { reportError, wrapRoot } from '@/lib/sentry';
import { Platform, StyleSheet, View } from 'react-native';
import { Stack, ThemeProvider, DarkTheme, DefaultTheme } from 'expo-router';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryProvider } from '@/providers/QueryProvider';
import { AuthProvider } from '@/providers/AuthProvider';
import { LocationProvider } from '@/providers/LocationProvider';
import { ToastProvider } from '@/providers/ToastProvider';
import { ActionSheetProvider } from '@/providers/ActionSheetProvider';
import { PushProvider } from '@/providers/PushProvider';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { UpdateRequiredGate } from '@/components/UpdateRequiredGate';
import { isConfigured } from '@/lib/env';
import { fontAssets } from '@/theme/fonts';
import { colors, scheme, space } from '@/theme/tokens';

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.documentElement.style.colorScheme = scheme;
  document.body.style.backgroundColor = colors.bg;
}

const baseNavTheme = scheme === 'dark' ? DarkTheme : DefaultTheme;
const navTheme = {
  ...baseNavTheme,
  colors: {
    ...baseNavTheme.colors,
    primary: colors.accent,
    background: colors.bg,
    card: colors.surface,
    text: colors.ink,
    border: colors.line,
    notification: colors.accent,
  },
};

// Root layout. Provider order per MOBILE-PLAN.md §4:
//   QueryProvider > AuthProvider > LocationProvider > ToastProvider > ActionSheetProvider > PushProvider
function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  if (!fontsLoaded && !fontError) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <SafeAreaProvider>
      <ThemeProvider value={navTheme}>
      <QueryProvider>
        <AuthProvider>
          <LocationProvider>
            <ToastProvider>
              <ActionSheetProvider>
                <PushProvider>
                  <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
                  {isConfigured ? (
                    // Modal screens (compose, location, report, community/new) register
                    // their own `presentation: 'modal'` via `Stack.Screen.options` once
                    // those route files exist (P3/P6/P8) — Stack.Screen for a route that
                    // has no file yet would break the dev server, so we don't list them
                    // here in P0/P2.
                    <UpdateRequiredGate>
                      <Stack
                        screenOptions={{
                          headerShown: false,
                          contentStyle: { backgroundColor: colors.bg },
                        }}
                      >
                        {/* Modal screens registered as their route files land (MOBILE-PLAN.md §4):
                            compose + location (P3), community/new (P6), report (P8). */}
                        <Stack.Screen name="compose" options={{ presentation: 'modal' }} />
                        <Stack.Screen name="location" options={{ presentation: 'modal' }} />
                        <Stack.Screen name="community/new" options={{ presentation: 'modal' }} />
                        <Stack.Screen name="report" options={{ presentation: 'modal' }} />
                      </Stack>
                    </UpdateRequiredGate>
                  ) : (
                    <SetupNeeded />
                  )}
                </PushProvider>
              </ActionSheetProvider>
            </ToastProvider>
          </LocationProvider>
        </AuthProvider>
      </QueryProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

export default wrapRoot(RootLayout);

// Expo Router renders this instead of the app when a screen throws.
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  React.useEffect(() => reportError(error), [error]);
  return (
    <View style={styles.wrap}>
      <Text variant="title" style={styles.center}>
        Something went wrong
      </Text>
      <Text variant="body" style={styles.center}>
        The app hit an unexpected problem. Try again — if it keeps happening, please send us feedback.
      </Text>
      <Button label="Try again" onPress={() => retry()} />
    </View>
  );
}

// Shown instead of the app's navigation stack until EXPO_PUBLIC_SUPABASE_URL
// and EXPO_PUBLIC_SUPABASE_ANON_KEY are set in mobile/.env (see README.md).
function SetupNeeded() {
  return (
    <View style={styles.wrap}>
      <Text variant="title" style={styles.center}>
        Setup needed
      </Text>
      <Text variant="body" style={styles.center}>
        pincode needs a Supabase project before it can run. Copy mobile/.env.example to
        mobile/.env, fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY,
        then restart the dev server.
      </Text>
      <Text variant="secondary" style={styles.center}>
        See SETUP.md at the repo root for the full one-time setup.
      </Text>
      <Button label="I've set it up, reload" onPress={() => {}} variant="ghost" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.s6,
    gap: space.s3,
  },
  center: { textAlign: 'center' },
});
