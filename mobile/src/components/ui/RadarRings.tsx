import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, motion } from '@/theme/tokens';

export type RadarRingsProps = { size?: number; color?: string; pulse?: boolean; children?: React.ReactNode };

// Three concentric rings around a center (the pin). `pulse` = slow "breathing"
// scale on the rings; skipped when the OS asks for reduced motion.
export function RadarRings({ size = 96, color = colors.accent, pulse, children }: RadarRingsProps) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!pulse) return;
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (reduced || cancelled) return;
      const opts = { duration: motion.breathe, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web' };
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.04, ...opts }),
          Animated.timing(scale, { toValue: 1, ...opts }),
        ])
      );
      loop.start();
    });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [pulse, scale]);

  const c = size / 2;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale }] }]}>
        <Svg width={size} height={size}>
          <Circle cx={c} cy={c} r={c - 1} stroke={color} strokeOpacity={0.12} strokeWidth={1.5} fill={color} fillOpacity={0.03} />
          <Circle cx={c} cy={c} r={c * 0.68} stroke={color} strokeOpacity={0.2} strokeWidth={1.5} fill={color} fillOpacity={0.04} />
          <Circle cx={c} cy={c} r={c * 0.38} stroke={color} strokeOpacity={0.32} strokeWidth={1.5} fill={color} fillOpacity={0.07} />
        </Svg>
      </Animated.View>
      {children}
    </View>
  );
}
