import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { timeAgo } from '@/lib/format';
import { copy } from '@/lib/copy';
import { colors, radius, space } from '@/theme/tokens';
import type { ConversationRow as ConversationRowModel } from '@/types/models';

export type ConversationRowProps = {
  conversation: ConversationRowModel;
  onPress: () => void;
};

// Chats/Requests list row (MOBILE-PLAN.md §4 Inbox tab / §7.2 ListRow). Built
// as its own component rather than reusing ui/ListRow because it needs a
// two-line body plus an unread-count pill, which ListRow's single subtitle
// line doesn't fit.
export function ConversationRow({ conversation, onPress }: ConversationRowProps) {
  const isSystem = conversation.kind === 'system';
  const name = isSystem ? copy.inbox.pincodeTeam : conversation.other_display_name;
  const preview = conversation.is_request ? copy.inbox.wantsToMessage : conversation.last_message_preview ?? '';
  const unread = conversation.unread_count > 0;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}>
      <Avatar uri={isSystem ? null : conversation.other_avatar_url} name={name || '?'} size={44} />
      <View style={styles.body}>
        <View style={styles.topLine}>
          <Text variant="body" numberOfLines={1} style={[styles.name, unread ? styles.unreadText : null]}>
            {name}
          </Text>
          {conversation.last_message_at ? (
            <Text variant="meta">{timeAgo(conversation.last_message_at)}</Text>
          ) : null}
        </View>
        <View style={styles.bottomLine}>
          <Text
            variant="secondary"
            numberOfLines={1}
            style={[styles.preview, unread ? styles.unreadText : null]}
          >
            {preview}
          </Text>
          {unread ? (
            <View style={styles.pill}>
              <Text variant="meta" style={styles.pillText} numeric>
                {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    paddingHorizontal: space.s4,
    paddingVertical: space.s3,
    minHeight: 44,
  },
  pressed: { backgroundColor: colors.surface2 },
  body: { flex: 1, gap: 2 },
  topLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s2 },
  bottomLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s2 },
  name: { flexShrink: 1 },
  preview: { flex: 1 },
  unreadText: { color: colors.ink, fontWeight: '600' },
  pill: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: { color: colors.accentInk, fontSize: 11, fontWeight: '600' },
});
