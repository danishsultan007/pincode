import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
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

// Registers with lib/confirm.ts (see its comment) so actionSheet()/
// confirmAsync() render an anchored dropdown / centred dialog on web instead
// of a chain of window.confirm() dialogs — those show as ugly
// "localhost:8081 says" popups that clash with the rest of the app and, for
// actionSheet(), had to be clicked through one at a time to even see every
// option. On web, actionSheet() renders as a small dropdown anchored to
// whatever element the user last pressed (captured via capture-phase
// pointerdown/keydown listeners on `document`, since call sites never pass a
// trigger element), or centred if there's no usable anchor. confirmAsync()
// renders as a centred dialog. Native (iOS ActionSheetIOS, Android
// Alert.alert) is unaffected — this provider only registers itself on web.
export function ActionSheetProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SheetState>(null);
  const [menuH, setMenuH] = useState<number | null>(null);
  const menuRef = useRef<any>(null);
  const lastPress = useRef<{ rect: DOMRect; at: number } | null>(null);

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
      setState({ kind: 'actions', title, options, cancelLabel, anchor });
    });
    registerWebConfirmHost(
      (title, message, options) =>
        new Promise<boolean>((resolve) => setState({ kind: 'confirm', title, message, options, resolve }))
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
      {children}
      {state?.kind === 'actions' ? (
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
      {state?.kind === 'confirm' ? (
        <View style={styles.confirmHost} pointerEvents="box-none">
          <Pressable style={styles.backdrop} onPress={dismiss} accessibilityLabel="Dismiss" />
          <View style={styles.confirmCard}>
            <Text variant="headline">{state.title}</Text>
            {state.message ? <Text variant="secondary">{state.message}</Text> : null}
            <View style={styles.confirmActions}>
              <Button label={state.options.cancelLabel} variant="ghost" onPress={dismiss} />
              <Button
                label={state.options.confirmLabel}
                variant={state.options.destructive ? 'danger' : 'primary'}
                onPress={() => {
                  state.resolve(true);
                  setState(null);
                }}
              />
            </View>
          </View>
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
    boxShadow: shadow.popover,
  } as any,
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.s2, marginTop: space.s4 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.backdrop },
});
