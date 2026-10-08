import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { fmtTime } from '@/lib/format';
import { copy } from '@/lib/copy';
import { colors, radius, space } from '@/theme/tokens';
import type { Message } from '@/types/models';

export type MessageBubbleProps = {
  message: Message;
  mine: boolean;
};

// Chat message bubble (MOBILE-PLAN.md §4 Chat): mine right in accent,
// theirs left in surface. A system message (is_system, sender_id null, from
// the "pincode Team" conversation) renders full-width, centered, no bubble
// side. A held message (mod_status !== 'visible') still renders for its own
// sender (RLS allows that) but shows the held placeholder instead of the body.
export function MessageBubble({ message, mine }: MessageBubbleProps) {
  const held = message.mod_status !== 'visible';

  if (message.is_system) {
    return (
      <View style={styles.systemWrap}>
        <View style={styles.systemBubble}>
          <Text variant="bodySm" style={styles.systemText}>
            {message.body}
          </Text>
          <Text variant="meta" style={styles.systemTime}>
            {fmtTime(message.created_at)}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
        <Text
          variant="body"
          style={[mine ? styles.textMine : null, held ? (mine ? styles.heldMine : styles.heldText) : null]}
        >
          {held ? copy.chat.heldForReview : message.body}
        </Text>
        <Text variant="meta" style={mine ? styles.timeMine : styles.time}>
          {fmtTime(message.created_at)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', paddingHorizontal: space.s3, paddingVertical: 2 },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '80%', borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 9, gap: 2 },
  bubbleMine: { backgroundColor: colors.accent, borderBottomRightRadius: radius.xs },
  bubbleTheirs: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderBottomLeftRadius: radius.xs,
  },
  textMine: { color: colors.accentInk },
  timeMine: { alignSelf: 'flex-end', color: colors.accentInk, opacity: 0.72 },
  time: { alignSelf: 'flex-end', color: colors.ink3 },
  heldText: { color: colors.ink3, fontStyle: 'italic' },
  heldMine: { color: colors.accentInk, opacity: 0.8, fontStyle: 'italic' },
  systemWrap: { alignItems: 'center', paddingHorizontal: space.s4, paddingVertical: 4 },
  systemBubble: {
    maxWidth: '90%',
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    paddingHorizontal: space.s3,
    paddingVertical: space.s2,
    gap: 2,
  },
  systemText: { color: colors.ink2 },
  systemTime: { alignSelf: 'center', color: colors.ink3 },
});
