import React from 'react';
import { IconButton } from '@/components/ui/IconButton';
import { actionSheet, confirmAsync } from '@/lib/confirm';
import { copy } from '@/lib/copy';
import type { PostCard } from '@/types/models';

export type PostActionsProps = {
  post: PostCard;
  isAuthor: boolean;
  isBlocked: boolean;
  /** True when the viewer is an owner/moderator of the post's community (MOBILE-PLAN.md §2.7 is_community_mod). */
  isCommunityMod?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMarkResolved: () => void;
  onReport: () => void;
  onToggleBlock: () => void;
  onMessage: () => void;
  /** Calls mod_set_post_removed(p_post, true, reason) — required when isCommunityMod is true. */
  onRemoveFromCommunity?: () => void;
};

// Overflow menu (MOBILE-PLAN.md §4 Post detail). `onReport` pushes to the
// /report modal (P8) with targetType 'post'. Community-mod removal (P6): a
// mod who isn't the author gets "Remove from community" alongside
// Report/Block.
export function PostActions({
  post,
  isAuthor,
  isBlocked,
  isCommunityMod,
  onEdit,
  onDelete,
  onMarkResolved,
  onReport,
  onToggleBlock,
  onMessage,
  onRemoveFromCommunity,
}: PostActionsProps) {
  const openMenu = () => {
    if (isAuthor) {
      const options = [
        { label: copy.post.edit, onPress: onEdit },
        ...(post.type === 'alert' && post.status === 'active'
          ? [{ label: copy.post.markResolved, onPress: onMarkResolved }]
          : []),
        {
          label: copy.post.delete,
          destructive: true,
          onPress: async () => {
            const ok = await confirmAsync(copy.post.delete, undefined, { destructive: true, confirmLabel: copy.post.delete });
            if (ok) onDelete();
          },
        },
      ];
      actionSheet('Post', options);
      return;
    }

    const options = [
      ...(isBlocked ? [] : [{ label: copy.profile.message, onPress: onMessage }]),
      { label: copy.post.report, onPress: onReport },
      { label: isBlocked ? copy.profile.unblock : copy.post.blockAuthor, destructive: !isBlocked, onPress: onToggleBlock },
    ];
    if (isCommunityMod && onRemoveFromCommunity && !post.community_removed) {
      options.push({
        label: copy.post.removeFromCommunity,
        destructive: true,
        onPress: async () => {
          const ok = await confirmAsync(copy.post.removeFromCommunity, undefined, {
            destructive: true,
            confirmLabel: copy.post.removeFromCommunity,
          });
          if (ok) onRemoveFromCommunity();
        },
      });
    }
    actionSheet('Post', options);
  };

  return <IconButton name="more" label="More actions" onPress={openMenu} />;
}
