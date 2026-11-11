import { useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { MaharajKey, Recording } from '../data/types';
import { getGuestRecordingById } from '../data/verseIndex';

/**
 * Catalogues are required lazily and memoised: only the Maharaja actually
 * being browsed gets parsed, which keeps the other ~8 MB of JSON off the
 * startup path. Switching tabs parses the second one once, then it's cached.
 */
const LOADERS: Record<MaharajKey, () => Recording[]> = {
  radhanath: () => require('../data/catalog-radhanath.json') as Recording[],
  lokanath: () => require('../data/catalog-lokanath.json') as Recording[],
  bhaktiashraya: () => require('../data/catalog-bhaktiashraya.json') as Recording[],
  gourgovinda: () => require('../data/catalog-gourgovinda.json') as Recording[],
  amarendra: () => require('../data/catalog-amarendra.json') as Recording[],
  radheshyam: () => require('../data/catalog-radheshyam.json') as Recording[],
  vidvangauranga: () => require('../data/catalog-vidvangauranga.json') as Recording[],
  vamsivadan: () => require('../data/catalog-vamsivadan.json') as Recording[],
  kartikeya: () => require('../data/catalog-kartikeya.json') as Recording[],
};

const cache: Partial<Record<MaharajKey, Recording[]>> = {};

export function getCatalog(key: MaharajKey): Recording[] {
  if (!cache[key]) cache[key] = LOADERS[key]();
  return cache[key]!;
}

/**
 * Id prefix -> owning catalogue. Driven by a table rather than a ternary: the
 * old two-way check treated anything that was not `rns-` as the other Maharaja, so a
 * third catalogue's ids resolved to the wrong list and then to nothing.
 */
const PREFIX_OWNER: Array<[string, MaharajKey]> = [
  ['rns-', 'radhanath'],
  ['lns-', 'lokanath'],
  ['bavs-', 'bhaktiashraya'],
  ['ggs-', 'gourgovinda'],
  ['amp-', 'amarendra'],
  ['rsp-', 'radheshyam'],
  ['vgp-', 'vidvangauranga'],
  ['vvp-', 'vamsivadan'],
  ['kdp-', 'kartikeya'],
];

export function getRecordingById(id: string): Recording | undefined {
  // Other-speaker lectures from the Verses tab have no catalogue; they are
  // rebuilt from the verse index.
  if (id.startsWith('gst-')) return getGuestRecordingById(id);
  const owner = PREFIX_OWNER.find(([prefix]) => id.startsWith(prefix))?.[1];
  if (owner) {
    const hit = getCatalog(owner).find((r) => r.id === id);
    if (hit) return hit;
  }
  // Unknown or stale prefix: fall back to a full sweep so saved history and
  // favourites keep resolving.
  for (const [, key] of PREFIX_OWNER) {
    if (key === owner) continue;
    const hit = getCatalog(key).find((r) => r.id === id);
    if (hit) return hit;
  }
  return undefined;
}

/** Every catalogue, concatenated — used by the cross-Maharaja search. */
export function getAllCatalogs(): Recording[] {
  return PREFIX_OWNER.flatMap(([, key]) => getCatalog(key));
}

export interface Filters {
  query: string;
  category: string | 'All';
  location: string;
  yearFrom: number | null;
  yearTo: number | null;
  /** Restrict to recordings that have an offline copy. */
  downloadedOnly: boolean;
  favouritesOnly: boolean;
  sort: 'relevance' | 'newest' | 'oldest' | 'title' | 'longest';
}

export const DEFAULT_FILTERS: Filters = {
  query: '',
  category: 'All',
  location: '',
  yearFrom: null,
  yearTo: null,
  downloadedOnly: false,
  favouritesOnly: false,
  sort: 'relevance',
};

export function countActiveFilters(f: Filters): number {
  let n = 0;
  if (f.category !== 'All') n++;
  if (f.location) n++;
  if (f.yearFrom || f.yearTo) n++;
  if (f.downloadedOnly) n++;
  if (f.favouritesOnly) n++;
  if (f.sort !== 'relevance') n++;
  return n;
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Cached per recording so a keystroke doesn't re-normalise 6,400 strings. */
const haystackCache = new WeakMap<Recording, string>();

function haystackOf(r: Recording): string {
  let h = haystackCache.get(r);
  if (h === undefined) {
    h = normalize(
      [r.title, r.breadcrumb.join(' '), r.location ?? '', r.scripture ?? '', r.date ?? '', r.year ?? '']
        .join(' '),
    );
    haystackCache.set(r, h);
  }
  return h;
}

/**
 * Every whitespace-separated term must appear, so "bg mumbai 2015" narrows
 * instead of returning everything matching any one word.
 */
export function matches(r: Recording, terms: string[]): boolean {
  if (!terms.length) return true;
  const hay = haystackOf(r);
  return terms.every((t) => hay.includes(t));
}

/** Earlier-matching, shorter titles rank first for a given query. */
export function relevance(r: Recording, terms: string[]): number {
  if (!terms.length) return 0;
  const title = normalize(r.title);
  let score = 0;
  for (const t of terms) {
    const i = title.indexOf(t);
    if (i === 0) score -= 100;
    else if (i > 0) score -= 50;
  }
  return score + title.length / 1000;
}

export interface UseLecturesResult {
  results: Recording[];
  total: number;
  filters: Filters;
  setFilters: Dispatch<SetStateAction<Filters>>;
  resetFilters: () => void;
  categories: Array<{ key: string; count: number }>;
  locations: string[];
  years: number[];
  activeFilterCount: number;
}

export interface UseLecturesOptions {
  maharaj: MaharajKey;
  isDownloaded?: (id: string) => boolean;
  isFavourite?: (id: string) => boolean;
  /** Cap on rendered rows; the full match count is still reported. */
  limit?: number;
}

export function useLectures(opts: UseLecturesOptions): UseLecturesResult {
  const { maharaj, isDownloaded, isFavourite, limit = 300 } = opts;
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  const all = useMemo(() => getCatalog(maharaj), [maharaj]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of all) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
    return [...counts.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count);
  }, [all]);

  const locations = useMemo(
    () =>
      [...new Set(all.map((r) => r.location).filter((l): l is string => Boolean(l)))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [all],
  );

  const years = useMemo(
    () => [...new Set(all.map((r) => r.year).filter((y): y is number => Boolean(y)))].sort((a, b) => b - a),
    [all],
  );

  const { results, total } = useMemo(() => {
    const terms = normalize(filters.query).split(' ').filter(Boolean);

    const filtered = all.filter((r) => {
      if (filters.category !== 'All' && r.category !== filters.category) return false;
      if (filters.location && r.location !== filters.location) return false;
      if (filters.yearFrom && (r.year ?? 0) < filters.yearFrom) return false;
      if (filters.yearTo && (r.year ?? 9999) > filters.yearTo) return false;
      if (filters.downloadedOnly && !isDownloaded?.(r.id)) return false;
      if (filters.favouritesOnly && !isFavourite?.(r.id)) return false;
      return matches(r, terms);
    });

    const sorted = filtered.slice();
    switch (filters.sort) {
      case 'newest':
        sorted.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
        break;
      case 'oldest':
        sorted.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
        break;
      case 'title':
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'longest':
        sorted.sort((a, b) => b.sizeBytes - a.sizeBytes);
        break;
      default:
        if (terms.length) sorted.sort((a, b) => relevance(a, terms) - relevance(b, terms));
        else sorted.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    }

    return { results: sorted.slice(0, limit), total: filtered.length };
  }, [all, filters, isDownloaded, isFavourite, limit]);

  const resetFilters = () => setFilters(DEFAULT_FILTERS);

  return {
    results,
    total,
    filters,
    setFilters,
    resetFilters,
    categories,
    locations,
    years,
    activeFilterCount: countActiveFilters(filters),
  };
}
