import { useCallback, useEffect, useState } from 'react';
import { api, type AnalyticsResult } from './api';

export type AnalyticsState<T> =
  | { status: 'loading' }
  | { status: 'pending' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; result: AnalyticsResult<T> };

type Pending = { status: 'pending'; retryAfter: number };

const MAX_POLLS = 12;
// Results for this page session, so switching back to a tab is instant.
const memo = new Map<string, AnalyticsResult<unknown>>();

/** Loads one analytics dataset, polling while GitHub is still computing, with an independent retry. */
export function useAnalytics<T>(path: string | null) {
  const [state, setState] = useState<AnalyticsState<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!path) return;
    const known = memo.get(path) as AnalyticsResult<T> | undefined;
    if (known) {
      setState({ status: 'ready', result: known });
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polls = 0;
    setState({ status: 'loading' });

    const load = async () => {
      try {
        const res = await api<AnalyticsResult<T> | Pending>(path);
        if (cancelled) return;
        if (res.status === 'pending') {
          if (++polls > MAX_POLLS) {
            setState({ status: 'error', error: new Error('GitHub is taking longer than usual to prepare these statistics.') });
            return;
          }
          setState({ status: 'pending' });
          timer = setTimeout(load, res.retryAfter * 1000);
          return;
        }
        memo.set(path, res);
        setState({ status: 'ready', result: res });
      } catch (error) {
        if (!cancelled) setState({ status: 'error', error });
      }
    };
    load();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [path, attempt]);

  const retry = useCallback(() => {
    if (path) memo.delete(path);
    setAttempt((n) => n + 1);
  }, [path]);

  return { state, retry };
}
