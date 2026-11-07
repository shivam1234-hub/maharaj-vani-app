import { useCallback, useEffect, useRef, useState } from 'react';
import { VideoResult } from '../data/types';
import { search, searchMore } from '../utils/youtube';

export interface UseYouTubeResult {
  videos: VideoResult[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  retry: () => void;
}

/**
 * Live YouTube search for one Maharaja.
 *
 * `baseQuery` (the Maharaja's name) is always prepended so results stay on
 * topic even when the user types only a theme like "humility". Requests are
 * debounced and the in-flight one is aborted on every change, so fast typing
 * doesn't leave stale results to land out of order.
 */
export function useYouTube(baseQuery: string, userQuery: string, debounceMs = 450): UseYouTubeResult {
  const [videos, setVideos] = useState<VideoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const pageRef = useRef<{ apiKey: string | null; continuation: string | null }>({
    apiKey: null,
    continuation: null,
  });
  const abortRef = useRef<AbortController | null>(null);
  const seenRef = useRef<Set<string>>(new Set());

  const effectiveQuery = [baseQuery, userQuery.trim()].filter(Boolean).join(' ');

  useEffect(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError(null);

    // Without this, a request that never settles leaves the spinner running
    // for ever with no way back — observed on a slow connection.
    const HARD_TIMEOUT_MS = 20000;
    let timedOut = false;
    const killer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, debounceMs + HARD_TIMEOUT_MS);

    const timer = setTimeout(async () => {
      try {
        const page = await search(effectiveQuery, ctrl.signal);
        if (ctrl.signal.aborted) return;
        seenRef.current = new Set(page.videos.map((v) => v.videoId));
        pageRef.current = { apiKey: page.apiKey, continuation: page.continuation };
        setVideos(page.videos);
      } catch (e: any) {
        // A timeout aborts the same way a supersede does, so it has to be
        // told apart — otherwise it returns silently and the spinner sticks.
        if (timedOut) {
          setError('YouTube took too long to respond');
          setVideos([]);
          setLoading(false);
          return;
        }
        if (ctrl.signal.aborted || e?.name === 'AbortError') return;
        setError(e?.message ?? 'Search failed');
        setVideos([]);
      } finally {
        clearTimeout(killer);
        if (!ctrl.signal.aborted || timedOut) setLoading(false);
      }
    }, debounceMs);

    return () => {
      clearTimeout(timer);
      clearTimeout(killer);
      ctrl.abort();
    };
  }, [effectiveQuery, debounceMs, nonce]);

  const loadMore = useCallback(async () => {
    const { apiKey, continuation } = pageRef.current;
    if (!apiKey || !continuation || loadingMore || loading) return;

    setLoadingMore(true);
    try {
      const page = await searchMore(apiKey, continuation);
      // YouTube repeats results across continuations; drop anything already shown.
      const fresh = page.videos.filter((v) => !seenRef.current.has(v.videoId));
      for (const v of fresh) seenRef.current.add(v.videoId);
      pageRef.current = { apiKey, continuation: page.continuation };
      setVideos((prev) => [...prev, ...fresh]);
    } catch {
      // A failed page-2 shouldn't wipe page-1; just stop paging.
      pageRef.current = { apiKey, continuation: null };
    } finally {
      setLoadingMore(false);
    }
  }, [loading, loadingMore]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);

  return {
    videos,
    loading,
    loadingMore,
    error,
    hasMore: Boolean(pageRef.current.continuation),
    loadMore,
    retry,
  };
}
