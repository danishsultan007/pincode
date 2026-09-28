import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { space } from '@/theme/tokens';

export type EmptyStateProps = {
  title: string;
  text?: string;
  actions?: React.ReactNode;
};

export function EmptyState({ title, text, actions }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <Text variant="cardTitle" style={styles.center}>
        {title}
      </Text>
      {text ? (
        <Text variant="secondary" style={styles.center}>
          {text}
        </Text>
      ) : null}
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', padding: space.s6, gap: space.s2 },
  center: { textAlign: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s2, marginTop: space.s3, justifyContent: 'center' },
});
