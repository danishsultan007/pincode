import React from 'react';
import type { ColorValue } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { Icon, IconName } from '@/components/ui/Icon';
import { useAuth } from '@/providers/AuthProvider';
import { RealtimeProvider } from '@/providers/RealtimeProvider';
import { useInboxCounts } from '@/hooks/useInbox';
import { colors } from '@/theme/tokens';

// expo-router's tabBarIcon passes RN's `ColorValue` (string | OpaqueColorValue);
// our Icon only takes plain hex strings, which is all tokens.ts ever provides.
function tabIcon(name: IconName) {
  return ({ color, size }: { color: ColorValue; size: number }) => (
    <Icon name={name} size={size} color={String(color)} />
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
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.ink3,
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.line },
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
