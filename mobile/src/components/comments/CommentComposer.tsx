import React from 'react';
import { StyleSheet, View } from 'react-native';
import { TextField } from '@/components/ui/TextField';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { copy } from '@/lib/copy';
import { colors, radius, space } from '@/theme/tokens';

export type CommentComposerProps = {
  value: string;
  onChangeText: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  replyingTo?: { id: string; username: string } | null;
  onCancelReply?: () => void;
  disabled?: boolean;
};

// Sticky bottom composer for the post detail and thread screens
// (MOBILE-PLAN.md §7.3). Shows the "Replying to @x ×" chip when replyingTo
// is set.
export function CommentComposer({
  value,
  onChangeText,
  onSubmit,
  placeholder,
  replyingTo,
  onCancelReply,
  disabled,
}: CommentComposerProps) {
  return (
    <View style={styles.wrap}>
      {replyingTo ? (
        <View style={styles.replyChip}>
          <Text variant="meta" style={{ color: colors.accent }}>
            {copy.post.replyingTo(replyingTo.username)}
          </Text>
          <IconButton name="x" label="Cancel reply" size={14} onPress={onCancelReply} />
        </View>
      ) : null}
      <View style={styles.row}>
        <TextField
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          onSubmitEditing={disabled ? undefined : onSubmit}
        />
        <IconButton name="send" label="Send" onPress={onSubmit} color={colors.accent} disabled={disabled} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.bg,
    padding: space.s3,
    gap: space.s2,
  },
  replyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'flex-start',
    gap: space.s2,
    paddingHorizontal: space.s2,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.s2 },
});
