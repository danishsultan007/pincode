import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Icon, IconName } from './Icon';
import { colors } from '@/theme/tokens';

export type IconButtonProps = {
  name: IconName;
  onPress?: () => void;
  label: string; // accessibilityLabel — required, this button never carries visible text
  color?: string;
  size?: number;
  disabled?: boolean;
};

const TOUCH_TARGET = 36;

export function IconButton({ name, onPress, label, color = colors.ink, size = 18, disabled }: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [styles.base, pressed && !disabled ? styles.pressed : null, disabled ? styles.disabled : null]}
    >
      <Icon name={name} size={size} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: TOUCH_TARGET / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: colors.surface2, transform: [{ scale: 0.94 }] },
  disabled: { opacity: 0.4 },
});
