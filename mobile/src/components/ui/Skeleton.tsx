import React, { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet } from 'react-native';
import { colors, motion, radius } from '@/theme/tokens';

export type SkeletonProps = {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
};

export function Skeleton({ width = '100%', height = 16, radius: r = radius.md }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: motion.pulse, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(opacity, { toValue: 0.45, duration: motion.pulse, useNativeDriver: Platform.OS !== 'web' }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[styles.base, { width: width as any, height, borderRadius: r, opacity }]}
    />
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: colors.surface2 },
});
