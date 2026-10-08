import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Text } from './Text';
import { colors, radius, space } from '@/theme/tokens';

export type RingDividerProps = { label: string };

// The "A bit further away (3–5 km)" divider between feed rings.
export function RingDivider({ label }: RingDividerProps) {
  return (
    <View style={styles.row}>
      <View style={styles.line} />
      <View style={styles.pill}>
        <Svg width={14} height={14}>
          <Circle cx={7} cy={7} r={6} stroke={colors.ink3} strokeWidth={1.4} fill="none" />
          <Circle cx={7} cy={7} r={2.5} stroke={colors.ink3} strokeWidth={1.4} fill="none" />
        </Svg>
        <Text variant="label">{label}</Text>
      </View>
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    paddingHorizontal: 0,
    paddingVertical: space.s4,
  },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 26,
    paddingHorizontal: space.s3,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
  },
});
