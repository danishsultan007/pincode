import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { space } from '@/theme/tokens';

export type ChipRowProps = {
  scroll?: boolean;
  /** Drop the side padding when the parent already pads. */
  flush?: boolean;
  children: React.ReactNode;
};

export function ChipRow({ scroll = true, flush, children }: ChipRowProps) {
  if (scroll) {
    return (
      <ScrollView
        horizontal
        style={styles.scroller}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.row, flush && styles.flush]}
      >
        {children}
      </ScrollView>
    );
  }
  return <View style={[styles.row, styles.wrap, flush && styles.flush]}>{children}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: space.s2,
    paddingHorizontal: space.s4,
  },
  flush: { paddingHorizontal: 0 },
  wrap: { flexWrap: 'wrap' },
  scroller: { flexGrow: 0 },
});
