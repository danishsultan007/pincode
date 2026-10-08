import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon, IconName } from './Icon';
import { RadarRings } from './RadarRings';
import { Text } from './Text';
import { colors, space } from '@/theme/tokens';

export type EmptyStateProps = {
  title: string;
  text?: string;
  actions?: React.ReactNode;
  icon?: IconName;
};

export function EmptyState({ title, text, actions, icon = 'pin' }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.rings}>
        <RadarRings size={88}>
          <Icon name={icon} size={22} color={colors.accent} />
        </RadarRings>
      </View>
      <Text variant="cardTitle" style={styles.title}>
        {title}
      </Text>
      {text ? (
        <Text variant="secondary" style={styles.text}>
          {text}
        </Text>
      ) : null}
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: space.s7, paddingHorizontal: space.s5, gap: space.s2 },
  rings: { marginBottom: space.s2 },
  title: { textAlign: 'center', fontSize: 17 },
  text: { textAlign: 'center', maxWidth: 300 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s2, marginTop: space.s4, justifyContent: 'center' },
});
