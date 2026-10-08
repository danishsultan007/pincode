import React from 'react';
import { StyleSheet, type ColorValue } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { Icon, IconName } from '@/components/ui/Icon';
import { useAuth } from '@/providers/AuthProvider';
import { RealtimeProvider } from '@/providers/RealtimeProvider';
import { useInboxCounts } from '@/hooks/useInbox';
import { TERMS_VERSION } from '@/lib/legal';
import { colors, font } from '@/theme/tokens';

// expo-router's tabBarIcon passes RN's `ColorValue` (string | OpaqueColorValue);
// our Icon only takes plain hex strings, which is all tokens.ts ever provides.
function tabIcon(name: IconName) {
  return ({ color, focused }: { color: ColorValue; size: number; focused: boolean }) => (
    <Icon name={name} size={22} color={String(color)} strokeWidth={focused ? 2.2 : 1.8} />
  );
}

// Tab shell guard (MOBILE-PLAN.md §4/§5.5): no session -> /welcome, not
// onboarded -> /onboarding. Mounts RealtimeProvider (notifications/messages
// channels, §3) and shows the Inbox tab's badge = chats + requests +
// notifications from inbox_counts() (§3 "Badges").
export default function TabsLayout() {
  const { session, me, loading, meLoading } = useAuth();

  if (loading || (session && meLoading)) return null;
  if (!session) return <Redirect href="/welcome" />;
  if (!me?.profile.onboarded_at) return <Redirect href="/onboarding" />;
  if (me.private.terms_version !== TERMS_VERSION) return <Redirect href="/accept-terms" />;

  return (
    <RealtimeProvider>
      <TabsInner />
    </RealtimeProvider>
  );
}

function TabsInner() {
  const { data: counts } = useInboxCounts();
  const inboxBadge = (counts?.chats ?? 0) + (counts?.requests ?? 0) + (counts?.notifications ?? 0);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.ink3,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          borderTopWidth: StyleSheet.hairlineWidth,
          elevation: 0,
        },
        tabBarLabelStyle: { fontFamily: font.semibold, fontWeight: 'normal', fontSize: 10, letterSpacing: 0 },
        tabBarBadgeStyle: {
          backgroundColor: colors.accent,
          color: colors.accentInk,
          fontFamily: font.bold,
          fontWeight: 'normal',
          fontSize: 10,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabIcon('home') }} />
      <Tabs.Screen name="communities" options={{ title: 'Communities', tabBarIcon: tabIcon('users') }} />
      <Tabs.Screen name="search" options={{ title: 'Search', tabBarIcon: tabIcon('search') }} />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Inbox',
          tabBarIcon: tabIcon('inbox'),
          tabBarBadge: inboxBadge > 0 ? (inboxBadge > 99 ? '99+' : inboxBadge) : undefined,
        }}
      />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: tabIcon('user') }} />
    </Tabs>
  );
}
