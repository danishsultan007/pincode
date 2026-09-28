import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { colors, space } from '@/theme/tokens';

export type RingDividerProps = { label: string };

// The "A bit further away (3–5 km)" divider between feed rings.
export function RingDivider({ label }: RingDividerProps) {
  return (
    <View style={styles.row}>
      <View style={styles.line} />
      <Text variant="label">{label}</Text>
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    paddingHorizontal: space.s4,
    paddingVertical: space.s3,
  },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
});
