import { useRouter } from 'expo-router';
import { useAuth } from '@/providers/AuthProvider';

// Every mutating action calls this first (MOBILE-PLAN.md §4): with no
// session it pushes /welcome and returns false; the caller bails out.
export function useRequireAuth() {
  const router = useRouter();
  const { session } = useAuth();

  return function requireAuth(): boolean {
    if (!session) {
      router.push('/welcome');
      return false;
    }
    return true;
  };
}
