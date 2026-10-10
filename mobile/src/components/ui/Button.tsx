import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Icon, IconName } from './Icon';
import { Text } from './Text';
import { colors, motion, radius, space } from '@/theme/tokens';

export type ButtonVariant = 'primary' | 'ghost' | 'text' | 'danger';
export type ButtonSize = 'lg' | 'md' | 'sm';

export type ButtonProps = {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  onPress?: () => void;
};

const HEIGHT: Record<ButtonSize, number> = { lg: 52, md: 44, sm: 36 };
const PAD_X: Record<ButtonSize, number> = { lg: 24, md: 20, sm: 14 };

export function Button({ label, variant = 'primary', size = 'md', loading, disabled, icon, onPress }: ButtonProps) {
  const isDisabled = disabled || loading;
  const padX = variant === 'text' ? (size === 'sm' ? 8 : 12) : PAD_X[size];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      onPress={isDisabled ? undefined : onPress}
      hitSlop={size === 'sm' ? { top: 6, bottom: 6, left: 8, right: 8 } : 8}
      // Outer Pressable is layout-only and never transforms, so the hit-tested box keeps full size.
      style={[styles.outer, { minHeight: HEIGHT[size] }]}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.base,
            { height: HEIGHT[size], paddingHorizontal: padX },
            variantStyles[variant],
            pressed && !isDisabled
              ? [
                  { transform: [{ scale: motion.pressScale }], opacity: motion.pressOpacity },
                  variant === 'primary' ? { backgroundColor: colors.accentPressed } : null,
                ]
              : null,
            isDisabled ? styles.disabled : null,
          ]}
        >
          {loading ? (
            <ActivityIndicator size="small" color={textColor[variant]} />
          ) : (
            <View style={styles.content}>
              {icon ? <Icon name={icon} size={size === 'sm' ? 16 : 18} color={textColor[variant]} /> : null}
              <Text
                variant="button"
                style={{ color: textColor[variant], fontSize: size === 'lg' ? 16 : size === 'sm' ? 14 : 15 }}
              >
                {label}
              </Text>
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outer: { justifyContent: 'center' },
  base: {
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s2,
  },
  disabled: { opacity: 0.4 },
});

const variantStyles: Record<ButtonVariant, object> = {
  primary: { backgroundColor: colors.accent },
  ghost: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.lineStrong },
  text: { backgroundColor: 'transparent' },
  danger: { backgroundColor: colors.danger },
};

const textColor: Record<ButtonVariant, string> = {
  primary: colors.accentInk,
  ghost: colors.ink,
  text: colors.accent,
  danger: colors.accentInk,
};
