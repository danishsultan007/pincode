import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { env } from './env';

// Untyped client on purpose (see MOBILE-PLAN.md §0): hand-written models live
// in src/types/models.ts. Falls back to a placeholder URL/key so the module
// can be imported even before .env is filled in; src/app/_layout.tsx renders
// <SetupNeeded/> in that case instead of making real calls.
export const supabase = createClient(
  env.supabaseUrl || 'https://placeholder.supabase.co',
  env.supabaseAnonKey || 'placeholder',
  {
    auth: {
      storage: Platform.OS === 'web' ? undefined : AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === 'web',
      flowType: 'pkce',
    },
  }
);

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

// supabase-js's RealtimeClient.channel(topic) reuses an existing channel
// object if one with that exact topic is still registered, instead of
// creating a fresh one — and supabase.removeChannel() is async (it awaits an
// unsubscribe round trip before deregistering). So an effect that creates a
// channel named e.g. `msg:${id}` on mount and calls removeChannel() on
// cleanup can, if it remounts for the same id before that await resolves,
// get back the OLD channel — already subscribed — and calling .on() on it
// throws "cannot add `postgres_changes` callbacks ... after `subscribe()`".
// A random suffix makes every mount's topic unique, so this reuse can never
// happen; the suffix has no effect on the Postgres-side filter/subscription.
export function uniqueChannel(base: string) {
  return supabase.channel(`${base}:${Math.random().toString(36).slice(2)}`);
}
