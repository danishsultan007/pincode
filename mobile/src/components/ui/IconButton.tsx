import React from 'react';
import { Pressable, StyleSheet, View, type PressableProps } from 'react-native';
import { Icon, IconName } from './Icon';
import { colors } from '@/theme/tokens';

export type IconButtonProps = {
  name: IconName;
  onPress?: () => void;
  label: string; // accessibilityLabel — required, this button never carries visible text
  color?: string;
  size?: number;
  disabled?: boolean;
  hitSlop?: PressableProps['hitSlop'];
};

const TOUCH_TARGET = 44;
const VISUAL = 36;

export function IconButton({ name, onPress, label, color = colors.ink, size = 18, disabled, hitSlop = 4 }: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      style={styles.outer}
    >
      {({ pressed }) => (
        <View style={[styles.base, pressed && !disabled ? styles.pressed : null, disabled ? styles.disabled : null]}>
          <Icon name={name} size={size} color={color} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Outer: 44dp hit box, layout only (never transforms). The -4 margin keeps the layout footprint at 36x36.
  outer: { width: TOUCH_TARGET, height: TOUCH_TARGET, margin: (VISUAL - TOUCH_TARGET) / 2, alignItems: 'center', justifyContent: 'center' },
  base: {
    width: VISUAL,
    height: VISUAL,
    borderRadius: VISUAL / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: colors.surface2, transform: [{ scale: 0.94 }] },
  disabled: { opacity: 0.4 },
});
