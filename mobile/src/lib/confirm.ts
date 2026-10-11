import { Alert, ActionSheetIOS, Platform } from 'react-native';
import { copy } from './copy';

export type ConfirmOptions = {
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

export type ActionSheetOption = {
  label: string;
  destructive?: boolean;
  onPress: () => void;
};

// On native, `window.confirm`/chained dialogs don't exist and Alert.alert /
// ActionSheetIOS are the right idiomatic UI. On web there's no equivalent
// native list picker, so ActionSheetProvider (mounted once in
// app/_layout.tsx) renders an anchored dropdown / centred dialog on web and
// registers itself here —
// these two functions are called as plain imperative functions from many
// non-hook call sites (menu handlers, confirm-before-delete, etc.), so the
// provider can't be reached via a hook; it reaches back through this module
// instead, the same way lib/push.ts's `currentOpenChatId` bridges into
// PushProvider.
let webConfirmHost: ((title: string, message: string | undefined, options: Required<ConfirmOptions>) => Promise<boolean>) | null =
  null;
let webActionSheetHost: ((title: string, options: ActionSheetOption[], cancelLabel: string) => void) | null = null;

export function registerWebConfirmHost(fn: typeof webConfirmHost): void {
  webConfirmHost = fn;
}
export function registerWebActionSheetHost(fn: typeof webActionSheetHost): void {
  webActionSheetHost = fn;
}

export function confirmAsync(title: string, message?: string, options: ConfirmOptions = {}): Promise<boolean> {
  const confirmLabel = options.confirmLabel ?? 'Confirm';
  const cancelLabel = options.cancelLabel ?? copy.common.cancel;
  const destructive = !!options.destructive;

  if (Platform.OS === 'web') {
    if (webConfirmHost) return webConfirmHost(title, message, { confirmLabel, cancelLabel, destructive });
    // Provider hasn't mounted yet (should be near-instant on app start) —
    // fall back rather than silently doing nothing.
    const text = message ? `${title}\n\n${message}` : title;
    return Promise.resolve(typeof window !== 'undefined' ? window.confirm(text) : false);
  }

  // Android: the themed card from ActionSheetProvider (same look as web).
  if (Platform.OS === 'android' && webConfirmHost) return webConfirmHost(title, message, { confirmLabel, cancelLabel, destructive });

  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
        {
          text: confirmLabel,
          style: destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      // Android: tapping outside / Back dismisses instead of trapping the user.
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}

// `ActionSheetIOS` on iOS; the registered ActionSheetProvider sheet on web and
// Android (Alert.alert only shows 3 buttons, so it is just a fallback).
export function actionSheet(title: string, options: ActionSheetOption[], cancelLabel = copy.common.cancel): void {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: [...options.map((o) => o.label), cancelLabel],
        cancelButtonIndex: options.length,
        destructiveButtonIndex: options
          .map((o, i) => (o.destructive ? i : -1))
          .filter((i) => i >= 0),
      },
      (index) => {
        if (index >= 0 && index < options.length) options[index].onPress();
      }
    );
    return;
  }

  if (Platform.OS === 'web') {
    if (webActionSheetHost) {
      webActionSheetHost(title, options, cancelLabel);
      return;
    }
    for (const option of options) {
      // eslint-disable-next-line no-alert
      if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${option.label}?`)) {
        option.onPress();
        return;
      }
    }
    return;
  }

  // Android: the provider's bottom sheet (Alert.alert caps at 3 buttons).
  if (webActionSheetHost) {
    webActionSheetHost(title, options, cancelLabel);
    return;
  }

  Alert.alert(
    title,
    undefined,
    [
      ...options.map((o) => ({
        text: o.label,
        style: o.destructive ? ('destructive' as const) : ('default' as const),
        onPress: o.onPress,
      })),
      { text: cancelLabel, style: 'cancel' as const },
    ]
  );
}
