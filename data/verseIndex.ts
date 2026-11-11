/**
 * Read access to the verse table, the verse → lectures index and the verse
 * translations.
 *
 * Everything is required lazily. The index is sharded — BG, each SB canto,
 * CC, NOI, NOD, BS, ISO (data/verse-index/*.json, ≤2 MB each) — and a shard is parsed the first
 * time a chapter in it is opened, so reading the Gita never pays for the
 * ~10 MB Bhagavatam index. Per-chapter lookups are built once and cached.
 *
 * This module deliberately imports nothing from hooks/useLectures — that one
 * imports `getGuestRecordingById` from here, and a cycle would leave one side
 * undefined at load time.
 */
import type { MaharajKey, Recording, SpeakerKey } from './types';
import { chapterKey, entryEnd, entryStart, formatRef, type BookKey, type VerseRef } from '../utils/verseRef';
import { archiveId, archiveTitle } from '../utils/archiveId';
import { honoured } from './maharajas';
// Type-only imports flow the other way (songIndex → verseIndex), so no cycle at load time.
import { SONG_SHARD, getSongGuestById, songGuestRecording } from './songIndex';

// ------------------------------------------------------------------ table

export interface ChapterInfo {
  n: number;
  title: string;
  /**
   * Vedabase verse entries in order: "1", "2", …, "16-18". "0" is the
   * Isopanisad Invocation. Empty for a prose chapter (The Nectar of Devotion),
   * whose lectures are on the chapter as a whole.
   */
  verses: string[];
}
export interface PartInfo {
  /** '' for BG and the smaller books, canto number for SB, lila key for CC. */
  key: string;
  name: string;
  chapters: ChapterInfo[];
}
export interface BookInfo {
  key: BookKey;
  name: string;
  parts: PartInfo[];
}

let table: { books: BookInfo[] } | null = null;

export function getBooks(): BookInfo[] {
  if (!table) table = require('./verse-table.json');
  return table!.books;
}

export function getBook(key: BookKey): BookInfo | undefined {
  return getBooks().find((b) => b.key === key);
}

export function getPart(book: BookKey, part: string): PartInfo | undefined {
  return getBook(book)?.parts.find((p) => p.key === part);
}

export function getChapter(book: BookKey, part: string, n: number): ChapterInfo | undefined {
  return getPart(book, part)?.chapters.find((c) => c.n === n);
}

/** Chapter before/after this one, crossing canto and lila boundaries. */
export function adjacentChapter(
  book: BookKey,
  part: string,
  n: number,
  dir: 1 | -1,
): { part: string; n: number } | null {
  const b = getBook(book);
  if (!b) return null;
  const flat = b.parts.flatMap((p) => p.chapters.map((c) => ({ part: p.key, n: c.n })));
  const i = flat.findIndex((c) => c.part === part && c.n === n);
  return i < 0 ? null : flat[i + dir] ?? null;
}

/** Verse entry before/after this one, crossing chapter (and canto) boundaries. */
export function adjacentVerse(
  book: BookKey,
  part: string,
  n: number,
  entry: string,
  dir: 1 | -1,
): { part: string; n: number; entry: string } | null {
  const ch = getChapter(book, part, n);
  if (!ch) return null;
  const i = ch.verses.indexOf(entry);
  const j = i + dir;
  if (i >= 0 && j >= 0 && j < ch.verses.length) return { part, n, entry: ch.verses[j] };
  const next = adjacentChapter(book, part, n, dir);
  if (!next) return null;
  const nc = getChapter(book, next.part, next.n);
  if (!nc?.verses.length) return null;
  return { ...next, entry: dir === 1 ? nc.verses[0] : nc.verses[nc.verses.length - 1] };
}

/** "SB 10.4" / "BG 2" / "CC Madhya 8" / "NOD 16" — a chapter's short label. */
export function chapterLabel(book: BookKey, part: string, n: number): string {
  return formatRef({ book, part, chapter: n, from: null, to: null });
}

/** "SB 10.4.16-18" — a verse entry's label. */
export function verseLabel(book: BookKey, part: string, n: number, entry: string): string {
  return formatRef({ book, part, chapter: n, from: entryStart(entry), to: entryEnd(entry) });
}

/** A book with one chapter (NOI, ISO, BS) — its chapter level is skipped in the UI. */
export function isSingleChapter(book: BookKey): boolean {
  const b = getBook(book);
  return !!b && b.parts.length === 1 && b.parts[0].chapters.length === 1;
}

/** A prose book followed chapter by chapter (The Nectar of Devotion). */
export function isProse(book: BookKey): boolean {
  return book === 'NOD';
}

/** The verse's page on vedabase.io, for reading the translation and purport. */
export function vedabaseUrl(book: BookKey, part: string, n: number, entry?: string): string {
  const root = `https://vedabase.io/en/library/${book.toLowerCase()}/`;
  // NOI and ISO have no chapter level on Vedabase; NOD's chapter 0 is its Introduction.
  if (book === 'NOI' || book === 'ISO') {
    if (entry == null) return root;
    return `${root}${entry === '0' ? 'invocation' : entry}/`;
  }
  if (book === 'NOD') return `${root}${n === 0 ? 'introduction' : n}/`;
  const base = `${root}${part ? `${part}/` : ''}${n}/`;
  return entry ? `${base}${entry}/` : base;
}

// ------------------------------------------------------------ translations

const TEXT_LOADERS: Record<BookKey, () => Record<string, string>> = {
  BG: () => require('./shastra/text-BG.json'),
  SB: () => require('./shastra/text-SB.json'),
  CC: () => require('./shastra/text-CC.json'),
  NOI: () => require('./shastra/text-NOI.json'),
  BS: () => require('./shastra/text-BS.json'),
  ISO: () => require('./shastra/text-ISO.json'),
  // Prose, chapter by chapter: no verse translations.
  NOD: () => ({}),
};
const texts: Partial<Record<BookKey, Record<string, string>>> = {};

/** Srila Prabhupada's English translation of a verse entry, '' if unknown. */
export function verseTranslation(book: BookKey, part: string, n: number, entry: string): string {
  if (!texts[book]) {
    try {
      texts[book] = TEXT_LOADERS[book]();
    } catch {
      texts[book] = {};
    }
  }
  const key = part ? `${part}.${n}.${entry}` : `${n}.${entry}`;
  return texts[book]![key] ?? '';
}

// ------------------------------------------------------------------ index

/** [speaker, id, title, date, refs, dir?, file?, sizeKB?] */
type AudioRow = [number, string | null, string | null, string, string, number?, string?, number?];
/** [speaker, videoId, title, durationSec, channel, refs] */
type VideoRow = [number, string, string, number, string, string];

interface RawIndex {
  host: string;
  catalogued: MaharajKey[];
  speakers: string[];
  /** Per speaker: 0 catalogued, 1 other Maharaja, 2 Srila Prabhupada, 3 Prabhuji/Mataji. */
  tiers: number[];
  dirs: string[];
  audio: AudioRow[];
  video: VideoRow[];
}

/** Who gave the class, relative to the user's chosen speakers. */
export type SpeakerTier = 0 | 1 | 2 | 3;
export const TIER_LABEL: Record<SpeakerTier, string> = {
  0: 'Your Maharajas & Prabhujis',
  1: 'Other Maharajas',
  2: 'Srila Prabhupada',
  3: 'Other Prabhujis & Matajis',
};

interface Base {
  speakerKey: SpeakerKey;
  /** Display name — the Maharaja's short name, or the guest's. */
  speakerName: string;
  tier: SpeakerTier;
  title: string;
  /** null for a whole-chapter talk. */
  from: number | null;
  to: number | null;
}
export interface VerseAudio extends Base {
  kind: 'audio';
  id: string;
  /** ISO date or bare year, '' when unknown. */
  date: string;
  shard: Shard;
  /** Index into the shard's raw audio rows, to build a guest Recording on demand. */
  row: number;
}
export interface VerseVideo extends Base {
  kind: 'video';
  videoId: string;
  durationSec: number | null;
  channel: string;
}
export type VerseLecture = VerseAudio | VerseVideo;

export interface ChapterLectures {
  audio: VerseAudio[];
  video: VerseVideo[];
}

/** "bg", "sb1" … "sb12", "cc", "noi", "nod", "bs", "iso" — one per data/verse-index/*.json file. */
export type Shard = string;

// Metro needs every require() path spelled out literally.
const SHARD_LOADERS: Record<Shard, () => RawIndex> = {
  bg: () => require('./verse-index/BG.json'),
  sb1: () => require('./verse-index/SB-1.json'),
  sb2: () => require('./verse-index/SB-2.json'),
  sb3: () => require('./verse-index/SB-3.json'),
  sb4: () => require('./verse-index/SB-4.json'),
  sb5: () => require('./verse-index/SB-5.json'),
  sb6: () => require('./verse-index/SB-6.json'),
  sb7: () => require('./verse-index/SB-7.json'),
  sb8: () => require('./verse-index/SB-8.json'),
  sb9: () => require('./verse-index/SB-9.json'),
  sb10: () => require('./verse-index/SB-10.json'),
  sb11: () => require('./verse-index/SB-11.json'),
  sb12: () => require('./verse-index/SB-12.json'),
  cc: () => require('./verse-index/CC.json'),
  noi: () => require('./verse-index/NOI.json'),
  nod: () => require('./verse-index/NOD.json'),
  bs: () => require('./verse-index/BS.json'),
  iso: () => require('./verse-index/ISO.json'),
};

export function shardOf(book: BookKey, part: string): Shard {
  return book === 'SB' ? `sb${part}` : book.toLowerCase();
}

const shards = new Map<Shard, RawIndex>();
function index(shard: Shard): RawIndex {
  let r = shards.get(shard);
  if (!r) {
    r = SHARD_LOADERS[shard]();
    shards.set(shard, r);
  }
  return r;
}

type Filed = { kind: 'a' | 'v'; row: number; from: number | null; to: number | null };
const chapterMaps = new Map<Shard, Map<string, Filed[]>>();
const chapterCache = new Map<string, ChapterLectures>();

/** One pass over a shard's rows, filing each reference under its chapter. */
function chapterMap(shard: Shard): Map<string, Filed[]> {
  const hit = chapterMaps.get(shard);
  if (hit) return hit;
  const r = index(shard);
  const map = new Map<string, Filed[]>();
  const file = (kind: 'a' | 'v', row: number, refs: string) => {
    for (const enc of refs.split('|')) {
      const colon = enc.lastIndexOf(':');
      const key = enc.slice(0, colon);
      const range = enc.slice(colon + 1);
      let from: number | null = null;
      let to: number | null = null;
      if (range) {
        const [a, b] = range.split('-').map(Number);
        from = a;
        to = b || a;
      }
      let list = map.get(key);
      if (!list) map.set(key, (list = []));
      list.push({ kind, row, from, to });
    }
  };
  r.audio.forEach((a, i) => file('a', i, a[4]));
  r.video.forEach((v, i) => file('v', i, v[5]));
  chapterMaps.set(shard, map);
  return map;
}

/** Display names for the catalogued keys, as the index was built with. */
const CATALOGUED_NAMES: Record<MaharajKey, string> = {
  radhanath: 'Radhanath Swami',
  lokanath: 'Lokanath Swami',
  bhaktiashraya: 'Bhakti Ashraya Vaishnava Swami',
  gourgovinda: 'Gour Govinda Swami',
  amarendra: 'Amarendra Prabhu',
  radheshyam: 'Radheshyam Prabhu',
  vidvangauranga: 'Vidvan Gauranga Prabhu',
  vamsivadan: 'Vamsi Vadan Prabhu',
  kartikeya: 'Kartikeya Prabhu',
};

function speakerOf(r: RawIndex, i: number): { key: SpeakerKey; name: string; tier: SpeakerTier } {
  if (i < r.catalogued.length) {
    const key = r.catalogued[i];
    return { key, name: honoured(CATALOGUED_NAMES[key] ?? r.speakers[i]), tier: 0 };
  }
  return { key: 'guest', name: honoured(r.speakers[i]), tier: ((r.tiers?.[i] ?? 1) as SpeakerTier) };
}

const guestTitle = (row: AudioRow) => row[2] ?? archiveTitle(row[6] ?? '');
const guestPath = (r: RawIndex, row: AudioRow) => `${r.dirs[row[5]!]}/${row[6]}`;

/** Every lecture filed under a chapter, audio and video. */
export function chapterLectures(book: BookKey, part: string, n: number): ChapterLectures {
  const key = chapterKey(book, part, n);
  const hit = chapterCache.get(key);
  if (hit) return hit;

  const shard = shardOf(book, part);
  const r = index(shard);
  const out: ChapterLectures = { audio: [], video: [] };
  // The archive often files one recording in two folders (a year folder and a
  // topic folder). Same speaker + same title + same verses is the same class.
  const seen = new Set<string>();
  const dupe = (k: string) => {
    if (seen.has(k)) return true;
    seen.add(k);
    return false;
  };
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '');
  for (const ref of chapterMap(shard).get(key) ?? []) {
    if (ref.kind === 'a') {
      const row = r.audio[ref.row];
      const sp = speakerOf(r, row[0]);
      const guest = sp.key === 'guest';
      const title = guest ? guestTitle(row) : row[2] ?? '';
      if (dupe(`a|${sp.name}|${norm(title)}|${ref.from}-${ref.to}`)) continue;
      out.audio.push({
        kind: 'audio',
        id: row[1] ?? archiveId(guestPath(r, row), shard),
        speakerKey: sp.key,
        speakerName: sp.name,
        tier: sp.tier,
        title,
        date: row[3],
        from: ref.from,
        to: ref.to,
        shard,
        row: ref.row,
      });
    } else {
      const row = r.video[ref.row];
      if (dupe(`v|${row[1]}|${ref.from}`)) continue;
      const sp = speakerOf(r, row[0]);
      out.video.push({
        kind: 'video',
        videoId: row[1],
        speakerKey: sp.key,
        speakerName: sp.name,
        tier: sp.tier,
        title: row[2],
        durationSec: row[3] || null,
        channel: row[4],
        from: ref.from,
        to: ref.to,
      });
    }
  }
  chapterCache.set(key, out);
  return out;
}

/** Does a lecture's verse range touch this verse entry ("16-18")? */
export function coversEntry(l: { from: number | null; to: number | null }, entry: string): boolean {
  if (l.from == null) return false;
  return l.from <= entryEnd(entry) && (l.to ?? l.from) >= entryStart(entry);
}

/** Does a lecture START on this verse entry (rather than a range running through it)? */
export function startsAtEntry(l: { from: number | null }, entry: string): boolean {
  return l.from != null && l.from >= entryStart(entry) && l.from <= entryEnd(entry);
}

// ------------------------------------------------------------------ guests

const guestCache = new Map<string, Recording>();

const tidy = (s: string) => s.replace(/_/g, ' ').replace(/^\d+\s*-\s*/, '').trim();

const BOOK_CATEGORY: Record<BookKey, string> = {
  BG: 'Bhagavad-gita',
  SB: 'Srimad-Bhagavatam',
  CC: 'CC',
  NOI: 'NOI',
  NOD: 'NOD',
  BS: 'BS',
  ISO: 'ISO',
};

/** A playable Recording for an other-speaker row of a shard. */
export function guestRecording(shard: Shard, rowIdx: number): Recording {
  // Prayers & Songs lectures share the row shape but live in their own index.
  if (shard === SONG_SHARD) return songGuestRecording(rowIdx);
  const r = index(shard);
  const row = r.audio[rowIdx];
  const dir = r.dirs[row[5]!];
  const file = row[6]!;
  const p = `${dir}/${file}`;
  const id = archiveId(p, shard);
  const cached = guestCache.get(id);
  if (cached) return cached;

  const breadcrumb = dir.split('/').filter(Boolean).map(tidy).filter(Boolean);
  const firstRef = row[4].split('|')[0];
  const [ck, range] = firstRef.split(':');
  const [bk, part, ch] = ck.split('/');
  const [from, to] = range ? range.split('-').map(Number) : [null, null];
  const ref: VerseRef = { book: bk as BookKey, part, chapter: Number(ch), from, to: to ?? from };
  const date = /^\d{4}-\d{2}-\d{2}$/.test(row[3]) ? row[3] : null;
  const title = guestTitle(row);

  const rec: Recording = {
    id,
    maharaj: 'guest',
    speaker: honoured(r.speakers[row[0]]),
    title,
    fullTitle: [...breadcrumb, title].join(' / '),
    url: `${r.host}${p.split('/').map(encodeURIComponent).join('/')}`,
    path: p,
    folder: breadcrumb[breadcrumb.length - 1] ?? '',
    breadcrumb,
    category: BOOK_CATEGORY[ref.book],
    date,
    year: row[3] ? Number(row[3].slice(0, 4)) : null,
    location: null,
    scripture: formatRef(ref),
    // From the folder page when the crawl had it; 0 otherwise — the player
    // and the downloader both read the real length from the response.
    sizeBytes: (row[7] ?? 0) * 1024,
    format: (file.split('.').pop() ?? 'mp3').toUpperCase(),
    sourceUrl: `${r.host}/index.php?q=f&f=${encodeURIComponent(dir)}`,
  };
  guestCache.set(id, rec);
  return rec;
}

const guestIdMaps = new Map<Shard, Map<string, number>>();

/**
 * Resolve a saved guest id (history, favourites, downloads, the notification)
 * back to its recording. The id names its shard ("gst-sb10-…"), so only that
 * shard is loaded.
 */
export function getGuestRecordingById(id: string): Recording | undefined {
  const cached = guestCache.get(id);
  if (cached) return cached;
  if (id.startsWith(`gst-${SONG_SHARD}-`)) return getSongGuestById(id);
  const shard = id.match(/^gst-(bg|cc|noi|nod|bs|iso|sb\d{1,2})-/)?.[1];
  if (!shard || !SHARD_LOADERS[shard]) return undefined;
  let ids = guestIdMaps.get(shard);
  if (!ids) {
    const r = index(shard);
    ids = new Map();
    r.audio.forEach((row, i) => {
      if (row[5] != null && row[6]) ids!.set(archiveId(guestPath(r, row), shard), i);
    });
    guestIdMaps.set(shard, ids);
  }
  const i = ids.get(id);
  return i == null ? undefined : guestRecording(shard, i);
}
