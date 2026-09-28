import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { colors } from '@/theme/tokens';

export type AvatarProps = {
  uri?: string | null;
  name: string;
  size?: number;
};

export function Avatar({ uri, name, size = 36 }: AvatarProps) {
  const style = { width: size, height: size, borderRadius: size / 2 };
  if (uri) {
    return <Image source={{ uri }} style={[styles.image, style]} />;
  }
  const initial = (name.trim().charAt(0) || '?').toUpperCase();
  return (
    <View style={[styles.fallback, style]}>
      <Text variant="body" style={{ color: colors.ink2, fontSize: size * 0.42, fontWeight: '600' }}>
        {initial}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: colors.surface2 },
  fallback: {
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
