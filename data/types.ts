export type MaharajKey =
  | 'radhanath'
  | 'lokanath'
  | 'bhaktiashraya'
  | 'gourgovinda'
  | 'amarendra'
  | 'radheshyam'
  | 'vidvangauranga'
  | 'vamsivadan'
  | 'kartikeya';

/**
 * Who a recording belongs to. 'guest' marks a lecture by a speaker the app
 * has no catalogue for — the other-Maharaja fallback in the Verses tab — whose
 * name is then carried in `speaker`.
 */
export type SpeakerKey = MaharajKey | 'guest';

/** One audio recording scraped from audio.iskcondesiretree.com. */
export interface Recording {
  id: string;
  maharaj: SpeakerKey;
  /** Display name, set only for guest recordings. */
  speaker?: string;
  title: string;
  /** Breadcrumb + title, used for search and for the detail header. */
  fullTitle: string;
  /** Direct, range-requestable mp3 URL — plays and downloads straight from this. */
  url: string;
  path: string;
  folder: string;
  breadcrumb: string[];
  category: string;
  date: string | null;
  year: number | null;
  location: string | null;
  /** Normalised verse reference, e.g. "SB 1.5.35". */
  scripture: string | null;
  sizeBytes: number;
  format: string;
  /** The site folder this file was listed in, for "view on website". */
  sourceUrl: string;
}

/** A YouTube result, from live search. */
export interface VideoResult {
  videoId: string;
  title: string;
  channel: string;
  channelId?: string;
  durationSec: number | null;
  publishedText?: string;
  viewsText?: string;
  thumbnail?: string;
}

export const CATEGORY_META: Record<
  string,
  { label: string; color: string; badge: string; icon: string }
> = {
  'Bhagavad-gita':     { label: 'Bhagavad-gita',      color: '#FF7722', badge: 'BG',    icon: 'flame' },
  'Srimad-Bhagavatam': { label: 'Srimad-Bhagavatam',  color: '#9B59B6', badge: 'SB',    icon: 'book' },
  'CC':                { label: 'Caitanya-caritamrta', color: '#1ABC9C', badge: 'CC',    icon: 'book-outline' },
  'Ramayana':          { label: 'Ramayana',            color: '#E74C3C', badge: 'RAM',   icon: 'bonfire-outline' },
  'Theme':             { label: 'Theme-wise',          color: '#4A90D9', badge: 'THEME', icon: 'albums-outline' },
  'General':           { label: 'Lectures',            color: '#E67E22', badge: 'LEC',   icon: 'mic' },
  'Yatra':             { label: 'Yatra',               color: '#27AE60', badge: 'YATRA', icon: 'walk-outline' },
  'Festival':          { label: 'Festivals',           color: '#F1C40F', badge: 'FEST',  icon: 'star' },
  'Kirtan':            { label: 'Kirtan & Bhajan',     color: '#F39C12', badge: 'KIRT',  icon: 'musical-notes' },
  'ShortClip':         { label: 'Short Clips',         color: '#16A085', badge: 'CLIP',  icon: 'flash-outline' },
  'Droplets':          { label: 'Amrit Droplets',      color: '#3498DB', badge: 'DROP',  icon: 'water-outline' },
  'AudioBook':         { label: 'Audio Book',          color: '#8E44AD', badge: 'BOOK',  icon: 'library-outline' },
  'Brihad':            { label: 'Brihad Bhagavatamrta', color: '#D35400', badge: 'BRHD', icon: 'bookmarks-outline' },
  'GauraLila':         { label: 'Gaura Lila',          color: '#2ECC71', badge: 'GAUR',  icon: 'leaf' },
  'Seminar':           { label: 'Seminars',           color: '#00A8B5', badge: 'SEM',   icon: 'school-outline' },
  'Disciples':         { label: 'Disciples Meeting',   color: '#95A5A6', badge: 'DISC',  icon: 'people-outline' },
  'Bengali':           { label: 'Bengali',             color: '#C0392B', badge: 'BEN',   icon: 'language-outline' },
  'Hindi':             { label: 'Hindi',               color: '#E84393', badge: 'HIN',   icon: 'language-outline' },
  'Translated':        { label: 'With Translation',    color: '#7F8C8D', badge: 'TRAN',  icon: 'globe-outline' },
};

export function getCategoryMeta(category: string) {
  return (
    CATEGORY_META[category] ?? {
      label: category,
      color: '#666',
      badge: category.slice(0, 4).toUpperCase(),
      icon: 'volume-medium-outline',
    }
  );
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function formatDuration(sec: number | null): string {
  if (sec == null) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

export function formatRecordingDate(date: string | null): string {
  if (!date) return '';
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
