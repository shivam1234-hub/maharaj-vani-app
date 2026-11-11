/**
 * Read access to the Prayers & Songs catalogue (utils/songs.js) and the
 * lectures filed under each entry (data/song-index.json, built by
 * scripts/build-song-index.js).
 *
 * The index rows have the verse-index shape, and lectures come back as
 * VerseAudio with shard "song", so the verse screens' row component, ranking
 * and queueing work unchanged. Guest recordings are built here; verseIndex.ts
 * forwards "gst-song-…" ids to getSongGuestById.
 */
import type { MaharajKey, Recording } from './types';
import type { SpeakerTier, VerseAudio } from './verseIndex';
import { GROUPS, SONGS, type Song, type SongGroup } from '../utils/songs';
import { archiveId, archiveTitle } from '../utils/archiveId';
import { honoured } from './maharajas';

export type { Song, SongGroup };
export const SONG_SHARD = 'song';

/** [speaker, id, title, date, songIds, dir?, file?, sizeKB?] */
type Row = [number, string | null, string | null, string, string, number?, string?, number?];
interface RawSongIndex {
  host: string;
  catalogued: MaharajKey[];
  speakers: string[];
  tiers: number[];
  dirs: string[];
  audio: Row[];
}

let raw: RawSongIndex | null = null;
function index(): RawSongIndex {
  if (!raw) raw = require('./song-index.json');
  return raw!;
}

const byId = new Map(SONGS.map((s) => [s.id, s]));

export function getSongGroups(): SongGroup[] {
  return GROUPS;
}
export function songsInGroup(group: string): Song[] {
  return SONGS.filter((s) => s.group === group);
}
export function getSong(id: string): Song | undefined {
  return byId.get(id);
}

/** Same display names as the verse index's catalogued speakers. */
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

const rowTitle = (row: Row) => row[2] ?? archiveTitle(row[6] ?? '');
const rowPath = (r: RawSongIndex, row: Row) => `${r.dirs[row[5]!]}/${row[6]}`;

let bySong: Map<string, VerseAudio[]> | null = null;

/** Every audio lecture filed under a song (unsorted; see sortLectures). */
export function songLectures(id: string): VerseAudio[] {
  if (!bySong) {
    const r = index();
    bySong = new Map();
    const seen = new Set<string>();
    const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '');
    r.audio.forEach((row, i) => {
      const cat = row[0] < r.catalogued.length;
      const key = cat ? r.catalogued[row[0]] : 'guest';
      const name = honoured(cat ? CATALOGUED_NAMES[r.catalogued[row[0]]] ?? r.speakers[row[0]] : r.speakers[row[0]]);
      const title = cat ? row[2] ?? '' : rowTitle(row);
      for (const song of row[4].split('|')) {
        // One recording filed in two folders is the same class.
        const k = `${song}|${name}|${norm(title)}`;
        if (seen.has(k)) continue;
        seen.add(k);
        let list = bySong!.get(song);
        if (!list) bySong!.set(song, (list = []));
        list.push({
          kind: 'audio',
          id: row[1] ?? archiveId(rowPath(r, row), SONG_SHARD),
          speakerKey: key,
          speakerName: name,
          tier: (cat ? 0 : r.tiers[row[0]] ?? 1) as SpeakerTier,
          title,
          date: row[3],
          from: null,
          to: null,
          shard: SONG_SHARD,
          row: i,
        });
      }
    });
  }
  return bySong.get(id) ?? [];
}

/** Lecture counts for a song list row: all, and by the catalogued speakers. */
export function songCounts(id: string): { all: number; mine: number } {
  const list = songLectures(id);
  return { all: list.length, mine: list.filter((l) => l.tier === 0).length };
}

const guestCache = new Map<string, Recording>();
const tidy = (s: string) => s.replace(/_/g, ' ').replace(/^\d+\s*-\s*/, '').trim();

/** A playable Recording for an other-speaker row of the song index. */
export function songGuestRecording(rowIdx: number): Recording {
  const r = index();
  const row = r.audio[rowIdx];
  const dir = r.dirs[row[5]!];
  const file = row[6]!;
  const p = `${dir}/${file}`;
  const id = archiveId(p, SONG_SHARD);
  const hit = guestCache.get(id);
  if (hit) return hit;
  const breadcrumb = dir.split('/').filter(Boolean).map(tidy).filter(Boolean);
  const title = rowTitle(row);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(row[3]) ? row[3] : null;
  const song = getSong(row[4].split('|')[0]);
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
    category: 'Songs',
    date,
    year: row[3] ? Number(row[3].slice(0, 4)) : null,
    location: null,
    scripture: song?.name ?? null,
    sizeBytes: (row[7] ?? 0) * 1024,
    format: (file.split('.').pop() ?? 'mp3').toUpperCase(),
    sourceUrl: `${r.host}/index.php?q=f&f=${encodeURIComponent(dir)}`,
  };
  guestCache.set(id, rec);
  return rec;
}

let idMap: Map<string, number> | null = null;

/** Resolve a saved "gst-song-…" id (history, downloads, favourites). */
export function getSongGuestById(id: string): Recording | undefined {
  const hit = guestCache.get(id);
  if (hit) return hit;
  if (!idMap) {
    const r = index();
    idMap = new Map();
    r.audio.forEach((row, i) => {
      if (row[5] != null && row[6]) idMap!.set(archiveId(rowPath(r, row), SONG_SHARD), i);
    });
  }
  const i = idMap.get(id);
  return i == null ? undefined : songGuestRecording(i);
}
