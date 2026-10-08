import React from 'react';
import { Text as RNText, TextProps as RNTextProps, StyleSheet, TextStyle } from 'react-native';
import { numeric as numericStyle, text } from '@/theme/tokens';
import { fontFor } from '@/theme/fonts';

export type TextVariant = keyof typeof text;

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  numeric?: boolean;
  numberOfLines?: number;
};

export function Text({ variant = 'body', numeric, style, ...rest }: TextProps) {
  const flat = (StyleSheet.flatten([
    styles.base,
    text[variant] as TextStyle,
    numeric ? (numericStyle as unknown as TextStyle) : null,
    style,
  ]) ?? {}) as TextStyle;
  return <RNText style={[flat, { fontFamily: fontFor(flat.fontWeight), fontWeight: 'normal' }]} {...rest} />;
}

const styles = StyleSheet.create({ base: { fontWeight: '400' } });
