import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radius, space } from '@/theme/tokens';

// Inset grouped card for ListRows (settings). Hairline separators between children.
export function ListGroup({ children }: { children: React.ReactNode }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.group}>
      {items.map((child, i) => (
        <React.Fragment key={i}>
          {i > 0 ? <View style={styles.sep} /> : null}
          {child}
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    marginHorizontal: space.s4,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: space.s4 },
});
