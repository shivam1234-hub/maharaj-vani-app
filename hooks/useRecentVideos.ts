import { useCallback, useEffect, useState } from 'react';
import { VideoResult } from '../data/types';
import { MaharajConfig } from '../data/maharajas';
import { ageSeconds, search } from '../utils/youtube';

/** Re-fetch at most this often per Maharaja while the app stays open. */
const FRESH_MS = 30 * 60 * 1000;

const cache = new Map<string, { at: number; videos: VideoResult[] }>();

/**
 * The newest YouTube uploads for the Maharaja on screen, for the Home row.
 *
 * A newest-first search returns anything that mentions the name, so results
 * are kept only when they come from one of his known channels or name him in
 * the title or channel. YouTube's date order is loose, so they are re-sorted
 * by their "N days ago" text.
 */
export function useRecentVideos(maharaj: MaharajConfig, limit = 10) {
  const cached = cache.get(maharaj.key);
  const [videos, setVideos] = useState<VideoResult[]>(cached?.videos ?? []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const hit = cache.get(maharaj.key);
    if (hit && Date.now() - hit.at < FRESH_MS && nonce === 0) {
      setVideos(hit.videos);
      setLoading(false);
      setError(null);
      return;
    }

    const ctrl = new AbortController();
    // Set on cleanup, so a superseded request (Maharaja switched mid-flight)
    // never writes its results over the new one's.
    let stale = false;
    const timeout = setTimeout(() => ctrl.abort(), 20000);
    setVideos(hit?.videos ?? []);
    setLoading(true);
    setError(null);

    const channelIds = new Set(maharaj.youtube.channels.map((c) => c.channelId));
    const isHis = (v: VideoResult) =>
      maharaj.youtube.match.test(v.title) ||
      maharaj.youtube.match.test(v.channel ?? '') ||
      (v.channelId != null && channelIds.has(v.channelId));

    search(maharaj.short, ctrl.signal, { newestFirst: true })
      .then((page) => {
        if (stale) return;
        const list = page.videos
          .filter(isHis)
          .sort((a, b) => ageSeconds(a.publishedText) - ageSeconds(b.publishedText))
          .slice(0, limit);
        cache.set(maharaj.key, { at: Date.now(), videos: list });
        setVideos(list);
      })
      .catch(() => {
        if (!stale && !hit) setError('Could not reach YouTube');
      })
      .finally(() => {
        clearTimeout(timeout);
        if (!stale) setLoading(false);
      });

    return () => {
      stale = true;
      clearTimeout(timeout);
      ctrl.abort();
    };
  }, [maharaj, limit, nonce]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);

  return { videos, loading, error, retry };
}
