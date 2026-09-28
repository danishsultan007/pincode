import React from 'react';
import { Text as RNText, TextProps as RNTextProps, StyleSheet } from 'react-native';
import { numeric as numericStyle, text } from '@/theme/tokens';

export type TextVariant = keyof typeof text;

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  numeric?: boolean;
  numberOfLines?: number;
};

export function Text({ variant = 'body', numeric, style, ...rest }: TextProps) {
  return (
    <RNText
      style={[styles.base, text[variant] as any, numeric ? numericStyle : null, style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    fontWeight: '400',
  },
});
