export type BookKey = 'BG' | 'SB' | 'CC';

export interface VerseRef {
  book: BookKey;
  /** '' for BG, canto number for SB ("10"), lila for CC ("madhya"). */
  part: string;
  chapter: number;
  /** null for a chapter-level talk ("SB 9.20"). */
  from: number | null;
  to: number | null;
}

export function parseVerseRefs(text: string | null | undefined): VerseRef[];
export function chapterKey(book: BookKey, part: string, chapter: number): string;
export function formatRef(ref: VerseRef): string;
export function entryStart(entry: string): number;
export function entryEnd(entry: string): number;
