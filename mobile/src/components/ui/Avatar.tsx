import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { avatarTones, colors } from '@/theme/tokens';

export type AvatarProps = {
  uri?: string | null;
  name: string;
  size?: number;
  shape?: 'circle' | 'rounded';
};

export function Avatar({ uri, name, size = 36, shape = 'circle' }: AvatarProps) {
  const style = { width: size, height: size, borderRadius: shape === 'circle' ? size / 2 : Math.round(size * 0.3) };
  if (uri) {
    return <Image source={{ uri }} style={[styles.image, style]} />;
  }
  const initial = (name.trim().charAt(0) || '?').toUpperCase();
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const tone = avatarTones[h % avatarTones.length];
  return (
    <View style={[styles.fallback, style, { backgroundColor: tone.bg }]}>
      <Text
        variant="body"
        style={{
          color: tone.fg,
          fontSize: size * 0.42,
          lineHeight: Math.round(size * 0.42 * 1.2),
          fontWeight: '700',
        }}
      >
        {initial}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: colors.surface2 },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
