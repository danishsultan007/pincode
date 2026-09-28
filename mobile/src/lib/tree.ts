import type { CommentCard, CommentNode } from '@/types/models';

// Builds the comment tree for CommentThread (§7.3):
// - top level: solved first, then upvote_count desc, then created_at asc
// - replies: created_at asc
// Depth is left as stored (0-8); the component decides where to cut off at
// depth 2 and show "Continue this thread".
export function buildCommentTree(comments: CommentCard[], solvedCommentId?: string | null): CommentNode[] {
  const byId = new Map<string, CommentNode>();
  for (const c of comments) byId.set(c.id, { ...c, children: [] });

  const roots: CommentNode[] = [];
  for (const node of byId.values()) {
    if (node.parent_id && byId.has(node.parent_id)) {
      byId.get(node.parent_id)!.children.push(node);
    } else if (!node.parent_id) {
      roots.push(node);
    } else {
      // Parent not loaded (shouldn't normally happen) — treat as a root.
      roots.push(node);
    }
  }

  const byCreatedAtAsc = (a: CommentNode, b: CommentNode) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime();

  const sortReplies = (node: CommentNode) => {
    node.children.sort(byCreatedAtAsc);
    node.children.forEach(sortReplies);
  };

  roots.sort((a, b) => {
    if (solvedCommentId) {
      if (a.id === solvedCommentId) return -1;
      if (b.id === solvedCommentId) return 1;
    }
    if (b.upvote_count !== a.upvote_count) return b.upvote_count - a.upvote_count;
    return byCreatedAtAsc(a, b);
  });
  roots.forEach(sortReplies);

  return roots;
}

// Finds the node at a given id anywhere in the tree, used to jump to the
// depth-2 ancestor that "Continue this thread" links to.
export function findNode(tree: CommentNode[], id: string): CommentNode | null {
  for (const node of tree) {
    if (node.id === id) return node;
    const found = findNode(node.children, id);
    if (found) return found;
  }
  return null;
}

// Re-bases a subtree's depth to start at 0, for the standalone thread screen
// (post/[id]/thread/[commentId]).
export function rebaseDepth(node: CommentNode): CommentNode {
  const baseline = node.depth;
  const walk = (n: CommentNode): CommentNode => ({
    ...n,
    depth: n.depth - baseline,
    children: n.children.map(walk),
  });
  return walk(node);
}
