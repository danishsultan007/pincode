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
    width: 48,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.eventSoft,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
  },
  day: { color: colors.event, fontSize: 20, lineHeight: 22, fontWeight: '800' },
  month: { color: colors.event, fontSize: 10, letterSpacing: 0.6 },
});
