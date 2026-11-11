import { useEffect, useMemo, useRef, useState } from 'react';
import { MaharajKey, Recording, VideoResult } from '../data/types';
import { MAHARAJ_ORDER, MAHARAJAS } from '../data/maharajas';
import { getAllCatalogs, matches, normalize, relevance } from './useLectures';
import { search } from '../utils/youtube';

/**
 * One search across every Maharaja and both sources.
 *
 * The archive half is local, so it filters on every keystroke. The YouTube
 * half is three live requests — one per Maharaja, since a bare query would
 * return the whole of YouTube rather than these speakers — so it is debounced
 * and only fires once the query is worth spending requests on.
 */

export interface GlobalVideoHit extends VideoResult {
  maharaj: MaharajKey;
}

export interface GlobalSearchResult {
  audio: Recording[];
  audioTotal: number;
  videos: GlobalVideoHit[];
  videosLoading: boolean;
  videosError: string | null;
  /** Per-Maharaja counts for the archive half, for the summary line. */
  audioByMaharaj: Array<{ key: MaharajKey; count: number }>;
}

const DEBOUNCE_MS = 450;
const MIN_VIDEO_QUERY = 3;

export function useGlobalSearch(query: string, limit = 120): GlobalSearchResult {
  const [videos, setVideos] = useState<GlobalVideoHit[]>([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [videosError, setVideosError] = useState<string | null>(null);

  // --- archive: local, immediate ----------------------------------------
  const { audio, audioTotal, audioByMaharaj } = useMemo(() => {
    const terms = normalize(query).split(' ').filter(Boolean);
    if (!terms.length) {
      return { audio: [], audioTotal: 0, audioByMaharaj: [] };
    }

    const hits = getAllCatalogs().filter((r) => matches(r, terms));

    const counts = new Map<string, number>();
    for (const r of hits) counts.set(r.maharaj, (counts.get(r.maharaj) ?? 0) + 1);

    const sorted = hits
      .slice()
      .sort((a, b) => relevance(a, terms) - relevance(b, terms));

    return {
      audio: sorted.slice(0, limit),
      audioTotal: hits.length,
      audioByMaharaj: MAHARAJ_ORDER.filter((k) => counts.has(k)).map((k) => ({
        key: k,
        count: counts.get(k)!,
      })),
    };
  }, [query, limit]);

  // --- YouTube: debounced, one request per Maharaja ----------------------
  // Tracks the query each response belongs to, so a slow reply for an older
  // query cannot overwrite results for what is now on screen.
  const latestQuery = useRef('');

  useEffect(() => {
    const q = query.trim();
    latestQuery.current = q;

    if (q.length < MIN_VIDEO_QUERY) {
      setVideos([]);
      setVideosLoading(false);
      setVideosError(null);
      return;
    }

    setVideosLoading(true);
    setVideosError(null);

    const timer = setTimeout(async () => {
      const settled = await Promise.allSettled(
        MAHARAJ_ORDER.map(async (key) => {
          // Scope each request to the speaker; the raw query alone would pull
          // in unrelated YouTube results.
          const page = await search(`${MAHARAJAS[key].short} ${q}`);
          return page.videos.map((v): GlobalVideoHit => ({ ...v, maharaj: key }));
        }),
      );

      if (latestQuery.current !== q) return; // a newer query is in flight

      const merged: GlobalVideoHit[] = [];
      const seen = new Set<string>();
      let failures = 0;

      // Round-robin across the Maharajas so one prolific channel cannot fill
      // the whole list before the others get a row.
      const lists = settled.map((s) => {
        if (s.status === 'fulfilled') return s.value;
        failures++;
        return [] as GlobalVideoHit[];
      });
      const depth = Math.max(...lists.map((l) => l.length), 0);
      for (let i = 0; i < depth; i++) {
        for (const list of lists) {
          const v = list[i];
          if (v && !seen.has(v.videoId)) {
            seen.add(v.videoId);
            merged.push(v);
          }
        }
      }

      setVideos(merged);
      setVideosLoading(false);
      setVideosError(
        failures === lists.length ? 'Could not reach YouTube' : null,
      );
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  return { audio, audioTotal, videos, videosLoading, videosError, audioByMaharaj };
}
