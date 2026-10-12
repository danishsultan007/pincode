import React from 'react';
import { GestureResponderEvent, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { copy } from '@/lib/copy';
import { colors, radius, space } from '@/theme/tokens';
import type { QuotedMessage } from '@/api/chat';

// What a quote shows, worked out from the original message as the viewer can see it.
export type ReplyQuoteData = { name: string; snippet: string; photo: boolean; muted: boolean };

export function describeQuote(
  original: QuotedMessage | undefined,
  resolved: boolean,
  opts: { myId?: string; otherName?: string }
): ReplyQuoteData {
  if (!original) {
    return { name: '', snippet: resolved ? copy.chat.quoteUnavailable : '…', photo: false, muted: true };
  }
  // A held original is only ever visible to its own sender; to everyone else it is simply gone.
  if (original.mod_status !== 'visible' && !original.deleted_at) {
    return { name: '', snippet: copy.chat.quoteUnavailable, photo: false, muted: true };
  }
  const name = original.sender_id === opts.myId ? copy.chat.you : opts.otherName || copy.chat.them;
  if (original.deleted_at) return { name, snippet: copy.chat.quoteDeleted, photo: false, muted: true };
  if (original.attachment_path) {
    return { name, snippet: original.body || copy.chat.quotePhoto, photo: true, muted: false };
  }
  return { name, snippet: original.body, photo: false, muted: false };
}

export type ReplyQuoteProps = {
  data: ReplyQuoteData;
  // 'mine' sits inside an accent bubble, 'theirs' inside a light one, 'composer' above the input.
  variant: 'mine' | 'theirs' | 'composer';
  onPress?: () => void;
  onLongPress?: (e: GestureResponderEvent) => void;
  onClose?: () => void;
};

// The quoted original: used inside a reply bubble (tap to jump to it) and as the "replying to"
// bar above the composer (with a close button).
export function ReplyQuote({ data, variant, onPress, onLongPress, onClose }: ReplyQuoteProps) {
  const mine = variant === 'mine';
  const composer = variant === 'composer';
  const body = (
    <View style={[styles.box, mine ? styles.boxMine : composer ? styles.boxComposer : styles.boxTheirs]}>
      <View style={[styles.bar, mine ? styles.barMine : null]} />
      <View style={styles.texts}>
        {data.name ? (
          <Text variant="meta" numberOfLines={1} style={[styles.name, mine ? styles.nameMine : null]}>
            {composer ? copy.chat.replyingTo(data.name) : data.name}
          </Text>
        ) : null}
        <View style={styles.snippetRow}>
          {data.photo ? <Icon name="camera" size={13} color={mine ? colors.accentInk : colors.ink3} /> : null}
          <Text
            variant="bodySm"
            numberOfLines={composer ? 1 : 2}
            style={[styles.snippet, mine ? styles.snippetMine : null, data.muted ? styles.muted : null]}
          >
            {data.snippet}
          </Text>
        </View>
      </View>
    </View>
  );
  return (
    <View style={composer ? styles.composerRow : null}>
      {onPress || onLongPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${data.name ? data.name + ': ' : ''}${data.snippet}`}
          onPress={onPress}
          onLongPress={onLongPress}
          delayLongPress={350}
          style={composer ? styles.grow : null}
        >
          {body}
        </Pressable>
      ) : (
        <View style={composer ? styles.grow : null}>{body}</View>
      )}
      {onClose ? <IconButton name="x" label={copy.chat.cancelReply} size={14} onPress={onClose} hitSlop={10} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', borderRadius: radius.sm, overflow: 'hidden', minWidth: 120 },
  boxMine: { backgroundColor: 'rgba(255,255,255,0.2)', marginBottom: 4 },
  boxTheirs: { backgroundColor: colors.surface2, marginBottom: 4 },
  boxComposer: { backgroundColor: colors.surface2 },
  bar: { width: 4, backgroundColor: colors.accent },
  barMine: { backgroundColor: colors.accentInk },
  texts: { flexShrink: 1, paddingHorizontal: space.s2, paddingVertical: 5, gap: 1 },
  name: { color: colors.accent, fontWeight: '600' },
  nameMine: { color: colors.accentInk },
  snippetRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  snippet: { flexShrink: 1, color: colors.ink2 },
  snippetMine: { color: colors.accentInk, opacity: 0.9 },
  muted: { fontStyle: 'italic', opacity: 0.8 },
  composerRow: { flexDirection: 'row', alignItems: 'center', gap: space.s2 },
  grow: { flex: 1 },
});
