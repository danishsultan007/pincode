import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { Icon } from './Icon';
import { colors, space } from '@/theme/tokens';

export type ListRowProps = {
  left?: React.ReactNode;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
};

export function ListRow({ left, title, subtitle, right, onPress, chevron, destructive }: ListRowProps) {
  const content = (
    <View style={styles.row}>
      {left ? <View style={styles.left}>{left}</View> : null}
      <View style={styles.body}>
        <Text variant="body" numberOfLines={1} style={[styles.title, destructive ? styles.destructive : null]}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="meta" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {chevron ? <Icon name="chevron-right" size={16} color={colors.ink3} /> : null}
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed ? styles.pressed : null]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    paddingHorizontal: space.s4,
    paddingVertical: 14,
    minHeight: 52,
  },
  left: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 2 },
  title: { fontWeight: '500' },
  destructive: { color: colors.danger },
  pressed: { backgroundColor: colors.surface2 },
});
