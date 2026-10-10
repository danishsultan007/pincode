import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';

// Tabs and stack screens stay mounted while you are elsewhere, so their queries
// never refetch on return. Call this on screens whose data other people or
// other screens can change (own stats, joined communities, ...): on every
// refocus after the first it re-validates the given keys (pass exact keys so other mounted screens are not refetched), but at most
// every `minGapMs` so rapid tab hopping stays cheap. Lists keep showing cached
// data while the refetch runs, so there is no spinner flash.
export function useRefreshOnFocus(keys: QueryKey[], minGapMs = 5000) {
  const queryClient = useQueryClient();
  const last = useRef(Date.now()); // the initial mount already fetched
  const keyList = JSON.stringify(keys);

  useFocusEffect(
    useCallback(() => {
      if (Date.now() - last.current < minGapMs) return;
      last.current = Date.now();
      for (const queryKey of JSON.parse(keyList) as QueryKey[]) queryClient.invalidateQueries({ queryKey });
    }, [queryClient, keyList, minGapMs])
  );
}
