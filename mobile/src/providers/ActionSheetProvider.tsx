import React, { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import {
  registerWebActionSheetHost,
  registerWebConfirmHost,
  type ActionSheetOption,
  type ConfirmOptions,
} from '@/lib/confirm';
import { colors, radius, shadow, space } from '@/theme/tokens';

type SheetState =
  | { kind: 'actions'; title: string; options: ActionSheetOption[]; cancelLabel: string; anchor: DOMRect | null }
  | { kind: 'confirm'; title: string; message?: string; options: Required<ConfirmOptions>; resolve: (v: boolean) => void }
  | null;

const MENU_W = 240;
const EDGE = 8;
const GAP = 4;

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

// Computes the dropdown's { left, top, maxHeight? } per
// UI-REDESIGN-PLAN.md §4 (Final spec §8): right-aligned when the trigger is
// in the right half of the viewport, placed below the trigger if it fits,
// above if not, else pinned to the top and made scrollable. No anchor (or an
// anchor entirely off-screen) falls back to a centred menu.
function getMenuPos(anchor: DOMRect | null, menuH: number | null): { left: number; top: number; maxHeight?: number } {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
  const h = menuH ?? 0;

  if (!anchor) {
    return { left: (vw - MENU_W) / 2, top: Math.max(EDGE, (vh - h) / 2) };
  }

  let left = anchor.left + anchor.width / 2 > vw / 2 ? anchor.right - MENU_W : anchor.left;
  left = clamp(left, EDGE, vw - MENU_W - EDGE);

  const below = vh - anchor.bottom - GAP - EDGE;
  const above = anchor.top - GAP - EDGE;

  if (h <= below) {
    return { left, top: anchor.bottom + GAP };
  }
  if (h <= above) {
    return { left, top: anchor.top - GAP - h };
  }
  return { left, top: EDGE, maxHeight: vh - 2 * EDGE };
}

// The one confirmation dialog used by every confirmAsync() on web and Android.
function ConfirmCard({
  title,
  message,
  options,
  onCancel,
  onConfirm,
}: {
  title: string;
  message?: string;
  options: Required<ConfirmOptions>;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <View style={styles.confirmCard} accessibilityViewIsModal>
      <Text variant="headline">{title}</Text>
      {message ? <Text variant="secondary">{message}</Text> : null}
      <View style={styles.confirmActions}>
        <Button label={options.cancelLabel} variant="ghost" onPress={onCancel} />
        <Button label={options.confirmLabel} variant={options.destructive ? 'danger' : 'primary'} onPress={onConfirm} />
      </View>
    </View>
  );
}

// Android dropdown position: opens under the touch point (flush right when the
// tap was in the right half, like a kebab menu), flips above if it would run
// off the bottom, and is centred when there was no recent touch.
function androidMenuPos(
  pt: { x: number; y: number } | null,
  menuH: number | null,
  vw: number,
  vh: number,
  insets: { top: number; bottom: number }
): { left: number; top: number; width: number; maxHeight: number } {
  const h = menuH ?? 0;
  const width = Math.min(MENU_W, vw - 2 * EDGE);
  const maxHeight = vh - insets.top - insets.bottom - 2 * EDGE;
  if (!pt) return { left: (vw - width) / 2, top: Math.max(insets.top + EDGE, (vh - h) / 2), width, maxHeight };
  const left = clamp(pt.x > vw / 2 ? pt.x + 20 - width : pt.x - 20, EDGE, vw - width - EDGE);
  const below = pt.y + 22;
  const top = below + h <= vh - insets.bottom - EDGE ? below : pt.y - 22 - h;
  return { left, top: clamp(top, insets.top + EDGE, Math.max(insets.top + EDGE, vh - insets.bottom - EDGE - h)), width, maxHeight };
}

// Registers with lib/confirm.ts (see its comment) so actionSheet()/
// confirmAsync() render an anchored dropdown / centred dialog on web instead
// of a chain of window.confirm() dialogs — those show as ugly
// "localhost:8081 says" popups that clash with the rest of the app and, for
// actionSheet(), had to be clicked through one at a time to even see every
// option. On web, actionSheet() renders as a small dropdown anchored to
// whatever element the user last pressed (captured via capture-phase
// pointerdown/keydown listeners on `document`, since call sites never pass a
// trigger element), or centred if there's no usable anchor. confirmAsync()
// renders as a centred dialog. iOS uses ActionSheetIOS and Alert; Android
// renders actionSheet() as a dropdown and confirmAsync() as the same themed
// card as web, both in a Modal (Alert.alert caps at 3 buttons and looks foreign).
export function ActionSheetProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<SheetState>(null);
  // The answer function of the confirm currently on screen. Opening anything else first
  // settles it with "no", so a caller can never be left waiting on a promise that nothing resolves.
  const pendingConfirm = useRef<((v: boolean) => void) | null>(null);
  const open = (next: Exclude<SheetState, null>) => {
    pendingConfirm.current?.(false);
    pendingConfirm.current = next.kind === 'confirm' ? next.resolve : null;
    setState(next);
  };
  const [menuH, setMenuH] = useState<number | null>(null);
  const menuRef = useRef<any>(null);
  const lastPress = useRef<{ rect: DOMRect; at: number } | null>(null);
  const lastTouch = useRef<{ x: number; y: number; at: number } | null>(null);
  const [touchPt, setTouchPt] = useState<{ x: number; y: number } | null>(null);
  const win = useWindowDimensions();
  // Real size of the Modal's full-screen host (useWindowDimensions can exclude system bars).
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const openId = useRef(0);

  // Android: Alert.alert shows at most 3 buttons (the rest, incl. Cancel, are
  // silently dropped) and can't be dismissed by Back/outside-tap, so menus with
  // 4+ options were broken. Render them as a dropdown in a Modal instead.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    registerWebActionSheetHost((title, options, cancelLabel) => {
      const t = lastTouch.current;
      setTouchPt(t && Date.now() - t.at < 3000 ? { x: t.x, y: t.y } : null);
      openId.current += 1;
      setMenuH(null);
      open({ kind: 'actions', title, options, cancelLabel, anchor: null });
    });
    // Confirmations get the same themed card as web instead of the grey system Alert.
    registerWebConfirmHost(
      (title, message, options) =>
        new Promise<boolean>((resolve) => open({ kind: 'confirm', title, message, options, resolve }))
    );
    return () => {
      pendingConfirm.current?.(false);
      pendingConfirm.current = null;
      registerWebActionSheetHost(null);
      registerWebConfirmHost(null);
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      const el = (target?.closest?.('[role="button"],button,a,[tabindex]') as Element | null) ?? target;
      if (el && typeof (el as any).getBoundingClientRect === 'function') {
        lastPress.current = { rect: el.getBoundingClientRect(), at: Date.now() };
      }
    };
    const onKeyDownCapture = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const el = document.activeElement;
      if (el && typeof (el as any).getBoundingClientRect === 'function') {
        lastPress.current = { rect: el.getBoundingClientRect(), at: Date.now() };
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDownCapture, true);

    registerWebActionSheetHost((title, options, cancelLabel) => {
      let anchor: DOMRect | null = null;
      if (lastPress.current && Date.now() - lastPress.current.at < 1500) {
        const r = lastPress.current.rect;
        const offscreen = r.right < 0 || r.bottom < 0 || r.left > window.innerWidth || r.top > window.innerHeight;
        anchor = offscreen ? null : r;
      }
      setMenuH(null);
      open({ kind: 'actions', title, options, cancelLabel, anchor });
    });
    registerWebConfirmHost(
      (title, message, options) =>
        new Promise<boolean>((resolve) => open({ kind: 'confirm', title, message, options, resolve }))
    );
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDownCapture, true);
      registerWebActionSheetHost(null);
      registerWebConfirmHost(null);
    };
  }, []);

  const dismiss = () => {
    if (state?.kind === 'confirm') state.resolve(false);
    setState(null);
  };

  // Stale-anchor guards, only while a menu/dialog is open: Escape dismisses
  // either; scrolling any scroll container outside the menu, or resizing the
  // window, dismisses the dropdown so it never floats detached from its
  // trigger.
  useEffect(() => {
    if (Platform.OS !== 'web' || !state) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    document.addEventListener('keydown', onKeyDown);

    let onResize: (() => void) | undefined;
    let onScroll: ((e: Event) => void) | undefined;
    if (state.kind === 'actions') {
      onResize = () => dismiss();
      onScroll = (e: Event) => {
        if (menuRef.current && e.target instanceof Node && menuRef.current.contains?.(e.target)) return;
        dismiss();
      };
      window.addEventListener('resize', onResize);
      document.addEventListener('scroll', onScroll, true);
    }

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (onResize) window.removeEventListener('resize', onResize);
      if (onScroll) document.removeEventListener('scroll', onScroll, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <>
      {/* Android: remember where the last touch landed (call sites never pass a
          trigger), so the menu can open next to the kebab/chip that was tapped. */}
      <View
        style={styles.touchRoot}
        collapsable={false}
        // Observe only: neither handler claims the touch. onTouchStart bubbles
        // from every child; the capture handler is a second net.
        onTouchStart={
          Platform.OS === 'android'
            ? (e) => {
                lastTouch.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, at: Date.now() };
              }
            : undefined
        }
        onStartShouldSetResponderCapture={
          Platform.OS === 'android'
            ? (e) => {
                lastTouch.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, at: Date.now() };
                return false;
              }
            : undefined
        }
      >
        {children}
      </View>
      {Platform.OS === 'android' ? (
        <Modal
          visible={state?.kind === 'actions'}
          transparent
          animationType="fade"
          statusBarTranslucent
          navigationBarTranslucent
          onRequestClose={dismiss}
        >
          <View
            style={styles.sheetHost}
            onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
          >
            {/* Tap outside (or Back) closes the menu; no Cancel row needed. */}
            <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityLabel="Dismiss" />
            {state?.kind === 'actions' ? (
              <View
                key={openId.current}
                onLayout={(e) => setMenuH(e.nativeEvent.layout.height)}
                style={[styles.dropdown, androidMenuPos(touchPt, menuH, box?.w ?? win.width, box?.h ?? win.height, insets), { opacity: menuH == null ? 0 : 1 }]}
                accessibilityRole="menu"
              >
                <ScrollView bounces={false}>
                  {state.options.map((o, i) => (
                    <Pressable
                      key={i}
                      accessibilityRole="menuitem"
                      style={({ pressed }) => [styles.dropdownRow, pressed && { backgroundColor: colors.surface2 }]}
                      onPress={() => {
                        setState(null);
                        // Run after the Modal has gone so a follow-up Alert/navigation isn't swallowed.
                        setTimeout(o.onPress, 250);
                      }}
                    >
                      <Text variant="body" style={o.destructive ? styles.destructiveText : undefined}>
                        {o.label}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}
          </View>
        </Modal>
      ) : null}
      {Platform.OS !== 'android' && state?.kind === 'actions' ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityLabel="Dismiss" />
          <View
            ref={menuRef}
            onLayout={(e) => setMenuH(e.nativeEvent.layout.height)}
            style={[styles.menu, getMenuPos(state.anchor, menuH), { opacity: menuH == null ? 0 : 1 }]}
            accessibilityRole="menu"
          >
            {state.title ? (
              <Text variant="label" style={styles.menuTitle}>
                {state.title}
              </Text>
            ) : null}
            {state.options.map((o, i) => (
              <Pressable
                key={i}
                accessibilityRole="menuitem"
                style={({ pressed, hovered }: any) => [
                  styles.menuRow,
                  (pressed || hovered) && { backgroundColor: colors.surface2 },
                ]}
                onPress={() => {
                  setState(null);
                  o.onPress();
                }}
              >
                <Text variant="body" style={o.destructive ? styles.destructiveText : undefined}>
                  {o.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      {Platform.OS === 'android' ? (
        <Modal
          visible={state?.kind === 'confirm'}
          transparent
          animationType="fade"
          statusBarTranslucent
          navigationBarTranslucent
          onRequestClose={dismiss}
        >
          <View style={[styles.confirmHost, { paddingTop: insets.top + space.s4, paddingBottom: insets.bottom + space.s4 }]}>
            <Pressable style={styles.backdrop} onPress={dismiss} accessibilityLabel="Dismiss" />
            {state?.kind === 'confirm' ? (
              <ConfirmCard
                title={state.title}
                message={state.message}
                options={state.options}
                onCancel={dismiss}
                onConfirm={() => {
                  state.resolve(true);
                  setState(null);
                }}
              />
            ) : null}
          </View>
        </Modal>
      ) : null}
      {Platform.OS !== 'android' && state?.kind === 'confirm' ? (
        <View style={styles.confirmHost} pointerEvents="box-none">
          <Pressable style={styles.backdrop} onPress={dismiss} accessibilityLabel="Dismiss" />
          <ConfirmCard
            title={state.title}
            message={state.message}
            options={state.options}
            onCancel={dismiss}
            onConfirm={() => {
              state.resolve(true);
              setState(null);
            }}
          />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: 'absolute',
    width: MENU_W,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 6,
    boxShadow: shadow.popover,
    overflow: 'auto',
  } as any,
  touchRoot: { flex: 1 },
  sheetHost: { flex: 1 },
  dropdown: {
    position: 'absolute',
    width: MENU_W,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 6,
    elevation: 12,
    overflow: 'hidden',
  },
  dropdownRow: { minHeight: 48, justifyContent: 'center', paddingHorizontal: space.s4 },
  menuTitle: { paddingHorizontal: space.s3, paddingTop: space.s2, paddingBottom: space.s1 },
  menuRow: { minHeight: 44, justifyContent: 'center', borderRadius: radius.sm, paddingHorizontal: space.s3 },
  destructiveText: { color: colors.danger },
  confirmHost: { ...StyleSheet.absoluteFill, justifyContent: 'center', alignItems: 'center', padding: space.s4 },
  confirmCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: space.s5,
    gap: space.s2,
    borderWidth: 1,
    borderColor: colors.line,
    ...(Platform.OS === 'web' ? { boxShadow: shadow.popover } : { elevation: 12 }),
  } as any,
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.s2, marginTop: space.s4 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.backdrop },
});
