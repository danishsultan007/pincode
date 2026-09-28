import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Text } from './Text';
import { colors, radius, space } from '@/theme/tokens';

export type ChipProps = {
  label: string;
  selected?: boolean;
  pressed?: boolean;
  onPress?: () => void;
};

const HEIGHT = 32;

export function Chip({ label, selected, pressed, onPress }: ChipProps) {
  const active = selected || pressed;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      hitSlop={4}
      style={[
        styles.base,
        selected ? styles.selected : pressed ? styles.pressedState : styles.idle,
      ]}
    >
      <Text variant="secondary" style={{ color: active ? (selected ? colors.accentInk : colors.accent) : colors.ink2 }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: HEIGHT,
    borderRadius: radius.pill,
    paddingHorizontal: space.s4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  idle: { backgroundColor: colors.surface, borderColor: colors.line },
  selected: { backgroundColor: colors.ink, borderColor: colors.ink },
  pressedState: { backgroundColor: colors.accentSoft, borderColor: colors.accentSoft },
});
