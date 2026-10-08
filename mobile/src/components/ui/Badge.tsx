import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { colors, radius, space } from '@/theme/tokens';

export type BadgeTone = 'neutral' | 'accent' | 'warn' | 'danger';

export type BadgeProps = {
  label: string;
  tone?: BadgeTone;
};

const TONE_BG: Record<BadgeTone, string> = {
  neutral: colors.surface2,
  accent: colors.accentSoft,
  warn: colors.alertSoft,
  danger: colors.dangerSoft,
};

const TONE_FG: Record<BadgeTone, string> = {
  neutral: colors.ink2,
  accent: colors.accent,
  warn: colors.alert,
  danger: colors.danger,
};

export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  return (
    <View style={[styles.pill, { backgroundColor: TONE_BG[tone] }]}>
      <Text variant="meta" style={[styles.label, { color: TONE_FG[tone] }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    height: 22,
    borderRadius: radius.pill,
    paddingHorizontal: space.s2,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  label: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.2 },
});
