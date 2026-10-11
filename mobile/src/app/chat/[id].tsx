import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, FlatList, KeyboardAvoidingView, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { IconButton } from '@/components/ui/IconButton';
import { Banner } from '@/components/ui/Banner';
import { BottomSafeArea } from '@/components/ui/BottomSafeArea';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CommentComposer } from '@/components/comments/CommentComposer';
import { RequestBar } from '@/components/chat/RequestBar';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { PhotoViewer } from '@/components/chat/PhotoViewer';
import { pickChatImage, type PreparedImage } from '@/lib/prepareImage';
import * as chatApi from '@/api/chat';
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
  useDeleteMessage,
  useSendMessage,
  useSetMuted,
} from '@/hooks/useInbox';
import { supabase, uniqueChannel } from '@/lib/supabase';
import { dismissNotificationsForChat, setCurrentOpenChatId } from '@/lib/push';
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
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const isFocusedRef = useRef(false);
  // A picked photo waits in the composer until sent. uploadedPath remembers a finished
  // upload so a retry after a failed send does not upload the same photo twice.
  const [photo, setPhoto] = useState<PreparedImage | null>(null);
  const [photoSending, setPhotoSending] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const uploadedPath = useRef<string | null>(null);

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
  const deleteMessage = useDeleteMessage(id ?? '');
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
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
        (payload) => {
          const message = payload.new as Message;
          queryClient.setQueryData<Message[]>(['messages', id], (prev) =>
            (prev ?? []).map((m) => (m.id === message.id ? { ...m, ...message } : m))
          );
        }
      )
      .subscribe((status) => {
        // Messages sent between the initial fetch and the channel going live
        // (or while it reconnects) are never delivered as events: refetch once
        // the subscription is confirmed so nothing is missed.
        if (status === 'SUBSCRIBED') queryClient.invalidateQueries({ queryKey: ['messages', id] });
      });

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, queryClient]);

  // Back in the foreground with this chat still open: clear what arrived meanwhile.
  useEffect(() => {
    if (!id) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && isFocusedRef.current) dismissNotificationsForChat(id);
    });
    return () => sub.remove();
  }, [id]);

  // Mark read on focus, and remember the open chat id so PushProvider's
  // notification handler suppresses the banner for this conversation.
  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      if (id) {
        setCurrentOpenChatId(id);
        dismissNotificationsForChat(id);
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

  const handleAttach = async () => {
    try {
      const picked = await pickChatImage();
      if (!picked) return;
      uploadedPath.current = null;
      setPhoto(picked);
    } catch (err) {
      toast.show(messageFor(err));
    }
  };

  const handleRemovePhoto = () => {
    if (uploadedPath.current) chatApi.deleteUnsentAttachment(uploadedPath.current).catch(() => {});
    uploadedPath.current = null;
    setPhoto(null);
  };

  const handleSend = async () => {
    const text = body.trim();
    if (!text && !photo) return;
    if (!photo) {
      sendMessage.mutate(
        { body: text },
        {
          onSuccess: () => setBody(''),
          onError: (err) => toast.show(messageFor(err)),
        }
      );
      return;
    }
    if (photoSending || !id || !user) return;
    setPhotoSending(true);
    try {
      if (!uploadedPath.current) uploadedPath.current = await chatApi.uploadChatImage(id, user.id, photo.bytes, photo.mime);
      await sendMessage.mutateAsync({
        body: text,
        attachment: { path: uploadedPath.current, width: photo.width, height: photo.height },
      });
      setBody('');
      setPhoto(null);
      uploadedPath.current = null;
    } catch (err) {
      const e = err as { code?: string; message?: string };
      if (e?.code === '23505') {
        // The send went through but its response was lost: the photo is already in the chat.
        queryClient.invalidateQueries({ queryKey: ['messages', id] });
        setBody('');
        setPhoto(null);
        uploadedPath.current = null;
      } else {
        // The saved upload is gone (the 24 h orphan clean-up removed it): upload afresh next time.
        if (e?.message?.includes('bad_attachment')) uploadedPath.current = null;
        toast.show(
          e?.message?.startsWith('upload_failed: ')
            ? `Photo upload failed (${e.message.slice('upload_failed: '.length)})`
            : messageFor(err)
        );
      }
    } finally {
      setPhotoSending(false);
    }
  };

  const DELETE_WINDOW_MS = 24 * 60 * 60 * 1000;

  // Long-press a message: delete for me (anyone), delete for everyone (sender only, and only
  // within 24 hours of sending), or report (other people's messages).
  const messageMenu = (m: Message) => {
    const mine = m.sender_id === user?.id;
    const options: { label: string; destructive?: boolean; onPress: () => void }[] = [];
    if (!mine && !m.deleted_at) {
      options.push({
        label: copy.chat.reportMessage,
        onPress: () =>
          router.push({
            pathname: '/report',
            params: { targetType: 'message', targetId: m.id, userId: m.sender_id ?? '', conversationId: id },
          }),
      });
    }
    options.push({
      label: copy.chat.deleteForMe,
      destructive: true,
      onPress: () =>
        deleteMessage.mutate(
          { messageId: m.id, scope: 'me' },
          { onSuccess: () => toast.show(copy.chat.deletedForMeToast), onError: (err) => toast.show(messageFor(err)) }
        ),
    });
    const withinWindow = Date.now() - new Date(m.created_at).getTime() < DELETE_WINDOW_MS;
    if (mine && !m.deleted_at && withinWindow) {
      options.push({
        label: copy.chat.deleteForEveryone,
        destructive: true,
        onPress: async () => {
          const ok = await confirmAsync(copy.chat.deleteForEveryone, 'This removes the message for everyone in the chat. This can’t be undone.', {
            destructive: true,
            confirmLabel: copy.chat.deleteForEveryone,
          });
          if (!ok) return;
          deleteMessage.mutate(
            { messageId: m.id, scope: 'everyone' },
            { onSuccess: () => toast.show(copy.chat.deletedForEveryoneToast), onError: (err) => toast.show(messageFor(err)) }
          );
        },
      });
    }
    actionSheet(copy.chat.messageOptions, options);
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
      {/* behavior="padding" on both platforms: under edge-to-edge Android the
          window may not resize for the keyboard. KeyboardAvoidingView measures
          its frame relative to its parent (Screen's inner View), whose top sits
          at the safe-area top inset (the Header is inside that parent, so it is
          already part of frame.y). The offset must therefore equal the parent's
          absolute top = insets.top. If the window does resize, the measured
          overlap is 0 and padding adds nothing. */}
      <KeyboardAvoidingView style={styles.flex} behavior="padding" keyboardVerticalOffset={insets.top}>
      <FlatList
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        data={messages ?? []}
        inverted
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const mine = item.sender_id === user?.id;
          return (
            <MessageBubble
              message={item}
              mine={mine}
              senderName={otherProfile?.display_name}
              onOpenPhoto={setViewerUri}
              onLongPress={item.is_system ? undefined : messageMenu}
            />
          );
        }}
        contentContainerStyle={styles.list}
        onEndReachedThreshold={0.4}
        onEndReached={() => loadOlder()}
      />

      {isSystem ? null : (
      <BottomSafeArea>
      {isDeclined ? (
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
            disabled={alreadySentPendingRequest || photoSending}
            onAttach={conversation.status === 'accepted' ? handleAttach : undefined}
            attachment={photo ? { previewUri: photo.previewUri, sending: photoSending } : null}
            onRemoveAttachment={handleRemovePhoto}
          />
        </>
      )}
      </BottomSafeArea>
      )}
      </KeyboardAvoidingView>
      <PhotoViewer uri={viewerUri} onClose={() => setViewerUri(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingVertical: space.s3, paddingHorizontal: space.s1, flexGrow: 1, justifyContent: 'flex-end' },
});
