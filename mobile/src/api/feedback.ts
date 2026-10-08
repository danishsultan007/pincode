import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

export type FeedbackCategory = 'bug' | 'idea' | 'other';
export type FeedbackStatus = 'new' | 'seen' | 'closed';

export type FeedbackRow = {
  id: string;
  user_id: string;
  message: string;
  category: FeedbackCategory;
  app_version: string | null;
  platform: string | null;
  status: FeedbackStatus;
  created_at: string;
};

export async function sendFeedback(input: { message: string; category: FeedbackCategory }): Promise<void> {
  const { error } = await supabase.from('feedback').insert({
    message: input.message.trim(),
    category: input.category,
    app_version: Constants.expoConfig?.version ?? null,
    platform: Platform.OS,
  });
  if (error) throw error;
}

// Admin-only (RLS): "open" = new + seen, "closed" = closed.
export async function listFeedback(view: 'open' | 'closed'): Promise<FeedbackRow[]> {
  let q = supabase.from('feedback').select('*').order('created_at', { ascending: false }).limit(200);
  q = view === 'open' ? q.in('status', ['new', 'seen']) : q.eq('status', 'closed');
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as FeedbackRow[];
}

export async function setFeedbackStatus(id: string, status: FeedbackStatus): Promise<void> {
  const { error } = await supabase.from('feedback').update({ status }).eq('id', id);
  if (error) throw error;
}
