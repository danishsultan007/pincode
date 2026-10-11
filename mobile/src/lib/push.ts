// Expo push registration (MOBILE-PLAN.md §3 Push, P5). Kept separate from
// providers/PushProvider.tsx so the registration/handler logic is easy to
// unit-reason-about and so PushProvider stays a thin effect wrapper.

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from './supabase';
import { env } from './env';

// Set by the chat screen while it's focused, so the notification handler can
// suppress the in-app banner for the conversation the user is already
// looking at (MOBILE-PLAN.md §3). A plain module variable, not React state —
// the handler below is a module-level callback, not a component.
export let currentOpenChatId: string | null = null;
export function setCurrentOpenChatId(id: string | null): void {
  currentOpenChatId = id;
}

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as { conversationId?: string } | undefined;
    const isOpenChat = !!data?.conversationId && data.conversationId === currentOpenChatId;
    // In the chat the message is already on screen: no banner AND no tray entry (a hidden
    // banner alone still left the notification in the shade).
    return {
      shouldShowBanner: !isOpenChat,
      shouldShowList: !isOpenChat,
      shouldPlaySound: false,
      shouldSetBadge: false,
    };
  },
});

// Clears notifications already sitting in the shade for a conversation, called when the
// user opens that chat (they have now seen the messages).
export async function dismissNotificationsForChat(conversationId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(
      presented
        .filter((n) => {
          const d = n.request.content.data as { conversationId?: string; url?: string } | undefined;
          return d?.conversationId === conversationId || d?.url === `/chat/${conversationId}`;
        })
        .map((n) => Notifications.dismissNotificationAsync(n.request.identifier))
    );
  } catch {
    // Best effort only.
  }
}

// Build-time project id from app.config.ts (extra.eas.projectId), falling back to the env var.
function easProjectId(): string {
  const fromConfig = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  return fromConfig || env.easProjectId;
}

// Whether this runtime can register for push at all (MOBILE-PLAN.md §3):
// never on web, never in a simulator/emulator, never in Expo Go on Android
// (unsupported since SDK 53), and never without an EAS project id.
export function canRegisterForPush(): boolean {
  if (Platform.OS === 'web') return false;
  if (!Device.isDevice) return false;
  if (Platform.OS === 'android' && Constants.executionEnvironment === 'storeClient') return false;
  if (!easProjectId()) return false;
  return true;
}

// Requests permission, registers the Android notification channel, fetches
// the Expo push token and upserts it server-side. Resolves to null (never
// throws) when registration isn't possible or is refused — push is optional.
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!canRegisterForPush()) return null;

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') return null;

    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId: easProjectId() });
    const token = tokenResponse.data;

    const { error } = await supabase.rpc('register_push_token', {
      p_token: token,
      p_platform: Platform.OS,
    });
    if (error) throw error;

    return token;
  } catch (err) {
    if (__DEV__) console.warn('Push registration failed', err);
    return null;
  }
}

// Deletes every push token row owned by this device's signed-in user (the
// plan's "on sign-out, delete the token row"). Never throws — sign-out must
// proceed even if this fails (e.g. offline).
export async function unregisterPushToken(userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  try {
    await supabase.from('push_tokens').delete().eq('user_id', userId);
  } catch (err) {
    if (__DEV__) console.warn('Push token cleanup failed', err);
  }
}
