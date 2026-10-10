import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.pincode.app';
export const PLAY_MARKET_URL = 'market://details?id=com.pincode.app';

// The installed app version (runtime version == app version, see app.config.ts).
// expoConfig is absent in some bare/updated contexts; runtimeVersion is
// null/undefined in dev. Returns null when neither is known so callers can fail
// open rather than treating an unreadable version as 'too old'.
export function currentVersion(): string | null {
  return Constants.expoConfig?.version ?? Updates.runtimeVersion ?? null;
}

// Numeric major.minor.patch compare: true when `a` is strictly older than `b`.
// Missing or non-numeric parts count as 0, so '1.0' equals '1.0.0', and a
// suffix like '1.2.0-beta.1' parses as 1.2.0.
export function isOlder(a: string, b: string): boolean {
  const parse = (v: string) => [0, 1, 2].map((i) => parseInt(v.split('.')[i] ?? '', 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i];
  }
  return false;
}
