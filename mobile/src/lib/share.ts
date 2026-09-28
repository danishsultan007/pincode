// Share helpers (MOBILE-PLAN.md §7.3 ShareRow). postLink() prefers the public
// web URL (so a WhatsApp recipient without the app lands on a working page);
// falls back to the app's own deep link scheme when EXPO_PUBLIC_WEB_URL isn't set.

import { Linking, Platform, Share } from 'react-native';
import * as ExpoLinking from 'expo-linking';
import { env } from './env';

export function postLink(id: string): string {
  if (env.webUrl) return `${env.webUrl.replace(/\/$/, '')}/post/${id}`;
  return ExpoLinking.createURL(`/post/${id}`);
}

export function userLink(username: string): string {
  if (env.webUrl) return `${env.webUrl.replace(/\/$/, '')}/user/${username}`;
  return ExpoLinking.createURL(`/user/${username}`);
}

// Opens the WhatsApp app/web composer with prefilled text. Falls back to
// wa.me (which works even without the app installed, via WhatsApp Web).
export async function shareWhatsApp(title: string, link: string): Promise<void> {
  const text = `${title} ${link}`;
  const appUrl = `whatsapp://send?text=${encodeURIComponent(text)}`;
  const webUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
  try {
    if (Platform.OS !== 'web') {
      const canOpen = await Linking.canOpenURL(appUrl);
      if (canOpen) {
        await Linking.openURL(appUrl);
        return;
      }
    }
  } catch {
    // fall through to the web URL
  }
  await Linking.openURL(webUrl);
}

// Native share sheet (Share.share works on iOS/Android/web-via-RNW no-op).
export async function shareNative(title: string, link: string): Promise<void> {
  if (Platform.OS === 'web') {
    // react-native-web has no Share module; fall back to WhatsApp/copy flows
    // from the caller. Nothing to do here.
    return;
  }
  await Share.share({ message: `${title} ${link}`, url: link, title });
}
