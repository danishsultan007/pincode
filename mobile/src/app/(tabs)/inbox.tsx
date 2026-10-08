import React, { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { Segmented } from '@/components/ui/Segmented';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConversationRow } from '@/components/chat/ConversationRow';
import { NotificationRow } from '@/components/notifications/NotificationRow';
import {
  useConversations,
  useInboxCounts,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '@/hooks/useInbox';
import { useToast } from '@/providers/ToastProvider';
import { messageFor } from '@/lib/errors';
import { copy } from '@/lib/copy';
import { space } from '@/theme/tokens';
import type { ConversationRow as ConversationRowModel, NotificationRow as NotificationRowModel } from '@/types/models';

type InboxTabValue = 'chats' | 'requests' | 'notifications';

// Inbox tab: Chats · Requests (n) · Notifications (n) (MOBILE-PLAN.md §4).
export default function InboxTab() {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<InboxTabValue>('chats');

  const counts = useInboxCounts();
  const chats = useConversations('chats');
  const requests = useConversations('requests');
  const notifications = useNotifications();
  const markAllRead = useMarkAllNotificationsRead();
  const markRead = useMarkNotificationRead();

  const activeQuery = tab === 'chats' ? chats : tab === 'requests' ? requests : notifications;

  const onRefresh = useCallback(() => {
    chats.refetch();
    requests.refetch();
    notifications.refetch();
    counts.refetch();
  }, [chats, requests, notifications, counts]);

  // The badge counts and lists refetch on focus (MOBILE-PLAN.md §3
  // "Badges") in addition to the realtime invalidations RealtimeProvider
  // triggers while this tab isn't focused.
  useFocusEffect(
    useCallback(() => {
      onRefresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const openConversation = (conversation: ConversationRowModel) => router.push(`/chat/${conversation.id}`);

  const openNotification = async (notification: NotificationRowModel) => {
    if (!notification.read_at) {
      markRead.mutate(notification.id, { onError: (err) => toast.show(messageFor(err)) });
    }
    if (notification.data?.url) router.push(notification.data.url);
  };

  const handleMarkAllRead = () => {
    markAllRead.mutate(undefined, { onError: (err) => toast.show(messageFor(err)) });
  };

  return (
    <Screen>
      <Header
        large
        title="Inbox"
        right={
          tab === 'notifications' ? (
            <Button label={copy.inbox.markAllRead} size="sm" variant="text" onPress={handleMarkAllRead} />
          ) : undefined
        }
      />
      <View style={styles.segmentWrap}>
        <Segmented
          full
          value={tab}
          onChange={setTab}
          options={[
            { value: 'chats', label: copy.inbox.chats },
            { value: 'requests', label: copy.inbox.requests, badge: counts.data?.requests },
            { value: 'notifications', label: copy.inbox.notifications, badge: counts.data?.notifications },
          ]}
        />
      </View>

      {tab === 'notifications' ? (
        <FlatList
          data={notifications.data ?? []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <NotificationRow notification={item} onPress={() => openNotification(item)} />}
          contentContainerStyle={styles.list}
          onEndReachedThreshold={0.4}
          onEndReached={() => notifications.loadOlder()}
          refreshControl={<RefreshControl refreshing={activeQuery.isFetching} onRefresh={onRefresh} />}
          ListEmptyComponent={
            !notifications.isLoading ? (
              <EmptyState title="No notifications yet" text="Replies, answers and updates will show up here." />
            ) : null
          }
        />
      ) : (
        <FlatList
          data={(tab === 'chats' ? chats.data : requests.data) ?? []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ConversationRow conversation={item} onPress={() => openConversation(item)} />}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={activeQuery.isFetching} onRefresh={onRefresh} />}
          ListEmptyComponent={
            !activeQuery.isLoading ? (
              <EmptyState
                title={tab === 'requests' ? 'No requests' : 'No chats yet'}
                text={
                  tab === 'requests'
                    ? 'Message requests from people you have not chatted with show up here.'
                    : 'Message someone from their profile to start a chat.'
                }
              />
            ) : null
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  segmentWrap: { paddingHorizontal: space.s4, paddingTop: space.s1, paddingBottom: space.s3 },
  list: { paddingBottom: space.s7 },
});
