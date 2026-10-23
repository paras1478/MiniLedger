import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, isAbortError } from '@/lib/api-client';

export interface FocusedQuery<T> {
  data: T | null;
  /** The last load failed. If `data` is also set, it is from an earlier successful load. */
  error: ApiError | null;
  isLoading: boolean;
  isRefreshing: boolean;
  /** Pull-to-refresh / retry. */
  refresh: () => void;
  /** Patch data locally after a mutation (e.g. a loan marked repaid). */
  setData: (update: (current: T | null) => T | null) => void;
}

/**
 * Loads data when the screen gains focus (so values refresh after adding or repaying a loan
 * on another screen) and on demand. Concurrent loads are collapsed into one request, and a
 * load started for an old `fetcher` is cancelled when `fetcher` changes or the screen unmounts.
 */
export function useFocusedQuery<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  options: { keepPreviousData?: boolean } = {}
): FocusedQuery<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const inFlight = useRef<AbortController | null>(null);

  // A new fetcher (e.g. a different filter) starts fresh, unless `keepPreviousData` keeps the
  // old results on screen while it loads (e.g. while typing a search). Adjusting state during
  // render is React's recommended way to reset state when an input changes.
  const [activeFetcher, setActiveFetcher] = useState(() => fetcher);
  if (activeFetcher !== fetcher) {
    setActiveFetcher(() => fetcher);
    setIsLoading(true);
    if (!options.keepPreviousData) setDataState(null);
    setError(null);
  }

  const load = useCallback(
    async (mode: 'background' | 'refresh') => {
      if (inFlight.current) return; // a load is already running
      const controller = new AbortController();
      inFlight.current = controller;
      if (mode === 'refresh') setIsRefreshing(true);
      try {
        const result = await fetcher(controller.signal);
        if (controller.signal.aborted) return;
        setDataState(result);
        setError(null);
      } catch (caught) {
        if (controller.signal.aborted || isAbortError(caught)) return;
        setError(
          caught instanceof ApiError ? caught : new ApiError(0, 'UNKNOWN', 'Something went wrong. Please try again.')
        );
      } finally {
        if (inFlight.current === controller) {
          inFlight.current = null;
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [fetcher]
  );

  // Cancel the request for the previous fetcher, and any request still running on unmount.
  useEffect(
    () => () => {
      inFlight.current?.abort();
      inFlight.current = null;
    },
    [fetcher]
  );

  useFocusEffect(
    useCallback(() => {
      void load('background');
    }, [load])
  );

  const refresh = useCallback(() => void load('refresh'), [load]);
  const setData = useCallback((update: (current: T | null) => T | null) => setDataState(update), []);

  return { data, error, isLoading, isRefreshing, refresh, setData };
}
