import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { space } from '@/theme/tokens';

export type SectionTitleProps = {
  title: string;
  right?: React.ReactNode;
};

export function SectionTitle({ title, right }: SectionTitleProps) {
  return (
    <View style={styles.row}>
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
    paddingTop: space.s4,
    paddingBottom: space.s2,
  },
});
