import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { copy } from '@/lib/copy';
import { colors, space } from '@/theme/tokens';

export type RequestBarProps = {
  busy?: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onBlock: () => void;
};

// Shown in chat/[id] instead of the composer when the signed-in user is the
// *recipient* of a pending message request (MOBILE-PLAN.md §2.6/§4 Chat).
// The sender's side shows a disabled composer with "Waiting for them to
// accept" instead (handled directly in chat/[id].tsx).
export function RequestBar({ busy, onAccept, onDecline, onBlock }: RequestBarProps) {
  return (
    <View style={styles.wrap}>
      <Button label={copy.chat.accept} onPress={onAccept} loading={busy} size="sm" />
      <Button label={copy.chat.decline} variant="ghost" onPress={onDecline} loading={busy} size="sm" />
      <Button label={copy.chat.block} variant="danger" onPress={onBlock} loading={busy} size="sm" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: space.s2,
    padding: space.s3,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.bg,
  },
});
