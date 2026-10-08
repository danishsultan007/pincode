import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { Text } from './Text';
import { colors, radius, space } from '@/theme/tokens';

export type BannerTone = 'neutral' | 'warn';

export type BannerProps = {
  text: string;
  tone?: BannerTone;
  onDismiss?: () => void;
};

export function Banner({ text, tone = 'neutral', onDismiss }: BannerProps) {
  return (
    <View style={[styles.wrap, tone === 'warn' ? styles.warn : styles.neutral]}>
      {tone === 'warn' ? <Icon name="alert" size={16} color={colors.alert} /> : null}
      <Text variant="bodySm" style={styles.text}>
        {text}
      </Text>
      {onDismiss ? <IconButton name="x" label="Dismiss" onPress={onDismiss} size={14} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    borderRadius: radius.md,
    paddingVertical: space.s3,
    paddingHorizontal: space.s4,
  },
  neutral: { backgroundColor: colors.surface2 },
  warn: { backgroundColor: colors.alertSoft },
  text: { flex: 1, color: colors.ink },
});
