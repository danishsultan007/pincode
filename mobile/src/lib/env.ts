// Reads each EXPO_PUBLIC_* var by literal dotted name — Expo/Metro only
// inlines literal `process.env.X` accesses, not bracket/dynamic lookups.

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const webUrl = process.env.EXPO_PUBLIC_WEB_URL ?? '';
const easProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? '';
const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
const googleAndroidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '';
const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';

export const env = {
  supabaseUrl,
  supabaseAnonKey,
  webUrl,
  easProjectId,
  googleWebClientId,
  googleAndroidClientId,
  googleIosClientId,
};

// True once real Supabase credentials are in place (not the placeholder from
// .env.example). Used by src/app/_layout.tsx to show <SetupNeeded/> instead
// of the normal navigation stack.
export const isConfigured = Boolean(
  env.supabaseUrl && env.supabaseAnonKey && !env.supabaseUrl.includes('YOUR-PROJECT')
);
