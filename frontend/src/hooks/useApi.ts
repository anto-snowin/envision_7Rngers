'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api';

interface QueryState<T> {
  data: T | null;
  error: string | null;
  isLoading: boolean;
  /** True on a background refetch, so the UI can keep showing stale data. */
  isRefreshing: boolean;
  refresh: () => void;
  setData: (value: T | null) => void;
}

/**
 * Minimal data-fetching hook.
 *
 * No cache and no dedupe — this app's reads are small and nearly all of them
 * are invalidated by a socket event rather than by time, so a query library's
 * machinery would not earn its weight.
 *
 * `fetcher` must be stable (wrap it in `useCallback`); it is the effect's only
 * dependency, so an inline function would re-fetch on every render.
 */
export function useApi<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  options: { enabled?: boolean } = {}
): QueryState<T> {
  const { enabled = true } = options;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [tick, setTick] = useState(0);

  const hasLoaded = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    if (hasLoaded.current) setIsRefreshing(true);
    else setIsLoading(true);

    fetcher(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result);
        setError(null);
        hasLoaded.current = true;
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        if ((caught as Error)?.name === 'AbortError') return;
        setError(
          caught instanceof ApiError ? caught.message : 'Something went wrong. Please retry.'
        );
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setIsLoading(false);
        setIsRefreshing(false);
      });

    return () => controller.abort();
  }, [fetcher, enabled, tick]);

  const refresh = useCallback(() => setTick((value) => value + 1), []);

  return { data, error, isLoading, isRefreshing, refresh, setData };
}

/**
 * Throttle a callback to at most one call per `delay`, leading and trailing.
 *
 * This exists because of a concrete failure: the caretaker dashboard refetches
 * on every `location:update`, and with several patients reporting, an idle
 * dashboard was generating enough traffic to trip the API's own rate limiter.
 * The leading call keeps the UI feeling live; the trailing call guarantees the
 * last event in a burst is not dropped.
 */
export function useThrottledCallback(callback: () => void, delay: number) {
  const callbackRef = useRef(callback);
  const lastRun = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return useCallback(() => {
    const now = Date.now();
    const elapsed = now - lastRun.current;

    if (elapsed >= delay) {
      lastRun.current = now;
      callbackRef.current();
      return;
    }

    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      lastRun.current = Date.now();
      callbackRef.current();
    }, delay - elapsed);
  }, [delay]);
}

/** `setInterval` that survives re-renders and pauses when `delay` is null. */
export function useInterval(callback: () => void, delay: number | null) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => callbackRef.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

/**
 * Re-render on a timer so relative timestamps ("4 min ago") stay honest.
 *
 * Without this, a dashboard left open overnight would still claim the last fix
 * arrived "just now".
 */
export function useClockTick(intervalMs = 30_000) {
  const [, setTick] = useState(0);
  useInterval(() => setTick((value) => value + 1), intervalMs);
}
