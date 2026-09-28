import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { space } from '@/theme/tokens';

export type ChipRowProps = {
  scroll?: boolean;
  children: React.ReactNode;
};

export function ChipRow({ scroll = true, children }: ChipRowProps) {
  if (scroll) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {children}
      </ScrollView>
    );
  }
  return <View style={[styles.row, styles.wrap]}>{children}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: space.s2,
    paddingHorizontal: space.s4,
  },
  wrap: { flexWrap: 'wrap' },
});
