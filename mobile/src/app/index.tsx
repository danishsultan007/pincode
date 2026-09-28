import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/providers/AuthProvider';
import { colors } from '@/theme/tokens';

// Root redirect (MOBILE-PLAN.md §4/§5.5):
//   no session -> /welcome
//   session && !profile.onboarded_at -> /onboarding
//   else -> /(tabs)
export default function Index() {
  const { session, me, loading, meLoading } = useAuth();

  if (loading || (session && meLoading)) {
    return (
      <View style={styles.wrap}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!session) return <Redirect href="/welcome" />;
  if (!me?.profile.onboarded_at) return <Redirect href="/onboarding" />;
  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});
