import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { Icon, IconName } from '@/components/ui/Icon';
import { timeAgo } from '@/lib/format';
import { colors, radius, space } from '@/theme/tokens';
import type { NotificationKind, NotificationRow as NotificationRowModel } from '@/types/models';

export type NotificationRowProps = {
  notification: NotificationRowModel;
  onPress: () => void;
};

// One icon per notification kind (MOBILE-PLAN.md §3/§4 Inbox tab). Typed as
// Record<NotificationKind, IconName>, so every kind the SQL can create
// (§2.5) must have an entry — leaving one out is a compile error, not a
// silent fallback.
const ICON_BY_KIND: Record<NotificationKind, IconName> = {
  post_answer: 'message',
  post_comment: 'message',
  comment_reply: 'message',
  answer_solved: 'check',
  post_upvotes: 'arrow-up',
  comment_upvotes: 'arrow-up',
  badge_earned: 'star',
  alert_confirmed: 'alert',
  alert_nearby: 'alert',
  message_request: 'inbox',
  request_accepted: 'inbox',
  community_new_post: 'users',
  community_role: 'users',
  community_post_removed: 'users',
  community_member_removed: 'users',
  content_held: 'shield',
  content_restored: 'shield',
  content_removed: 'shield',
  warning: 'shield',
  suspension: 'shield',
  ban_lifted: 'shield',
  report_update: 'flag',
  mod_queue: 'shield',
};

function iconFor(kind: NotificationKind): IconName {
  return ICON_BY_KIND[kind] ?? 'bell';
}

export function NotificationRow({ notification, onPress }: NotificationRowProps) {
  const unread = !notification.read_at;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}>
      <View style={styles.iconWrap}>
        <Icon name={iconFor(notification.kind)} size={18} color={colors.ink2} />
      </View>
      <View style={styles.body}>
        <Text variant="body" numberOfLines={2} style={unread ? styles.unreadText : undefined}>
          {notification.title}
        </Text>
        {notification.body ? (
          <Text variant="secondary" numberOfLines={2}>
            {notification.body}
          </Text>
        ) : null}
        <Text variant="meta">{timeAgo(notification.created_at)}</Text>
      </View>
      {unread ? <View style={styles.dot} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.s3,
    paddingHorizontal: space.s4,
    paddingVertical: space.s3,
    minHeight: 44,
  },
  pressed: { backgroundColor: colors.surface2 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  unreadText: { fontWeight: '600' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent, marginTop: 6 },
});
