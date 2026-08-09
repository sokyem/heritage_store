'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Shared data-fetching hook for admin pages. Replaces the
// `.then(r => r.ok ? r.json() : null).catch(() => {})` pattern that was
// silently hiding errors across the admin. Every admin page that calls
// this gets consistent loading / error / empty state semantics for free.

export interface AdminFetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export interface UseAdminFetchOptions {
  enabled?: boolean;
  // Optional polling interval in ms. Use sparingly — the dashboard polls
  // every 30s, most pages should not poll at all.
  pollIntervalMs?: number;
}

/**
 * GET <url> as JSON. Captures a real error message on:
 *   - network failure (fetch throws)
 *   - non-2xx HTTP responses (extracts { error } / { detail } from the body)
 *   - body that isn't valid JSON
 *
 * The returned `error` string is suitable for direct rendering in an
 * <AdminErrorBanner>. Page components should never need to call
 * `.catch(() => {})` again.
 */
export function useAdminFetch<T = unknown>(
  url: string | null,
  options: UseAdminFetchOptions = {},
): AdminFetchState<T> {
  const { enabled = true, pollIntervalMs } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(url) && enabled);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!url || !enabled) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, { signal: controller.signal });
      const text = await res.text();
      let body: unknown = null;
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          if (!res.ok) {
            throw new Error(`Server returned ${res.status}: ${text.slice(0, 240)}`);
          }
        }
      }
      if (!res.ok) {
        const detail =
          body && typeof body === 'object'
            ? (body as Record<string, unknown>).error || (body as Record<string, unknown>).detail
            : null;
        throw new Error(
          typeof detail === 'string' && detail.length > 0
            ? detail
            : `Request failed (${res.status})`,
        );
      }
      setData(body as T);
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [url, enabled]);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  useEffect(() => {
    if (!pollIntervalMs || !url || !enabled) return;
    const id = setInterval(() => {
      load();
    }, pollIntervalMs);
    return () => clearInterval(id);
  }, [pollIntervalMs, url, enabled, load]);

  return { data, loading, error, refetch: load };
}
