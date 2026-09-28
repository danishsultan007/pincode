import { router } from 'expo-router';

// Every "Back" button in the app calls this instead of `router.back()`
// directly. Opening a screen straight from a URL — a shared link, an ngrok
// tunnel visit, or a browser reload on a deep route — leaves no navigation
// history behind it, so `router.back()` dispatches GO_BACK with nothing to
// go back to: Expo Router logs "not handled by any navigator" and the
// button silently does nothing, leaving the user stuck. Falling back to the
// root route (which redirects by auth state — see app/index.tsx) always
// takes them somewhere sensible instead.
export function goBack(): void {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/');
  }
}
