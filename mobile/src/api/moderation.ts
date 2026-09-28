// Thin Supabase calls for reporting content (MOBILE-PLAN.md §2.9, §4 Report,
// §6 Moderation flow). Admin-side moderation (queue, resolve, strikes,
// filters) lives in api/admin.ts. No react-query here — src/app/report.tsx
// calls these directly (same pattern as settings/username.tsx).

import { supabase } from '@/lib/supabase';
import type { ReportTarget } from '@/types/models';
import type { ReportCategory } from '@/lib/constants';

export type SubmitReportInput = {
  targetType: ReportTarget;
  targetId: string;
  category: ReportCategory;
  details?: string | null;
  conversationId?: string | null;
};

export async function submitReport(input: SubmitReportInput): Promise<string> {
  const { data, error } = await supabase.rpc('submit_report', {
    p_target_type: input.targetType,
    p_target_id: input.targetId,
    p_category: input.category,
    p_details: input.details?.trim() ? input.details.trim() : null,
    p_conversation_id: input.conversationId ?? null,
  });
  if (error) throw error;
  return data as string;
}

// Session-local memory of posts the viewer has reported (MOBILE-PLAN.md §4
// Report: "The item is hidden locally (feeds exclude posts you reported)").
// This is a client-only convenience for the window before the server-side
// auto-hide threshold (3 distinct reporters, or 2 for "illegal" — §2.9
// submit_report) is reached; it intentionally isn't persisted to storage.
const reportedPostIds = new Set<string>();

export function markPostReportedLocally(postId: string): void {
  reportedPostIds.add(postId);
}

export function isPostReportedLocally(postId: string): boolean {
  return reportedPostIds.has(postId);
}
