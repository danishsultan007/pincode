import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { typeColor } from '@/theme/tokens';
import type { PostKind, PostType } from '@/types/models';

export type TypeLabelProps = { type: PostType; kind?: PostKind | null };

const LABEL: Record<PostType, string> = { ask: 'ASK', alert: 'ALERT', event: 'EVENT' };

// Dot + label, per MOBILE-PLAN.md §7.1: the type color only ever appears as a
// 6px dot, the alert card's left rule, and map markers — never as text color.
export function TypeLabel({ type, kind }: TypeLabelProps) {
  const label = type === 'ask' && kind === 'offer' ? `${LABEL.ask} · OFFERING` : LABEL[type];
  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: typeColor[type] }]} />
      <Text variant="label">{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
