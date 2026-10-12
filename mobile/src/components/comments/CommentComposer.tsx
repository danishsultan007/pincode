import React from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { TextField } from '@/components/ui/TextField';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { copy } from '@/lib/copy';
import { colors, motion, radius, space } from '@/theme/tokens';

export type CommentComposerProps = {
  value: string;
  onChangeText: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  replyingTo?: { id: string; username: string } | null;
  onCancelReply?: () => void;
  disabled?: boolean;
  // Chat only: a photo button left of the field, and a preview of the picked photo.
  onAttach?: () => void;
  attachment?: { previewUri: string; sending: boolean } | null;
  onRemoveAttachment?: () => void;
  // Chat only: the "replying to" bar shown above the input.
  replyPreview?: React.ReactNode;
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
  onAttach,
  attachment,
  onRemoveAttachment,
  replyPreview,
}: CommentComposerProps) {
  return (
    <View style={styles.wrap}>
      {replyPreview ?? null}
      {attachment ? (
        <View style={styles.previewRow}>
          <View style={styles.previewBox}>
            <Image source={{ uri: attachment.previewUri }} style={styles.previewImg} accessibilityIgnoresInvertColors />
            {attachment.sending ? (
              <View style={styles.previewBusy}>
                <ActivityIndicator color={colors.accentInk} />
              </View>
            ) : null}
          </View>
          {attachment.sending ? null : (
            <IconButton name="x" label={copy.chat.removePhoto} size={14} onPress={onRemoveAttachment} hitSlop={10} />
          )}
        </View>
      ) : null}
      {replyingTo ? (
        <View style={styles.replyChip}>
          <Text variant="meta" style={{ color: colors.accent }}>
            {copy.post.replyingTo(replyingTo.username)}
          </Text>
          <IconButton name="x" label="Cancel reply" size={14} onPress={onCancelReply} hitSlop={10} />
        </View>
      ) : null}
      <View style={styles.row}>
        {onAttach ? (
          <IconButton
            name="camera"
            label={copy.chat.attachPhoto}
            onPress={onAttach}
            disabled={disabled || !!attachment}
          />
        ) : null}
        <View style={{ flex: 1 }}>
          <TextField
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            onSubmitEditing={disabled ? undefined : onSubmit}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          onPress={onSubmit}
          disabled={disabled}
          style={styles.sendHit}
        >
          {({ pressed }) => (
            <View
              style={[
                styles.send,
                { backgroundColor: disabled ? colors.surface2 : colors.accent },
                pressed && !disabled ? { transform: [{ scale: motion.pressScale }] } : null,
              ]}
            >
              <Icon name="send" size={18} color={disabled ? colors.ink3 : colors.accentInk} />
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: space.s3,
    paddingVertical: space.s2,
    gap: space.s2,
  },
  replyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'flex-start',
    gap: space.s2,
    paddingHorizontal: space.s3,
    height: 28,
    paddingVertical: 0,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
  },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: space.s2 },
  previewBox: { width: 64, height: 64, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface2 },
  previewImg: { width: '100%', height: '100%' },
  previewBusy: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.s2 },
  sendHit: { width: 44, height: 44 },
  send: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
