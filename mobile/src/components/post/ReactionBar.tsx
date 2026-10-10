import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { colors, radius, space } from '@/theme/tokens';
import { REACTIONS, ReactionCode } from '@/lib/constants';
import type { ReactionCounts } from '@/types/models';

export type ReactionBarProps = {
  counts: ReactionCounts;
  mine: ReactionCode[];
  onToggle: (code: ReactionCode) => void;
};

// Shows chips for non-zero reactions plus a "+" that opens the full row of
// six (MOBILE-PLAN.md §7.3).
export function ReactionBar({ counts, mine, onToggle }: ReactionBarProps) {
  const [expanded, setExpanded] = useState(false);
  const active = REACTIONS.filter((r) => (counts[r.code] ?? 0) > 0 || mine.includes(r.code));
  const visible = expanded ? REACTIONS : active;

  return (
    <View style={styles.row}>
      {visible.map((r) => {
        const count = counts[r.code] ?? 0;
        const isMine = mine.includes(r.code);
        return (
          <Pressable
            key={r.code}
            accessibilityRole="button"
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
      {!expanded ? (
        <Pressable accessibilityRole="button" accessibilityLabel="More reactions" onPress={() => setExpanded(true)} hitSlop={8} style={[styles.chip, styles.idle]}>
          <Text variant="secondary" style={{ color: colors.ink2 }}>
            +
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  idle: { backgroundColor: colors.surface, borderColor: colors.line },
  active: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
});
