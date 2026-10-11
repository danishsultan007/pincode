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
import { useAuth } from '@/providers/AuthProvider';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { UpdateRequiredGate } from '@/components/UpdateRequiredGate';
import { UpdateBanner } from '@/components/UpdateBanner';
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
                    // The screens and their modal options are declared in <AppStack /> below.
                    <UpdateRequiredGate>
                      <AppStack />
                      <UpdateBanner />
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

// The app is a single static page on web (every address loads it), so each screen has to guard
// itself. Screens that only make sense when signed in are listed here once, behind a guard:
// a signed-out visitor who opens one of their addresses is sent back to the start ('/'), which
// forwards to /welcome. Everything not listed stays public on purpose: welcome, sign-in/up,
// password reset, terms/privacy/guidelines, account-deletion info, and the read-only post,
// community and profile pages that shared links point to. (tabs), admin and accept-terms
// also redirect by themselves; the guard below is what protects the rest.
//
// While the session is still being restored (loading) the guard stays open, so a notification
// tap that opens /chat/<id> at app start is not bounced before the sign-in is known.
function AppStack() {
  const { session, loading } = useAuth();
  const signedIn = loading || !!session;
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="compose" options={{ presentation: 'modal' }} />
        <Stack.Screen name="location" options={{ presentation: 'modal' }} />
        <Stack.Screen name="community/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="report" options={{ presentation: 'modal' }} />
        <Stack.Screen name="chat/[id]" />
        <Stack.Screen name="profile/edit" />
        <Stack.Screen name="community/[slug]/edit" />
        <Stack.Screen name="settings/index" />
        <Stack.Screen name="settings/blocked" />
        <Stack.Screen name="settings/feedback" />
        <Stack.Screen name="settings/notifications" />
        <Stack.Screen name="settings/password" />
        <Stack.Screen name="settings/phone" />
        <Stack.Screen name="settings/username" />
      </Stack.Protected>
    </Stack>
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
