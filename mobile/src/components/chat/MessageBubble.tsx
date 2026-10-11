import React from 'react';
import { GestureResponderEvent, Image, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { useAttachmentUrl } from '@/hooks/useInbox';
import { fmtTime } from '@/lib/format';
import { copy } from '@/lib/copy';
import { REACTIONS } from '@/lib/constants';
import { colors, radius, space } from '@/theme/tokens';
import type { Message } from '@/types/models';

export type MessageBubbleProps = {
  message: Message;
  mine: boolean;
  senderName?: string;
  onOpenPhoto?: (uri: string) => void;
  myReaction?: string | null;
  // Long-press (or tap on the reactions): where the finger was, so the menu opens next to it.
  onLongPress?: (message: Message, point: { x: number; y: number }) => void;
};

const PHOTO_W = 220;

// Reactions on a message as [glyph, count] pairs in the usual order.
function summarizeReactions(reactions: Message['reactions']): { glyph: string; count: number }[] {
  const counts: Record<string, number> = {};
  for (const code of Object.values(reactions ?? {})) counts[code] = (counts[code] ?? 0) + 1;
  return REACTIONS.filter((r) => counts[r.code]).map((r) => ({ glyph: r.glyph, count: counts[r.code] }));
}

// A private chat photo: signed link fetched on demand, sized from the stored
// width/height so the list does not jump when it loads. A file removed by the
// retention job (or a moderator) shows as "Photo expired".
function AttachmentImage({
  message,
  mine,
  senderName,
  onOpen,
  onLongPress,
}: {
  message: Message;
  mine: boolean;
  senderName?: string;
  onOpen?: (uri: string) => void;
  onLongPress?: (e: GestureResponderEvent) => void;
}) {
  const { data: uri, isError, error, refetch } = useAttachmentUrl(message.attachment_path);
  const expired = isError && (error as Error | null)?.message === 'photo_expired';
  const [failed, setFailed] = React.useState(false);
  const retried = React.useRef(false);
  const ratio = Math.min(1.8, Math.max(0.6, (message.attachment_width ?? 4) / (message.attachment_height ?? 3)));
  const label = copy.chat.photoFrom(mine ? 'you' : senderName || 'them') + (message.body ? `: ${message.body}` : '');

  if (isError || failed) {
    return (
      <Pressable
        // Only an expired file is permanent; anything else (offline, a hiccup) can be retried by tapping.
        onPress={
          expired
            ? undefined
            : () => {
                retried.current = false;
                setFailed(false);
                refetch();
              }
        }
        onLongPress={onLongPress}
        style={[styles.photoBox, styles.photoGone, { aspectRatio: ratio }]}
      >
        <Text variant="bodySm" style={mine ? styles.timeMine : styles.time}>
          {expired ? copy.chat.photoExpired : copy.chat.photoUnavailable}
        </Text>
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={() => uri && onOpen?.(uri)}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="imagebutton"
      accessibilityLabel={label}
      style={[styles.photoBox, { aspectRatio: ratio }]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          onError={() => {
            // The signed link may have expired while the screen stayed open: fetch a fresh one once.
            if (!retried.current) {
              retried.current = true;
              refetch();
            } else {
              setFailed(true);
            }
          }}
        />
      ) : null}
    </Pressable>
  );
}

// Chat message bubble (MOBILE-PLAN.md §4 Chat): mine right in accent,
// theirs left in surface. A system message (is_system, sender_id null, from
// the "pincode Team" conversation) renders full-width, centered, no bubble
// side. A held message (mod_status !== 'visible') still renders for its own
// sender (RLS allows that) but shows the held placeholder instead of the body.
export function MessageBubble({ message, mine, senderName, onOpenPhoto, onLongPress, myReaction }: MessageBubbleProps) {
  const deleted = !!message.deleted_at;
  const held = message.mod_status !== 'visible' && !deleted;
  const hasPhoto = !!message.attachment_path && !held && !deleted;
  const showText = held || deleted || message.body.length > 0;

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

  const openMenu = onLongPress
    ? (e: GestureResponderEvent) => onLongPress(message, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY })
    : undefined;
  const reactionEntries = held || deleted ? [] : summarizeReactions(message.reactions);

  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
      <View style={[styles.col, { alignItems: mine ? 'flex-end' : 'flex-start' }]}>
      <Pressable
        onLongPress={openMenu}
        delayLongPress={350}
        style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs, hasPhoto ? styles.bubbleWithPhoto : null]}
      >
        {hasPhoto ? <AttachmentImage
            message={message}
            mine={mine}
            senderName={senderName}
            onOpen={onOpenPhoto}
            onLongPress={openMenu}
          /> : null}
        {showText ? (
          <Text
            variant="body"
            style={[
              mine ? styles.textMine : null,
              held || deleted ? (mine ? styles.heldMine : styles.heldText) : null,
            ]}
          >
            {deleted ? copy.chat.messageDeleted : held ? copy.chat.heldForReview : message.body}
          </Text>
        ) : null}
        <Text variant="meta" style={mine ? styles.timeMine : styles.time}>
          {fmtTime(message.created_at)}
        </Text>
      </Pressable>
      {reactionEntries.length ? (
        <Pressable
          onPress={openMenu}
          accessibilityRole="button"
          accessibilityLabel={`Reactions: ${reactionEntries.map((r) => r.glyph).join(' ')}`}
          hitSlop={6}
          style={[styles.reactPill, myReaction ? styles.reactPillMine : null]}
        >
          {reactionEntries.map((r) => (
            <Text key={r.glyph} variant="meta">
              {r.glyph}
              {r.count > 1 ? ` ${r.count}` : ''}
            </Text>
          ))}
        </Pressable>
      ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bubbleWithPhoto: { paddingHorizontal: 6, paddingTop: 6 },
  photoBox: { width: PHOTO_W, maxWidth: '100%', borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface2 },
  photoGone: { alignItems: 'center', justifyContent: 'center', padding: space.s3 },
  row: { flexDirection: 'row', paddingHorizontal: space.s3, paddingVertical: 2 },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  col: { maxWidth: '80%' },
  reactPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: -6,
    marginHorizontal: 10,
    paddingHorizontal: 8,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  reactPillMine: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  bubble: { borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 9, gap: 2 },
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
