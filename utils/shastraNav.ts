import type { BookKey } from './verseRef';

/** Look of each book across the Verses screens. */
export const BOOK_META: Record<BookKey, { color: string; icon: string; short: string; blurb: string }> = {
  BG: { color: '#FF7722', icon: 'flame', short: 'Bhagavad-gita', blurb: 'The song of God, spoken by Lord Krishna' },
  SB: { color: '#9B59B6', icon: 'book', short: 'Srimad-Bhagavatam', blurb: 'The spotless Purana, canto by canto' },
  CC: { color: '#1ABC9C', icon: 'book-outline', short: 'Caitanya-caritamrta', blurb: 'The pastimes and teachings of Sri Caitanya' },
  NOI: { color: '#E0A800', icon: 'water-outline', short: 'Nectar of Instruction', blurb: 'Srila Rupa Gosvami’s eleven essential instructions' },
  NOD: { color: '#E2557B', icon: 'heart-outline', short: 'Nectar of Devotion', blurb: 'The science of bhakti, chapter by chapter' },
  BS: { color: '#3D7BE0', icon: 'sunny-outline', short: 'Brahma-samhita', blurb: 'Lord Brahma’s prayers to Govinda, the original person' },
  ISO: { color: '#5E9C3A', icon: 'leaf-outline', short: 'Sri Isopanisad', blurb: 'The Invocation and eighteen mantras of the Upanisad' },
};

/** Accent of the Prayers & Songs screens. */
export const SONGS_COLOR = '#C2185B';

export function songHref(id: string) {
  return `/songs/${encodeURIComponent(id)}`;
}

export function chapterHref(book: BookKey, part: string, n: number) {
  return `/shastra/chapter?book=${book}&part=${encodeURIComponent(part)}&n=${n}`;
}

export function verseHref(book: BookKey, part: string, n: number, entry: string) {
  return `/shastra/verse?book=${book}&part=${encodeURIComponent(part)}&n=${n}&entry=${encodeURIComponent(entry)}`;
}
