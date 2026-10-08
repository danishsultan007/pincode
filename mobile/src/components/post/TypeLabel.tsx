import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { radius, space, typeColor, typeSoft } from '@/theme/tokens';
import type { PostKind, PostType } from '@/types/models';

export type TypeLabelProps = { type: PostType; kind?: PostKind | null };

const LABEL: Record<PostType, string> = { ask: 'ASK', alert: 'ALERT', event: 'EVENT' };

// Type pill: tinted background (typeSoft) with a 6px dot and a label in the
// type color.
export function TypeLabel({ type, kind }: TypeLabelProps) {
  const label = type === 'ask' && kind === 'offer' ? `${LABEL.ask} · OFFERING` : LABEL[type];
  return (
    <View style={[styles.row, { backgroundColor: typeSoft[type] }]}>
      <View style={[styles.dot, { backgroundColor: typeColor[type] }]} />
      <Text variant="label" style={{ color: typeColor[type], letterSpacing: 0.6 }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 22, paddingHorizontal: space.s2, borderRadius: radius.pill },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
