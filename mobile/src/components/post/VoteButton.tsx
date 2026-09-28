import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { colors, radius, space } from '@/theme/tokens';

export type VoteButtonProps = {
  count: number;
  mine: boolean;
  onPress: () => void;
  disabled?: boolean;
};

export function VoteButton({ count, mine, onPress, disabled }: VoteButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: mine, disabled }}
      onPress={disabled ? undefined : onPress}
      hitSlop={6}
      style={[styles.base, mine ? styles.active : styles.idle, disabled ? styles.disabled : null]}
    >
      <Icon name="arrow-up" size={14} color={mine ? colors.accent : colors.ink2} />
      <Text variant="secondary" numeric style={{ color: mine ? colors.accent : colors.ink2, fontWeight: mine ? '600' : '400' }}>
        {count}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 32,
    paddingHorizontal: space.s3,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  idle: { backgroundColor: colors.surface, borderColor: colors.line },
  active: { backgroundColor: colors.accentSoft, borderColor: colors.accentSoft },
  disabled: { opacity: 0.5 },
});
