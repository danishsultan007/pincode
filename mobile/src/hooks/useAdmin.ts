import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invalidateAfter } from '@/lib/invalidate';
import * as adminApi from '@/api/admin';
import type { ReportCategory } from '@/lib/constants';
import type { ReportTarget } from '@/types/models';

// Admin screens (MOBILE-PLAN.md §4 Admin queue/item/user/filters, P8). Query
// keys: ['admin-queue', status], ['admin-queue-item', id], ['admin-reports',
// targetType, targetId], ['admin-target', targetType, targetId],
// ['admin-profile'|'admin-strikes'|'admin-actions', userId], ['admin-filters'].

export function useModerationQueue(status: 'open' | 'resolved') {
  return useQuery({
    queryKey: ['admin-queue', status],
    queryFn: () => adminApi.listModerationQueue(status),
  });
}

export function useQueueItem(id: string | undefined) {
  return useQuery({
    queryKey: ['admin-queue-item', id],
    queryFn: () => adminApi.getQueueItem(id as string),
    enabled: !!id,
  });
}

export function useReportsForTarget(targetType: ReportTarget | undefined, targetId: string | null | undefined) {
  return useQuery({
    queryKey: ['admin-reports', targetType, targetId],
    queryFn: () => adminApi.listReportsForTarget(targetType as ReportTarget, targetId as string),
    enabled: !!targetType && !!targetId,
  });
}

export function useTargetContent(targetType: ReportTarget | undefined, targetId: string | null | undefined) {
  return useQuery({
    queryKey: ['admin-target', targetType, targetId],
    queryFn: () => adminApi.getTargetContent(targetType as ReportTarget, targetId as string),
    enabled: !!targetType && !!targetId,
  });
}

export function useAdminProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ['admin-profile', userId],
    queryFn: () => adminApi.getProfileForAdmin(userId as string),
    enabled: !!userId,
  });
}

export function useStrikes(userId: string | null | undefined) {
  return useQuery({
    queryKey: ['admin-strikes', userId],
    queryFn: () => adminApi.listStrikes(userId as string),
    enabled: !!userId,
  });
}

export function useModerationActions(userId: string | undefined) {
  return useQuery({
    queryKey: ['admin-actions', userId],
    queryFn: () => adminApi.listModerationActions(userId as string),
    enabled: !!userId,
  });
}

function useInvalidateAdmin() {
  const queryClient = useQueryClient();
  return (userId?: string | null) => {
    queryClient.invalidateQueries({ queryKey: ['admin-queue'] });
    queryClient.invalidateQueries({ queryKey: ['admin-queue-item'] });
    queryClient.invalidateQueries({ queryKey: ['admin-reports'] });
    queryClient.invalidateQueries({ queryKey: ['admin-target'] });
    invalidateAfter(queryClient, 'moderation');
    if (userId) {
      queryClient.invalidateQueries({ queryKey: ['admin-profile', userId] });
      queryClient.invalidateQueries({ queryKey: ['admin-strikes', userId] });
      queryClient.invalidateQueries({ queryKey: ['admin-actions', userId] });
    }
  };
}

export type ResolveItemInput = {
  itemId: string;
  decision: 'restore' | 'remove' | 'dismiss';
  userId?: string | null;
  strike?: boolean;
  reason?: string | null;
  category?: ReportCategory;
  severe?: boolean;
};

export function useResolveItem() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: ({ itemId, decision, ...opts }: ResolveItemInput) => adminApi.adminResolveItem(itemId, decision, opts),
    onSuccess: (_data, vars) => invalidate(vars.userId),
  });
}

export type IssueStrikeInput = { userId: string; reason: string; category: ReportCategory; severe?: boolean };

export function useIssueStrike() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: ({ userId, reason, category, severe }: IssueStrikeInput) =>
      adminApi.adminIssueStrike(userId, reason, category, severe),
    onSuccess: (_data, vars) => invalidate(vars.userId),
  });
}

export function useLiftBan() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: ({ userId, note }: { userId: string; note?: string | null }) => adminApi.adminLiftBan(userId, note),
    onSuccess: (_data, vars) => invalidate(vars.userId),
  });
}

export function useFilterTerms() {
  return useQuery({ queryKey: ['admin-filters'], queryFn: adminApi.listFilterTerms });
}

export function useToggleFilterTerm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => adminApi.setFilterTermActive(id, active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-filters'] }),
  });
}

export function useAddFilterTerm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: adminApi.NewFilterTermInput) => adminApi.addFilterTerm(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-filters'] }),
  });
}

export function useTestFilter() {
  return useMutation({
    mutationFn: ({ text, scope }: { text: string; scope: string }) => adminApi.testFilter(text, scope),
  });
}
