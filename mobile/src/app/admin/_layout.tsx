import React from 'react';
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/providers/AuthProvider';
import { colors } from '@/theme/tokens';

// Admin guard (MOBILE-PLAN.md §4 admin/_layout.tsx, §6 "Admin bootstrap").
// Only profile.role === 'admin' gets in; a non-admin (including a signed-out
// visitor, since `me` is then null) is redirected to their own profile tab —
// the admin area is otherwise invisible, per the P8 acceptance check.
export default function AdminLayout() {
  const { me, meLoading } = useAuth();

  if (meLoading) return null;
  if (me?.profile.role !== 'admin') return <Redirect href="/(tabs)/profile" />;

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
