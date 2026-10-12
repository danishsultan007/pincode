// Thin Supabase calls for profiles (MOBILE-PLAN.md §2.2). No react-query
// here — see hooks/useProfile.ts for the query/mutation wrappers.

import { supabase } from '@/lib/supabase';
import { readImage } from '@/lib/readImage';
import type { NotificationPrefs, Profile, PublicProfileBundle } from '@/types/models';

export async function getProfileByUsername(username: string): Promise<PublicProfileBundle | null> {
  const { data, error } = await supabase.rpc('get_profile', { p_username: username });
  if (error) throw error;
  return (data as PublicProfileBundle | null) ?? null;
}

export async function usernameAvailable(username: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('username_available', { p_username: username });
  if (error) throw error;
  return Boolean(data);
}

export async function suggestUsernames(hint?: string | null, count = 6): Promise<string[]> {
  const { data, error } = await supabase.rpc('suggest_usernames', { p_hint: hint ?? null, p_count: count });
  if (error) throw error;
  return (data as string[] | null) ?? [];
}

export async function emailAvailable(email: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('email_available', { p_email: email });
  if (error) throw error;
  return Boolean(data);
}

export async function phoneAvailable(phone: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('phone_available', { p_phone: phone });
  if (error) throw error;
  return Boolean(data);
}

export type CompleteOnboardingInput = {
  username: string;
  displayName: string;
  phone: string;
  interests: string[];
  homePincode: string | null;
  homeArea: string | null;
  homeCity: string | null;
  lat: number | null;
  lng: number | null;
};

export async function completeOnboarding(input: CompleteOnboardingInput): Promise<Profile> {
  const { data, error } = await supabase.rpc('complete_onboarding', {
    p_username: input.username,
    p_display_name: input.displayName,
    p_phone: input.phone,
    p_interests: input.interests,
    p_home_pincode: input.homePincode,
    p_home_area: input.homeArea,
    p_home_city: input.homeCity,
    p_lat: input.lat,
    p_lng: input.lng,
  });
  if (error) throw error;
  return data as Profile;
}

export async function acceptTerms(version: string): Promise<void> {
  const { error } = await supabase.rpc('accept_terms', { p_version: version });
  if (error) throw error;
}

export async function changeUsername(username: string): Promise<void> {
  const { error } = await supabase.rpc('change_username', { p_username: username });
  if (error) throw error;
}

export async function updatePhone(phone: string): Promise<void> {
  const { error } = await supabase.rpc('update_phone', { p_phone: phone });
  if (error) throw error;
}

export async function setHomeLocation(input: {
  lat: number;
  lng: number;
  pincode: string | null;
  area: string | null;
  city: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('set_home_location', {
    p_lat: input.lat,
    p_lng: input.lng,
    p_pincode: input.pincode,
    p_area: input.area,
    p_city: input.city,
  });
  if (error) throw error;
}

// Goes through the delete-account Edge Function so the user's uploaded files
// are removed from storage too (the old delete_my_account RPC left them behind).
export async function deleteMyAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
  if (error) {
    let message = 'Could not delete your account. Please try again.';
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body?.message) message = body.message;
    } catch {
      // keep the generic message
    }
    throw new Error(message);
  }
}

export type ProfileEditInput = Partial<Pick<Profile, 'display_name' | 'bio' | 'interests' | 'avatar_url'>>;

export async function updateMyProfile(uid: string, input: ProfileEditInput): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').update(input).eq('id', uid).select('*').single();
  if (error) throw error;
  return data as Profile;
}

// Avatar path convention per MOBILE-PLAN.md §2.10: avatars/<uid>/avatar-<ts>.<ext>
export async function uploadAvatar(uid: string, uri: string): Promise<string> {
  const { bytes, mime, ext } = await readImage(uri);
  const path = `${uid}/avatar-${Date.now()}.${ext === 'gif' ? 'jpg' : ext}`;
  const { error } = await supabase.storage.from('avatars').upload(path, bytes, { contentType: ext === 'gif' ? 'image/jpeg' : mime, upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
}

export async function updateNotificationPrefs(uid: string, prefs: NotificationPrefs): Promise<void> {
  const { error } = await supabase.from('private_profiles').update({ notification_prefs: prefs }).eq('id', uid);
  if (error) throw error;
}

export async function setReadReceipts(uid: string, on: boolean): Promise<void> {
  const { error } = await supabase.from('private_profiles').update({ read_receipts: on }).eq('id', uid);
  if (error) throw error;
}

export type BlockedUser = Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>;

// Two FKs point from blocks to profiles, so the embed needs the constraint
// name to disambiguate (default Postgres naming for an unnamed FK).
export async function listBlockedUsers(): Promise<BlockedUser[]> {
  const { data, error } = await supabase
    .from('blocks')
    .select('blocked:profiles!blocks_blocked_id_fkey(id, username, display_name, avatar_url)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as { blocked: BlockedUser }[]).map((row) => row.blocked).filter(Boolean);
}

export async function unblockUser(blockedId: string): Promise<void> {
  const { error } = await supabase.from('blocks').delete().eq('blocked_id', blockedId);
  if (error) throw error;
}
