import React from 'react';
import { Pressable, StyleSheet, View, ViewProps } from 'react-native';
import { colors, motion, radius, shadow, space } from '@/theme/tokens';

export type CardVariant = 'default' | 'alert' | 'past';

export type CardProps = ViewProps & {
  onPress?: () => void;
  variant?: CardVariant;
  children: React.ReactNode;
};

export function Card({ onPress, variant = 'default', style, children, ...rest }: CardProps) {
  const content = (
    <View
      style={[
        styles.base,
        variant === 'alert' ? styles.alert : null,
        variant === 'past' ? styles.past : null,
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
    >
      {({ pressed }) => <View style={pressed ? styles.pressed : null}>{content}</View>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.s4,
    gap: space.s3,
    boxShadow: shadow.card,
  },
  alert: { backgroundColor: colors.alertTint, borderColor: colors.alertLine },
  past: { opacity: 0.7 },
  pressed: { transform: [{ scale: motion.pressScaleCard }], opacity: 0.96 },
});
