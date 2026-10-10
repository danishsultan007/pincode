import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as chatApi from '@/api/chat';
import * as notificationsApi from '@/api/notifications';
import { useAuth } from '@/providers/AuthProvider';
import { invalidateAfter } from '@/lib/invalidate';
import type { ConversationRow, InboxCounts, Message, NotificationRow } from '@/types/models';

// Inbox tab + chat + notifications data (MOBILE-PLAN.md §4 Inbox tab / Chat,
// §3 Notifications design, P5). Query keys: ['conversations', box],
// ['inboxCounts'], ['messages', conversationId], ['notifications'] — these
// are the keys RealtimeProvider invalidates on postgres_changes events.

export function useConversations(box: chatApi.InboxBox) {
  return useQuery<ConversationRow[]>({
    queryKey: ['conversations', box],
    queryFn: () => chatApi.listConversations(box),
  });
}

export function useInboxCounts() {
  return useQuery<InboxCounts>({
    queryKey: ['inboxCounts'],
    queryFn: chatApi.inboxCounts,
  });
}

export function useStartConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (otherUserId: string) => chatApi.startConversation(otherUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['inboxCounts'] });
    },
  });
}

export function useRespondToRequest(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (action: 'accept' | 'decline' | 'block') => chatApi.respondToRequest(conversationId, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['inboxCounts'] });
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
    },
  });
}

export function useConversation(id: string | undefined) {
  return useQuery({
    queryKey: ['conversation', id],
    queryFn: () => chatApi.getConversation(id as string),
    enabled: !!id,
  });
}

export function useChatProfile(id: string | null | undefined) {
  return useQuery({
    queryKey: ['chat-profile', id],
    queryFn: () => chatApi.getProfileById(id as string),
    enabled: !!id,
  });
}

export function useMyMembership(conversationId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['conversation-member', conversationId, user?.id],
    queryFn: () => chatApi.getMyMembership(conversationId as string, user?.id as string),
    enabled: !!conversationId && !!user?.id,
  });
}

export function useMessages(conversationId: string | undefined) {
  const queryClient = useQueryClient();
  const query = useQuery<Message[]>({
    queryKey: ['messages', conversationId],
    queryFn: () => chatApi.listMessages(conversationId as string),
    enabled: !!conversationId,
    // The realtime channel only runs while the chat is open, so anything cached
    // from an earlier visit may be missing messages: always refetch on open
    // (the cached list still shows instantly meanwhile).
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const loadOlder = async () => {
    const current = queryClient.getQueryData<Message[]>(['messages', conversationId]) ?? [];
    const oldest = current[current.length - 1];
    if (!oldest || !conversationId) return;
    const older = await chatApi.listMessages(conversationId, oldest.created_at);
    if (older.length) {
      queryClient.setQueryData<Message[]>(['messages', conversationId], (prev) => [...(prev ?? []), ...older]);
    }
    return older.length;
  };

  return { ...query, loadOlder };
}

// Signed link for a private chat photo. Links last an hour, so cache for 50
// minutes; the bubble refetches when an image fails to load. A missing file
// (expired by the retention job) resolves to an error, shown as "Photo expired".
export function useAttachmentUrl(path: string | null | undefined) {
  return useQuery<string>({
    queryKey: ['chat-attachment', path],
    queryFn: () => chatApi.signAttachment(path as string),
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: false,
  });
}

export function useMarkConversationRead(conversationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => chatApi.markConversationRead(conversationId as string),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['inboxCounts'] });
    },
  });
}

export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ body, attachment }: { body: string; attachment?: chatApi.ChatAttachment | null }) =>
      chatApi.sendMessage(conversationId, body, attachment),
    onSuccess: (message) => {
      queryClient.setQueryData<Message[]>(['messages', conversationId], (prev) =>
        prev && prev.some((m) => m.id === message.id) ? prev : [message, ...(prev ?? [])]
      );
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export function useSetMuted(conversationId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (muted: boolean) => chatApi.setMuted(conversationId, user?.id as string, muted),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation-member', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['inboxCounts'] });
    },
  });
}

export function useBlockInChat() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (otherUserId: string) => chatApi.blockUser(user?.id as string, otherUserId),
    onSuccess: () => {
      invalidateAfter(queryClient, 'block');
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['inboxCounts'] });
    },
  });
}

export function useNotifications() {
  const queryClient = useQueryClient();
  const query = useQuery<NotificationRow[]>({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.listNotifications(),
  });

  const loadOlder = async () => {
    const current = queryClient.getQueryData<NotificationRow[]>(['notifications']) ?? [];
    const oldest = current[current.length - 1];
    if (!oldest) return 0;
    const older = await notificationsApi.listNotifications(oldest.created_at);
    if (older.length) {
      queryClient.setQueryData<NotificationRow[]>(['notifications'], (prev) => [...(prev ?? []), ...older]);
    }
    return older.length;
  };

  return { ...query, loadOlder };
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: notificationsApi.markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['inboxCounts'] });
    },
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationsApi.markNotificationRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['inboxCounts'] });
    },
  });
}
