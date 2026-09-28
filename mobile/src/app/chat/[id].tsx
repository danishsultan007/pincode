import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { IconButton } from '@/components/ui/IconButton';
import { Banner } from '@/components/ui/Banner';
import { CommentComposer } from '@/components/comments/CommentComposer';
import { RequestBar } from '@/components/chat/RequestBar';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import {
  useBlockInChat,
  useChatProfile,
  useConversation,
  useMarkConversationRead,
  useMessages,
  useMyMembership,
  useRespondToRequest,
  useSendMessage,
  useSetMuted,
} from '@/hooks/useInbox';
import { supabase, uniqueChannel } from '@/lib/supabase';
import { setCurrentOpenChatId } from '@/lib/push';
import { actionSheet, confirmAsync } from '@/lib/confirm';
import { messageFor } from '@/lib/errors';
import { copy } from '@/lib/copy';
import { space } from '@/theme/tokens';
import type { Message } from '@/types/models';
import { goBack } from '@/lib/nav';

// DM thread (MOBILE-PLAN.md §4 Chat, §2.6). Inverted FlatList so newest
// messages sit at the bottom without manual scroll management; the array
// itself stays newest-first (matches `messages desc limit 50` and how
// loadOlder appends further-back pages) which is exactly what `inverted`
// wants.
export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { user, me } = useAuth();
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const isFocusedRef = useRef(false);

  const { data: conversation, isLoading: conversationLoading } = useConversation(id);
  const membership = useMyMembership(id);
  const otherUserId =
    conversation && conversation.kind === 'direct'
      ? conversation.user_low === user?.id
        ? conversation.user_high
        : conversation.user_low
      : null;
  const { data: otherProfile } = useChatProfile(otherUserId);
  const { data: messages, loadOlder } = useMessages(id);

  const sendMessage = useSendMessage(id ?? '');
  const respond = useRespondToRequest(id ?? '');
  const markRead = useMarkConversationRead(id);
  const setMuted = useSetMuted(id ?? '');
  const blockInChat = useBlockInChat();

  // Realtime: append new messages as they arrive (MOBILE-PLAN.md §3). The
  // chat screen owns this channel (unlike notifications/conversation_members,
  // which RealtimeProvider subscribes to for the whole signed-in session)
  // because it should only run while this screen is mounted.
  useEffect(() => {
    if (!id) return;
    const channel = uniqueChannel(`msg:${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
        (payload) => {
          const message = payload.new as Message;
          queryClient.setQueryData<Message[]>(['messages', id], (prev) =>
            prev && prev.some((m) => m.id === message.id) ? prev : [message, ...(prev ?? [])]
          );
          if (isFocusedRef.current) markRead.mutate();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, queryClient]);

  // Mark read on focus, and remember the open chat id so PushProvider's
  // notification handler suppresses the banner for this conversation.
  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      if (id) {
        setCurrentOpenChatId(id);
        markRead.mutate();
      }
      return () => {
        isFocusedRef.current = false;
        setCurrentOpenChatId(null);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id])
  );

  if (conversationLoading) return null;
  if (!conversation) {
    return (
      <Screen edges={['top']}>
        <Header left={<IconButton name="chevron-left" label="Back" onPress={() => goBack()} />} />
      </Screen>
    );
  }

  const isSystem = conversation.kind === 'system';
  const isPending = conversation.status === 'pending';
  const isDeclined = conversation.status === 'declined';
  const iAmSender = conversation.created_by === user?.id;
  const iAmRecipient = isPending && !iAmSender;
  // The server (messages_prepare) allows the sender exactly one message
  // while a conversation is pending, then raises request_pending on a
  // second. `isPending && iAmSender` alone is true from the moment the
  // conversation is CREATED — before any message exists — so it must not
  // disable the composer until that one message has actually been sent, or
  // the sender could never send their first message at all.
  const alreadySentPendingRequest = isPending && iAmSender && !!messages?.some((m) => m.sender_id === user?.id);
  const title = isSystem ? copy.inbox.pincodeTeam : otherProfile?.display_name || 'Chat';
  // MOBILE-PLAN.md §6 Moderation flow #4: disable the composer and explain
  // why instead of letting the send fail silently under RLS.
  const isSuspended =
    !!me &&
    (me.profile.ban_permanent || (!!me.profile.banned_until && new Date(me.profile.banned_until) > new Date()));

  const handleSend = () => {
    const text = body.trim();
    if (!text) return;
    sendMessage.mutate(text, {
      onSuccess: () => setBody(''),
      onError: (err) => toast.show(messageFor(err)),
    });
  };

  const handleRespond = async (action: 'accept' | 'decline' | 'block') => {
    setBusy(true);
    try {
      await respond.mutateAsync(action);
      if (action !== 'accept') goBack();
    } catch (err) {
      toast.show(messageFor(err));
    } finally {
      setBusy(false);
    }
  };

  const openMenu = () => {
    if (isSystem) return;
    actionSheet('Chat', [
      { label: copy.chat.viewProfile, onPress: () => otherProfile?.username && router.push(`/user/${otherProfile.username}`) },
      {
        label: membership.data?.muted ? copy.chat.unmute : copy.chat.mute,
        onPress: () => setMuted.mutate(!membership.data?.muted, { onError: (err) => toast.show(messageFor(err)) }),
      },
      {
        label: copy.chat.block,
        destructive: true,
        onPress: async () => {
          if (!otherUserId) return;
          const ok = await confirmAsync(copy.chat.block, undefined, { destructive: true, confirmLabel: copy.chat.block });
          if (!ok) return;
          blockInChat.mutate(otherUserId, { onError: (err) => toast.show(messageFor(err)) });
        },
      },
      {
        label: copy.chat.reportUser,
        onPress: () => {
          if (!otherUserId) return;
          router.push({ pathname: '/report', params: { targetType: 'user', targetId: otherUserId, conversationId: id } });
        },
      },
    ]);
  };

  return (
    <Screen edges={['top']}>
      <Header
        title={title}
        left={<IconButton name="chevron-left" label="Back" onPress={() => goBack()} />}
        right={!isSystem ? <IconButton name="more" label="More actions" onPress={openMenu} /> : undefined}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
      <FlatList
        data={messages ?? []}
        inverted
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <MessageBubble message={item} mine={item.sender_id === user?.id} />}
        contentContainerStyle={styles.list}
        onEndReachedThreshold={0.4}
        onEndReached={() => loadOlder()}
      />

      {isSystem ? null : isDeclined ? (
        <Banner tone="neutral" text={copy.chat.notDelivered} />
      ) : iAmRecipient ? (
        <RequestBar
          busy={busy}
          onAccept={() => handleRespond('accept')}
          onDecline={() => handleRespond('decline')}
          onBlock={() => handleRespond('block')}
        />
      ) : isSuspended ? (
        <Banner
          tone="warn"
          text={
            me?.profile.ban_permanent
              ? copy.moderation.permanentlyBanned
              : copy.moderation.suspendedUntil(new Date(me!.profile.banned_until as string).toLocaleDateString())
          }
        />
      ) : (
        <>
          {alreadySentPendingRequest ? <Banner tone="neutral" text={copy.chat.waitingForAcceptBanner} /> : null}
          <CommentComposer
            value={body}
            onChangeText={setBody}
            onSubmit={handleSend}
            placeholder={alreadySentPendingRequest ? copy.chat.waitingForAccept : copy.chat.messagePlaceholder}
            disabled={alreadySentPendingRequest}
          />
        </>
      )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingVertical: space.s3, flexGrow: 1, justifyContent: 'flex-end' },
});
