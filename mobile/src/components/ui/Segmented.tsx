import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { colors, radius, space } from '@/theme/tokens';

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
            <Text variant="secondary" style={{ color: active ? colors.ink : colors.ink2, fontWeight: active ? '600' : '400' }}>
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
    borderRadius: radius.md,
    padding: 2,
    gap: 2,
  },
  full: { alignSelf: 'stretch' },
  segment: {
    paddingVertical: space.s2,
    paddingHorizontal: space.s3,
    borderRadius: radius.sm,
  },
  segmentFull: { flex: 1, alignItems: 'center' },
  active: { backgroundColor: colors.surface },
});
