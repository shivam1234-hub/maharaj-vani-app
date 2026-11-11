import { useEffect, useState } from 'react';
import { MAHARAJAS } from '../data/maharajas';
import type { VerseVideo } from '../data/verseIndex';
import type { VideoResult } from '../data/types';
import { search } from '../utils/youtube';
import { entryEnd, entryStart, parseVerseRefs, type BookKey } from '../utils/verseRef';

/** An indexed verse video in the shape VideoCard takes. */
export const verseVideoResult = (v: VerseVideo): VideoResult => ({
  videoId: v.videoId,
  title: v.title,
  channel: v.channel,
  durationSec: v.durationSec,
  thumbnail: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
});

/**
 * What to type into YouTube for a verse, or for a chapter when `entry` is null.
 * Lecture titles spell the smaller books out ("Nectar of Instruction Text 5"),
 * so those are searched by name rather than by the short label.
 */
function queryFor(book: BookKey, n: number, entry: string | null, label: string): string {
  switch (book) {
    case 'NOI':
      return entry ? `Nectar of Instruction text ${entry}` : 'Nectar of Instruction';
    case 'ISO':
      if (entry === '0') return 'Sri Isopanisad invocation';
      return entry ? `Sri Isopanisad mantra ${entry.replace('-', ' ')}` : 'Sri Isopanisad';
    case 'BS':
      return entry ? `Brahma Samhita verse ${entry.replace('-', ' ')}` : 'Brahma Samhita';
    case 'NOD':
      return n === 0 ? 'Nectar of Devotion introduction' : `Nectar of Devotion chapter ${n}`;
    default:
      return label.replace('-', ' ');
  }
}

/**
 * Live YouTube search for a verse ("SB 1.2.6 lecture") — or, with `entry`
 * null, for a chapter (used for The Nectar of Devotion, followed chapter by
 * chapter) — keeping only videos whose title names this very verse or
 * chapter: the bare query returns neighbouring verses and unrelated talks too.
 * Videos already listed from the index are dropped.
 */
export function useLiveVerseVideos(
  book: BookKey,
  part: string,
  n: number,
  entry: string | null,
  label: string,
  known: VerseVideo[],
  speaker: string,
) {
  const [videos, setVideos] = useState<VideoResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 20000);
    let stale = false;
    setLoading(true);
    setError(false);
    const lo = entry == null ? null : entryStart(entry);
    const hi = entry == null ? null : entryEnd(entry);
    const knownIds = new Set(known.map((v) => v.videoId));
    const who = speaker !== 'all' && speaker in MAHARAJAS ? `${MAHARAJAS[speaker as keyof typeof MAHARAJAS].short} ` : '';
    const query = `${who}${queryFor(book, n, entry, label)} lecture`;

    search(query, ctrl.signal)
      .then((page) => {
        if (stale) return;
        const hits = page.videos.filter((v) => {
          if (knownIds.has(v.videoId)) return false;
          if (v.durationSec != null && v.durationSec < 300) return false;
          return parseVerseRefs(v.title).some(
            (r) =>
              r.book === book &&
              (book === 'BG' || r.part === part) &&
              r.chapter === n &&
              (lo == null ||
                (r.from != null && r.from <= hi! && (r.to ?? r.from) >= lo)),
          );
        });
        setVideos(hits);
      })
      .catch(() => {
        if (!stale) setError(true);
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
    // `known` is derived from the same verse; keying on the verse is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, part, n, entry, label, speaker, nonce]);

  return { videos, loading, error, retry: () => setNonce((x) => x + 1) };
}
