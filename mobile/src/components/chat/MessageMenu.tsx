import React, { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import { colors, radius, shadow, space } from '@/theme/tokens';
import { REACTIONS, ReactionCode } from '@/lib/constants';

export type MessageMenuOption = { label: string; destructive?: boolean; onPress: () => void };

export type MessageMenuTarget = {
  x: number; // where the finger was (window coordinates)
  y: number;
  canReact: boolean;
  myReaction: string | null;
  options: MessageMenuOption[];
  onReact: (code: ReactionCode) => void;
};

const CELL = 44;
const STRIP_PAD = 6;
const W = REACTIONS.length * CELL + STRIP_PAD * 2;
const EDGE = 8;

// Long-press menu for a chat message: an emoji strip for reacting (one reaction per person) above
// the usual actions (report, delete for me / for everyone). It opens next to the finger, closes as
// soon as something is chosen, and also closes on a tap outside it or the Back button.
export function MessageMenu({ target, onClose }: { target: MessageMenuTarget | null; onClose: () => void }) {
  const win = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const vw = box?.w ?? win.width;
  const vh = box?.h ?? win.height;

  // The measured height belongs to ONE opening of the menu (keyed), so a reopen never reuses the
  // previous menu's height and never loses its own measurement to a reset.
  const openKey = target ? `${target.x}:${target.y}:${target.options.length}:${target.canReact}` : 'closed';
  const [measured, setMeasured] = useState<{ key: string; h: number } | null>(null);
  const height = measured && measured.key === openKey ? measured.h : null;

  let pos: { left: number; top: number } | null = null;
  if (target) {
    const h = height ?? 0;
    const left = Math.min(Math.max(target.x - W / 2, EDGE), Math.max(EDGE, vw - W - EDGE));
    const above = target.y - h - 16;
    const top = above >= insets.top + EDGE ? above : Math.min(target.y + 16, vh - insets.bottom - EDGE - h);
    pos = { left, top: Math.max(top, insets.top + EDGE) };
  }

  return (
    <Modal
      visible={!!target}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={StyleSheet.absoluteFill} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
        {target && pos ? (
          <View
            onLayout={(e) => setMeasured({ key: openKey, h: e.nativeEvent.layout.height })}
            style={[styles.card, pos, { opacity: height == null ? 0 : 1, maxHeight: vh - insets.top - insets.bottom - 2 * EDGE }]}
            accessibilityRole="menu"
          >
            {target.canReact ? (
              <View style={styles.strip}>
                {REACTIONS.map((r) => {
                  const mine = target.myReaction === r.code;
                  return (
                    <Pressable
                      key={r.code}
                      accessibilityRole="menuitem"
                      accessibilityLabel={`React with ${r.code}`}
                      accessibilityState={{ selected: mine }}
                      onPress={() => {
                        onClose();
                        target.onReact(r.code);
                      }}
                      style={({ pressed }) => [styles.cell, mine ? styles.cellMine : null, pressed ? { backgroundColor: colors.surface2 } : null]}
                    >
                      <Text style={styles.glyph}>{r.glyph}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            {target.canReact && target.options.length ? <View style={styles.divider} /> : null}
            <ScrollView bounces={false}>
              {target.options.map((o, i) => (
                <Pressable
                  key={i}
                  accessibilityRole="menuitem"
                  onPress={() => {
                    onClose();
                    // After the menu has gone, so a follow-up dialog or navigation is not swallowed.
                    setTimeout(o.onPress, Platform.OS === 'ios' ? 350 : 250);
                  }}
                  style={({ pressed }) => [styles.row, pressed ? { backgroundColor: colors.surface2 } : null]}
                >
                  <Text variant="body" style={o.destructive ? styles.destructive : undefined}>
                    {o.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    width: W,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    ...((Platform.OS === 'android' ? { elevation: 12 } : { boxShadow: shadow.popover }) as object),
  },
  strip: { flexDirection: 'row', padding: STRIP_PAD },
  cell: { width: CELL, height: CELL, borderRadius: CELL / 2, alignItems: 'center', justifyContent: 'center' },
  cellMine: { backgroundColor: colors.accentSoft },
  glyph: { fontSize: 26, lineHeight: 32 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginHorizontal: space.s3 },
  row: { minHeight: 48, justifyContent: 'center', paddingHorizontal: space.s4 },
  destructive: { color: colors.danger },
});
