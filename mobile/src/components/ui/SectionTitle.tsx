import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { space } from '@/theme/tokens';

export type SectionTitleProps = {
  title: string;
  right?: React.ReactNode;
  /** Drop the side padding when the parent already pads. */
  flush?: boolean;
};

export function SectionTitle({ title, right, flush }: SectionTitleProps) {
  return (
    <View style={[styles.row, flush && styles.flush]}>
      <Text variant="label">{title}</Text>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.s4,
    paddingTop: space.s5,
    paddingBottom: space.s2,
  },
  flush: { paddingHorizontal: 0 },
});
