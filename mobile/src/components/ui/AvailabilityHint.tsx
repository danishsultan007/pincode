import React from 'react';
import { View } from 'react-native';
import { Text } from './Text';
import { colors } from '@/theme/tokens';

export type AvailabilityState = 'idle' | 'checking' | 'ok' | 'taken' | 'invalid' | 'error';

export type AvailabilityHintProps = {
  state: AvailabilityState;
  message: string;
};

const COLOR: Record<AvailabilityState, string> = {
  idle: colors.ink3,
  checking: colors.ink3,
  ok: colors.success,
  taken: colors.danger,
  invalid: colors.danger,
  error: colors.danger,
};

export function AvailabilityHint({ state, message }: AvailabilityHintProps) {
  if (state === 'idle' && !message) return null;
  return (
    <View>
      <Text variant="meta" style={{ color: COLOR[state] }}>
        {message}
      </Text>
    </View>
  );
}
