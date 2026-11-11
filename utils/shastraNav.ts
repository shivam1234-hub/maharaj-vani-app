import type { BookKey } from './verseRef';

/** Look of each book across the Verses screens. */
export const BOOK_META: Record<BookKey, { color: string; icon: string; short: string; blurb: string }> = {
  BG: { color: '#FF7722', icon: 'flame', short: 'Bhagavad-gita', blurb: 'The song of God, spoken by Lord Krishna' },
  SB: { color: '#9B59B6', icon: 'book', short: 'Srimad-Bhagavatam', blurb: 'The spotless Purana, canto by canto' },
  CC: { color: '#1ABC9C', icon: 'book-outline', short: 'Caitanya-caritamrta', blurb: 'The pastimes and teachings of Sri Caitanya' },
};

export function chapterHref(book: BookKey, part: string, n: number) {
  return `/shastra/chapter?book=${book}&part=${encodeURIComponent(part)}&n=${n}`;
}

export function verseHref(book: BookKey, part: string, n: number, entry: string) {
  return `/shastra/verse?book=${book}&part=${encodeURIComponent(part)}&n=${n}&entry=${encodeURIComponent(entry)}`;
}
