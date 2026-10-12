import React, { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { markChatsDelivered } from '@/api/chat';
import { router } from 'expo-router';
import { supabase, uniqueChannel } from '@/lib/supabase';
import { currentOpenChatId } from '@/lib/push';
import { useAuth } from './AuthProvider';
import { useToast } from './ToastProvider';
import type { NotificationRow } from '@/types/models';

// In-app realtime (MOBILE-PLAN.md §3): mounted inside (tabs)/_layout.tsx
// once signed in. Two channels per user — new notifications, and changes to
// this user's conversation memberships (new chats/requests, unread counts).
// The chat screen (chat/[id].tsx) opens its own per-conversation `msg:<id>`
// channel for messages, since that only needs to run while that screen is
// mounted.
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  const queryClient = useQueryClient();
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  // "Delivered" ticks for the people writing to me: tell the server this app has synced my chats.
  // Debounced, and only while the app is in the foreground (nothing runs in the background).
  const deliverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markDelivered = useRef(() => {});
  markDelivered.current = () => {
    if (!uid || AppState.currentState !== 'active') return;
    if (deliverTimer.current) clearTimeout(deliverTimer.current);
    deliverTimer.current = setTimeout(() => {
      markChatsDelivered().catch(() => {});
    }, 1500);
  };

  useEffect(() => {
    if (!uid) return;
    markDelivered.current();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') markDelivered.current();
    });
    return () => {
      sub.remove();
      if (deliverTimer.current) clearTimeout(deliverTimer.current);
    };
  }, [uid]);

  useEffect(() => {
    if (!uid) return;

    const notifChannel = uniqueChannel(`notif:${uid}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
          queryClient.invalidateQueries({ queryKey: ['inboxCounts'] });
          const row = payload.new as NotificationRow;
          // No pop-up for the chat that is already open on screen.
          if (currentOpenChatId && row.data?.url === `/chat/${currentOpenChatId}`) return;
          toastRef.current.show(row.title, {
            actionLabel: row.data?.url ? 'Open' : undefined,
            onAction: row.data?.url ? () => router.push(row.data.url as string) : undefined,
          });
        }
      )
      .subscribe();

    const cmChannel = uniqueChannel(`cm:${uid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversation_members', filter: `user_id=eq.${uid}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
          queryClient.invalidateQueries({ queryKey: ['inboxCounts'] });
          // A new message in a chat that isn't open: mark its cached list stale
          // (open chats refetch; closed ones refetch on next open).
          queryClient.invalidateQueries({ queryKey: ['messages'] });
          markDelivered.current();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notifChannel);
      supabase.removeChannel(cmChannel);
    };
  }, [uid, queryClient]);

  return <>{children}</>;
}
