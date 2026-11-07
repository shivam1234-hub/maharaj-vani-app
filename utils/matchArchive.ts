import { MaharajKey, Recording } from '../data/types';
import { getCatalog } from '../hooks/useLectures';

/**
 * Maps a YouTube video to the same lecture in the audio archive.
 *
 * Why this exists: the YouTube embed refuses to play once the page is hidden —
 * its own script hooks the Page Visibility API, which is how YouTube reserves
 * background playback for Premium — and it sits in a cross-origin iframe, so
 * nothing can be overridden from our side. The archive MP3 of the same lecture
 * has no such restriction and plays through react-native-track-player, which
 * owns a foreground service and a real media notification. Handing playback to
 * the archive copy is therefore the only dependable way to listen with the app
 * closed.
 *
 * Titles are worded very differently across the two sources, so matching leans
 * on the signals that are stable when present — the verse reference and the
 * date — and falls back to distinctive-word overlap.
 *
 * Everything is served off lazily-built indexes rather than a linear scan,
 * because this also runs per row in the video list to badge which results have
 * archive audio; scanning 8,302 records per row would not be viable.
 */

export interface ArchiveMatch {
  recording: Recording;
  score: number;
  /** Why it matched, so the UI can be honest about confidence. */
  reason: string;
  /** True when a verse or exact date matched — trustworthy on its own. */
  confident: boolean;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9,
  sept: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
};

const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();

/** "S.B. 3.13.50", "SB-07 15 68", "BG 2.66" -> "SB 3.13.50". */
export function extractScripture(text: string): string | null {
  // Channels write the book as dotted initials ("S.B.", "B.G.", "C.C."), which
  // a \b(SB|BG)\b pattern never sees. Collapse those first — without this the
  // verse is missed and matching falls back to word overlap, which happily
  // returns a different lecture.
  const s = text
    .replace(/\b([A-Za-z])\.\s?([A-Za-z])\.(?:\s?([A-Za-z])\.)?/g,
      (_m, a, b, c) => `${a}${b}${c ?? ''}`)
    .replace(/_/g, ' ');

  const m = s.match(/\b(BG|SB|CC|NOI|NOD|ISO|BS)\b\.?[-\s]*((?:\d{1,3})(?:[.\-\s]\d{1,3}){0,3})/i);
  if (!m || !m[2]) return null;
  const ref = m[2].trim().replace(/[-\s]+/g, '.').replace(/\.+/g, '.')
    .split('.').map(p => p.replace(/^0+(?=\d)/, '')).join('.');
  return `${m[1].toUpperCase()} ${ref}`;
}

const iso = (y: number, mo: number, d: number) =>
  y >= 1965 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31
    ? `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    : null;

/**
 * Dates as the channels write them: "29th Mar. '26", "19 Jan 2018",
 * "2026-07-27", "12th Apr. 2026".
 */
export function extractDate(text: string): string | null {
  let m;

  if ((m = text.match(/(20\d{2}|19\d{2})-(\d{1,2})-(\d{1,2})/)))
    return iso(+m[1], +m[2], +m[3]);

  if ((m = text.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s*'?(\d{2,4})/))) {
    const mo = MONTHS[m[2].toLowerCase()];
    if (mo) {
      let y = +m[3];
      if (y < 100) y += 2000;
      return iso(y, mo, +m[1]);
    }
  }

  if ((m = text.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*'?(\d{2,4})/))) {
    const mo = MONTHS[m[1].toLowerCase()];
    if (mo) {
      let y = +m[3];
      if (y < 100) y += 2000;
      return iso(y, mo, +m[2]);
    }
  }

  return null;
}

/** Words that carry no distinguishing power between these titles. */
const STOP = new Set([
  'the', 'and', 'a', 'an', 'of', 'to', 'in', 'on', 'by', 'is', 'are', 'for',
  'with', 'his', 'holiness', 'hh', 'radhanath', 'swami', 'maharaj', 'maharaja',
  'lokanath', 'lokanatha', 'lns', 'ashraya', 'vaishnava', 'vaisnava', 'bavs',
  'gour', 'ggs', 'rns', 'iskcon', 'lecture', 'class', 'srila',
  'prabhupada', 'part', 'live', 'full', 'hindi', 'english', 'mumbai',
  'chowpatty', 'mayapur', 'temple', 'krishna', 'krsna', 'lord', 'sri',
]);

const contentWords = (s: string): string[] =>
  [...new Set(normalize(s).split(' ').filter(w => w.length > 3 && !STOP.has(w)))];

/**
 * A word appearing in this many archive titles tells us nothing and would drag
 * in a huge candidate set, so it is skipped when gathering candidates (it can
 * still contribute to the score once a candidate is in play).
 */
const TOO_COMMON = 500;

interface Index {
  byVerse: Map<string, Recording[]>;
  byDate: Map<string, Recording[]>;
  byWord: Map<string, Recording[]>;
  wordsOf: Map<string, Set<string>>;
}

const indexes: Partial<Record<MaharajKey, Index>> = {};

function getIndex(key: MaharajKey): Index {
  const cached = indexes[key];
  if (cached) return cached;

  const byVerse = new Map<string, Recording[]>();
  const byDate = new Map<string, Recording[]>();
  const byWord = new Map<string, Recording[]>();
  const wordsOf = new Map<string, Set<string>>();

  const push = (m: Map<string, Recording[]>, k: string, r: Recording) => {
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  };

  for (const rec of getCatalog(key)) {
    if (rec.scripture) push(byVerse, rec.scripture, rec);
    if (rec.date) push(byDate, rec.date, rec);
    const words = contentWords(rec.title);
    wordsOf.set(rec.id, new Set(words));
    for (const w of words) push(byWord, w, rec);
  }

  const built: Index = { byVerse, byDate, byWord, wordsOf };
  indexes[key] = built;
  return built;
}

/**
 * Ranked archive candidates for a video title, best first.
 *
 * `confident` marks a verse or exact-date hit. Word-overlap-only results are
 * returned too so the UI can offer a short "is it one of these?" list, but the
 * caller should present them as suggestions rather than as the answer.
 */
export function findArchiveCandidates(
  videoTitle: string,
  maharaj: MaharajKey,
  limit = 5,
): ArchiveMatch[] {
  const idx = getIndex(maharaj);
  const wantVerse = extractScripture(videoTitle);
  const wantDate = extractDate(videoTitle);
  const wantWords = contentWords(videoTitle);
  if (!wantVerse && !wantDate && wantWords.length === 0) return [];

  // Gather a small candidate pool from the indexes instead of scanning all.
  const pool = new Map<string, Recording>();
  const add = (recs?: Recording[]) => {
    if (recs) for (const r of recs) pool.set(r.id, r);
  };
  if (wantVerse) add(idx.byVerse.get(wantVerse));
  if (wantDate) add(idx.byDate.get(wantDate));
  for (const w of wantWords) {
    const recs = idx.byWord.get(w);
    if (recs && recs.length <= TOO_COMMON) add(recs);
  }
  if (pool.size === 0) return [];

  const wantSet = new Set(wantWords);
  const out: ArchiveMatch[] = [];

  for (const rec of pool.values()) {
    let score = 0;
    let confident = false;
    const reasons: string[] = [];

    if (wantVerse && rec.scripture === wantVerse) {
      score += 50;
      confident = true;
      reasons.push(wantVerse);
    }

    if (wantDate && rec.date === wantDate) {
      score += 50;
      confident = true;
      reasons.push('same date');
    } else if (wantDate && rec.year === +wantDate.slice(0, 4)) {
      score += 8;
    }

    let shared = 0;
    const have = idx.wordsOf.get(rec.id);
    if (have && wantSet.size) {
      for (const w of wantSet) if (have.has(w)) shared++;
      if (shared) {
        // Proportion of the video's distinctive words present in the archive
        // title, so a long archive title cannot win on length alone.
        const ratio = shared / wantSet.size;
        score += Math.round(ratio * 34);
        if (shared >= 2) reasons.push(`${shared} words in common`);

        // Near-identical titles are the same lecture. Both sources routinely
        // name a class the same way while only one of them carries the verse
        // or the date, so demanding one of those left most real matches
        // sitting in the "unsure" pile and playback never handed over.
        // Requires several distinctive words, not just a high ratio off one
        // or two, so a short generic title cannot qualify.
        if (!confident && shared >= 3 && ratio >= 0.75) {
          confident = true;
          score += 20;
          reasons.push('title matches');
        }
      }
    }

    // When the title DID carry a verse or date and neither matched, a
    // word-overlap result is almost certainly a different lecture — a title
    // that specific would have matched. Keep it out of the list entirely.
    if (!confident && (wantVerse || wantDate)) continue;

    if (score >= 17) {
      out.push({ recording: rec, score, reason: reasons.join(' · '), confident });
    }
  }

  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

/** The single archive recording we're willing to present as "this lecture". */
export function findArchiveMatch(
  videoTitle: string,
  maharaj: MaharajKey,
): ArchiveMatch | null {
  const [best] = findArchiveCandidates(videoTitle, maharaj, 1);
  if (!best) return null;
  if (best.confident) return best;
  // No hard signal anywhere: only a strong overlap earns the top billing.
  return best.score >= 20 ? best : null;
}

/**
 * Whether this video will actually hand over to archive audio when you leave
 * the app — i.e. whether it plays in the background.
 *
 * Deliberately CONFIDENT-only. Badging every row that had any candidate
 * promised background playback on 83% of results while only 38% truly handed
 * over, because uncertain matches are offered as suggestions and never play
 * by themselves. The badge now means exactly what it says.
 */
export function hasArchiveAudio(videoTitle: string, maharaj: MaharajKey): boolean {
  const [best] = findArchiveCandidates(videoTitle, maharaj, 1);
  return !!best?.confident;
}
