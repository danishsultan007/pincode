import React, { useRef, useState } from 'react';
import { Keyboard, Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import { Icon } from '@/components/ui/Icon';
import { colors, radius, shadow, space } from '@/theme/tokens';
import { REACTIONS, ReactionCode } from '@/lib/constants';
import type { ReactionCounts } from '@/types/models';

export type ReactionBarProps = {
  counts: ReactionCounts;
  mine: ReactionCode[];
  onToggle: (code: ReactionCode) => void;
};

const CELL = 44; // one emoji in the picker
const PICKER_PAD = 6;
const PICKER_W = REACTIONS.length * CELL + PICKER_PAD * 2;
const PICKER_H = CELL + PICKER_PAD * 2;
const EDGE = 8;

// One reaction per person (the server enforces it). The bar shows a chip for each reaction that
// has votes: tap yours to remove it, tap another to switch to it. The smiley button opens a small
// picker next to it; choosing an emoji applies it and closes the picker immediately, and so does
// tapping anywhere outside it or the Back button.
export function ReactionBar({ counts, mine, onToggle }: ReactionBarProps) {
  const win = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const buttonRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const active = REACTIONS.filter((r) => (counts[r.code] ?? 0) > 0 || mine.includes(r.code));

  const openPicker = () => {
    // Close the keyboard first (the layout shifts while it closes), then measure so the picker
    // opens right next to the button, whatever the screen.
    Keyboard.dismiss();
    buttonRef.current?.measureInWindow((x, y, w, h) => setAnchor({ x, y, w, h }));
  };
  const closePicker = () => setAnchor(null);
  const choose = (code: ReactionCode) => {
    closePicker();
    onToggle(code);
  };

  // Above the button when there is room (the usual place), otherwise below it; kept on screen.
  let pickerStyle: { left: number; top: number } | null = null;
  if (anchor) {
    const left = Math.min(Math.max(anchor.x, EDGE), Math.max(EDGE, win.width - PICKER_W - EDGE));
    const roomAbove = anchor.y - PICKER_H - 8 >= insets.top + EDGE;
    const below = Math.min(anchor.y + anchor.h + 8, win.height - insets.bottom - EDGE - PICKER_H);
    pickerStyle = { left, top: roomAbove ? anchor.y - PICKER_H - 8 : below };
  }

  return (
    <View style={styles.row}>
      {active.map((r) => {
        const count = counts[r.code] ?? 0;
        const isMine = mine.includes(r.code);
        return (
          <Pressable
            key={r.code}
            accessibilityRole="button"
            accessibilityLabel={`${r.glyph} ${count} reaction${count === 1 ? '' : 's'}${isMine ? ', including yours' : ''}`}
            accessibilityState={{ selected: isMine }}
            onPress={() => onToggle(r.code)}
            hitSlop={8}
            style={[styles.chip, isMine ? styles.active : styles.idle]}
          >
            <Text variant="secondary">{r.glyph}</Text>
            {count > 0 ? (
              <Text variant="meta" numeric style={{ color: isMine ? colors.accent : colors.ink3 }}>
                {count}
              </Text>
            ) : null}
          </Pressable>
        );
      })}

      <View ref={buttonRef} collapsable={false}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={mine.length ? 'Change reaction' : 'Add reaction'}
          onPress={openPicker}
          hitSlop={8}
          style={[styles.chip, styles.idle, styles.addChip]}
        >
          <Icon name="smile" size={17} color={colors.ink2} />
        </Pressable>
      </View>

      <Modal
        visible={!!anchor}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={closePicker}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={closePicker} accessibilityLabel="Close reactions" />
        {pickerStyle ? (
          <View style={[styles.picker, pickerStyle]} accessibilityRole="menu">
            {REACTIONS.map((r) => {
              const isMine = mine.includes(r.code);
              return (
                <Pressable
                  key={r.code}
                  accessibilityRole="menuitem"
                  accessibilityLabel={`React with ${r.code}`}
                  accessibilityState={{ selected: isMine }}
                  onPress={() => choose(r.code)}
                  style={({ pressed }) => [
                    styles.cell,
                    isMine ? styles.cellMine : null,
                    pressed ? { backgroundColor: colors.surface2 } : null,
                  ]}
                >
                  <Text style={styles.glyph}>{r.glyph}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.s2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  addChip: { paddingHorizontal: 9 },
  idle: { backgroundColor: colors.surface, borderColor: colors.line },
  active: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  picker: {
    position: 'absolute',
    flexDirection: 'row',
    width: PICKER_W,
    height: PICKER_H,
    padding: PICKER_PAD,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    ...((Platform.OS === 'android' ? { elevation: 12 } : { boxShadow: shadow.popover }) as object),
  },
  cell: { width: CELL, height: CELL, borderRadius: CELL / 2, alignItems: 'center', justifyContent: 'center' },
  cellMine: { backgroundColor: colors.accentSoft },
  glyph: { fontSize: 26, lineHeight: 32 },
});
