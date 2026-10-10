import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { colors, motion, radius, space } from '@/theme/tokens';

export type VoteButtonProps = {
  count: number;
  mine: boolean;
  onPress: () => void;
  disabled?: boolean;
};

export function VoteButton({ count, mine, onPress, disabled }: VoteButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: mine, disabled }}
      onPress={disabled ? undefined : onPress}
      hitSlop={8}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.base,
            mine ? styles.active : styles.idle,
            disabled ? styles.disabled : null,
            pressed && !disabled ? { transform: [{ scale: motion.pressScale }] } : null,
          ]}
        >
          <Icon name="arrow-up" size={15} color={mine ? colors.accent : colors.ink2} />
          <Text variant="secondary" numeric style={{ color: mine ? colors.accent : colors.ink2, fontWeight: '600' }}>
            {count}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 32,
    paddingHorizontal: space.s3,
    borderRadius: radius.pill,
    borderWidth: 0,
  },
  idle: { backgroundColor: colors.surface2 },
  active: { backgroundColor: colors.accentSoft },
  disabled: { opacity: 0.5 },
});
