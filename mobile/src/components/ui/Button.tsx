import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Icon, IconName } from './Icon';
import { Text } from './Text';
import { colors, radius, space } from '@/theme/tokens';

export type ButtonVariant = 'primary' | 'ghost' | 'text' | 'danger';
export type ButtonSize = 'md' | 'sm';

export type ButtonProps = {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  onPress?: () => void;
};

const HEIGHT: Record<ButtonSize, number> = { md: 36, sm: 32 };

export function Button({ label, variant = 'primary', size = 'md', loading, disabled, icon, onPress }: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      onPress={isDisabled ? undefined : onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.base,
        { height: HEIGHT[size] },
        variantStyles[variant],
        pressed && !isDisabled ? styles.pressed : null,
        isDisabled ? styles.disabled : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor[variant]} />
      ) : (
        <View style={styles.content}>
          {icon ? <Icon name={icon} size={16} color={textColor[variant]} /> : null}
          <Text variant="body" style={{ color: textColor[variant], fontWeight: '600' }}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    paddingHorizontal: space.s4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s2,
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
});

const variantStyles: Record<ButtonVariant, object> = {
  primary: { backgroundColor: colors.accent },
  ghost: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  text: { backgroundColor: 'transparent' },
  danger: { backgroundColor: colors.danger },
};

const textColor: Record<ButtonVariant, string> = {
  primary: colors.accentInk,
  ghost: colors.ink,
  text: colors.accent,
  danger: colors.accentInk,
};
