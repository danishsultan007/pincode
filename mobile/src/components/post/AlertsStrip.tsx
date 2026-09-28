import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { AlertMini } from './AlertMini';
import { space } from '@/theme/tokens';
import type { PostCard } from '@/types/models';

export type AlertsStripProps = { alerts: PostCard[] };

export function AlertsStrip({ alerts }: AlertsStripProps) {
  if (!alerts.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {alerts.map((a) => (
        <AlertMini key={a.id} post={a} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.s2, paddingHorizontal: space.s4, paddingVertical: space.s2 },
});
