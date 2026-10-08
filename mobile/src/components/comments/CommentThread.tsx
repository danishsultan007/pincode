import React from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { CommentItem } from '@/components/comments/CommentItem';
import { copy } from '@/lib/copy';
import { colors, radius, space } from '@/theme/tokens';
import type { ReactionCode } from '@/lib/constants';
import type { CommentCard, CommentNode } from '@/types/models';

const INDENT = 16;

export type CommentThreadProps = {
  postId: string;
  roots: CommentNode[];
  postAuthorId: string;
  solvedCommentId: string | null | undefined;
  viewerId: string | null | undefined;
  onReply: (comment: CommentCard) => void;
  onVote: (comment: CommentCard) => void;
  onReact: (commentId: string, code: ReactionCode) => void;
  onSolve: (comment: CommentCard) => void;
  onMore: (comment: CommentCard) => void;
  highlightCommentId?: string | null;
  onCommentLayout?: (commentId: string, y: number) => void;
};

// Renders the tree built by lib/tree.ts (MOBILE-PLAN.md §7.3): depths 0-2
// inline, and a "Continue this thread (n) →" link once a node at depth 2
// has children, pointing at /post/[id]/thread/[commentId of the depth-2 node].
export function CommentThread(props: CommentThreadProps) {
  return (
    <>
      {props.roots.map((node) => (
        <CommentNodeView key={node.id} node={node} {...props} />
      ))}
    </>
  );
}

function CommentNodeView({
  node,
  postId,
  postAuthorId,
  solvedCommentId,
  viewerId,
  onReply,
  onVote,
  onReact,
  onSolve,
  onMore,
  highlightCommentId,
  onCommentLayout,
}: Omit<CommentThreadProps, 'roots'> & { node: CommentNode }) {
  const isSolved = !!solvedCommentId && solvedCommentId === node.id;
  const isPostAuthor = node.author_id === postAuthorId;
  const canSolve = !!viewerId && viewerId === postAuthorId && node.is_answer && !node.is_deleted;
  const cutOff = node.depth >= 2 && node.children.length > 0;
  const isHighlighted = !!highlightCommentId && highlightCommentId === node.id;

  return (
    <View
      onLayout={onCommentLayout ? (e: LayoutChangeEvent) => onCommentLayout(node.id, e.nativeEvent.layout.y) : undefined}
      style={isHighlighted ? styles.highlight : undefined}
    >
      <CommentItem
        comment={node}
        depth={node.depth}
        isPostAuthor={isPostAuthor}
        isSolved={isSolved}
        canSolve={canSolve}
        onReply={() => onReply(node)}
        onVote={() => onVote(node)}
        onReact={(code) => onReact(node.id, code)}
        onSolve={() => onSolve(node)}
        onMore={() => onMore(node)}
      />
      {cutOff ? (
        <ContinueThreadLink postId={postId} commentId={node.id} depth={node.depth} count={countDescendants(node)} />
      ) : (
        node.children.map((child) => (
          <CommentNodeView
            key={child.id}
            node={child}
            postId={postId}
            postAuthorId={postAuthorId}
            solvedCommentId={solvedCommentId}
            viewerId={viewerId}
            onReply={onReply}
            onVote={onVote}
            onReact={onReact}
            onSolve={onSolve}
            onMore={onMore}
            highlightCommentId={highlightCommentId}
            onCommentLayout={onCommentLayout}
          />
        ))
      )}
    </View>
  );
}

function ContinueThreadLink({
  postId,
  commentId,
  depth,
  count,
}: {
  postId: string;
  commentId: string;
  depth: number;
  count: number;
}) {
  const router = useRouter();
  return (
    <Pressable
      style={[styles.continueLink, { marginLeft: (depth + 1) * INDENT }]}
      onPress={() => router.push(`/post/${postId}/thread/${commentId}`)}
    >
      <Text variant="secondary" style={{ color: colors.accent }}>
        {copy.post.continueThread(count)}
      </Text>
    </Pressable>
  );
}

function countDescendants(node: CommentNode): number {
  return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}

const styles = StyleSheet.create({
  continueLink: { paddingVertical: space.s2 },
  highlight: { backgroundColor: colors.accentTint, borderRadius: radius.md, paddingHorizontal: space.s2 },
});
