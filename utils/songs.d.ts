export interface SongGroup {
  key: string;
  name: string;
  blurb: string;
}

export interface Song {
  /** Stable key: URLs and saved places. */
  id: string;
  /** SongGroup key. */
  group: string;
  name: string;
  author: string;
  /** Opening words, as sung (with diacritics). */
  line: string;
  re: RegExp;
}

export const GROUPS: SongGroup[];
export const SONGS: Song[];
/** Every catalogue entry a file name or video title names. */
export function matchSongs(text: string | null | undefined): string[];
/** A recording of the song being sung, rather than a lecture on it. */
export function isPerformance(text: string | null | undefined): boolean;
export function normalize(text: string | null | undefined): string;
