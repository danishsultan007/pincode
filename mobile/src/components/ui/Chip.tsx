import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { colors, motion, radius } from '@/theme/tokens';

export type ChipProps = {
  label: string;
  selected?: boolean;
  pressed?: boolean;
  onPress?: () => void;
};

export function Chip({ label, selected, pressed, onPress }: ChipProps) {
  const labelColor = selected ? colors.onInk : pressed ? colors.accent : colors.ink2;
  const labelWeight = selected || pressed ? '600' : '500';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      hitSlop={{ top: 7, bottom: 7, left: 4, right: 4 }}
    >
      {({ pressed: touching }) => (
        <View
          style={[
            styles.base,
            selected ? styles.selected : pressed ? styles.pressedState : styles.idle,
            touching ? { transform: [{ scale: motion.pressScale }] } : null,
          ]}
        >
          <Text variant="secondary" style={{ color: labelColor, fontWeight: labelWeight }}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 34,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  idle: { backgroundColor: colors.surface, borderColor: colors.line },
  selected: { backgroundColor: colors.ink, borderColor: colors.ink },
  pressedState: { backgroundColor: colors.accentSoft, borderColor: colors.accentSoft },
});
