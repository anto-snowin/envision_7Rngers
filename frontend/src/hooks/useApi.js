/**
 * Small data-fetching hooks.
 *
 * Deliberately not a full query library: the dashboard's freshness comes from
 * Socket.IO pushes rather than polling, so what is needed is a predictable
 * `{ data, isLoading, error, refetch }` shape plus safe cleanup.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Run an async request on mount and whenever `deps` change.
 *
 * @param {Function} fetcher async function returning `{ data, meta }`
 * @param {Array} deps dependency list
 * @param {object} [options]
 * @param {boolean} [options.enabled] skip the request when false
 * @param {*} [options.initialData]
 */
export function useFetch(fetcher, deps = [], { enabled = true, initialData = null } = {}) {
  const [data, setData] = useState(initialData);
  const [meta, setMeta] = useState(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState(null);

  // A request counter, so a slow earlier response cannot overwrite a newer one.
  const requestId = useRef(0);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const execute = useCallback(
    async ({ silent = false } = {}) => {
      if (!enabled) return null;

      const id = ++requestId.current;
      if (!silent) setIsLoading(true);
      setError(null);

      try {
        const response = await fetcher();

        // Ignore a response that a newer request has already superseded.
        if (id !== requestId.current || !isMounted.current) return null;

        setData(response?.data ?? null);
        setMeta(response?.meta ?? null);
        return response?.data ?? null;
      } catch (err) {
        if (id !== requestId.current || !isMounted.current) return null;
        setError(err);
        return null;
      } finally {
        if (id === requestId.current && isMounted.current && !silent) {
          setIsLoading(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller-supplied deps
    [enabled, ...deps]
  );

  useEffect(() => {
    if (enabled) execute();
    else setIsLoading(false);
  }, [execute, enabled]);

  return {
    data,
    meta,
    isLoading,
    error,
    /** Re-run the request, showing the loading state. */
    refetch: execute,
    /** Re-run quietly, for socket-triggered background refreshes. */
    refresh: () => execute({ silent: true }),
    setData,
  };
}

/**
 * Wrap a mutating request with pending/error state.
 *
 * @param {Function} mutator async function performing the write
 */
export function useMutation(mutator) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState(null);

  const mutate = useCallback(
    async (...args) => {
      setIsPending(true);
      setError(null);
      try {
        return await mutator(...args);
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        setIsPending(false);
      }
    },
    [mutator]
  );

  return { mutate, isPending, error, reset: () => setError(null) };
}

/**
 * Debounce a rapidly-changing value — used by the patient search box so typing
 * does not fire a request per keystroke.
 */
export function useDebounced(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

/**
 * Throttle a callback so it runs at most once per `delay`.
 *
 * This matters a great deal for the socket-driven pages. A patient's phone
 * posts a fix every 5 seconds, and each fix emits a `location:update`. Calling
 * a refetch directly from that handler means one caretaker watching three
 * patients generates 72 requests a minute — over a thousand per 15 minutes,
 * which trips the API's own rate limiter while the dashboard just sits there.
 *
 * The socket payload already carries the new position, so the only reason to
 * refetch at all is to refresh derived figures (daily distance, counters).
 * Those do not need five-second accuracy, so they are throttled instead.
 *
 * The trailing call is preserved: if events arrive during the cooldown, one
 * final invocation runs when it ends, so the UI never settles on stale data.
 */
export function useThrottledCallback(callback, delay = 10000) {
  const callbackRef = useRef(callback);
  const lastRunRef = useRef(0);
  const timerRef = useRef(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Drop any pending trailing call when the component goes away.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  return useCallback(
    (...args) => {
      const now = Date.now();
      const elapsed = now - lastRunRef.current;

      if (elapsed >= delay) {
        lastRunRef.current = now;
        callbackRef.current?.(...args);
        return;
      }

      // Already scheduled — the pending call will cover this event too.
      if (timerRef.current) return;

      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        lastRunRef.current = Date.now();
        callbackRef.current?.(...args);
      }, delay - elapsed);
    },
    [delay]
  );
}

/**
 * A value that updates on an interval — used to re-render relative timestamps
 * ("3 min ago") without refetching anything.
 */
export function useTicker(intervalMs = 10000) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return tick;
}
