import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { colors, radius, shadow } from '@/theme/tokens';

export type SegmentedOption<T extends string> = { value: T; label: string; badge?: number };

export type SegmentedProps<T extends string> = {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  full?: boolean;
};

export function Segmented<T extends string>({ options, value, onChange, full }: SegmentedProps<T>) {
  return (
    <View style={[styles.track, full ? styles.full : null]}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(opt.value)}
            style={[styles.segment, full ? styles.segmentFull : null, active ? styles.active : null]}
          >
            <Text variant="secondary" numberOfLines={1} style={{ color: active ? colors.ink : colors.ink2, fontWeight: active ? '700' : '500' }}>
              {opt.label}
              {typeof opt.badge === 'number' && opt.badge > 0 ? ` (${opt.badge})` : ''}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    padding: 3,
    gap: 2,
  },
  full: { alignSelf: 'stretch' },
  segment: {
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
  },
  segmentFull: { flex: 1 },
  active: { backgroundColor: colors.raised, boxShadow: shadow.xs },
});
