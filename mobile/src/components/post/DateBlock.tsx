import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { colors, radius } from '@/theme/tokens';

export type DateBlockProps = { startsAt: string };

// Small day/month block for events, e.g. "27" / "SEP".
export function DateBlock({ startsAt }: DateBlockProps) {
  const d = new Date(startsAt);
  const day = new Intl.DateTimeFormat('en-IN', { day: '2-digit' }).format(d);
  const month = new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(d).toUpperCase();
  return (
    <View style={styles.wrap}>
      <Text variant="cardTitle" numeric style={styles.day}>
        {day}
      </Text>
      <Text variant="label" style={styles.month}>
        {month}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
  },
  day: { color: colors.accent, lineHeight: 18 },
  month: { color: colors.accent, fontSize: 9, letterSpacing: 0.4 },
});
