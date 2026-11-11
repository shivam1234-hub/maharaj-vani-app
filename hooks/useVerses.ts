import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MaharajKey, Recording } from '../data/types';
import { MAHARAJAS } from '../data/maharajas';
import {
  chapterLectures, coversEntry, guestRecording, startsAtEntry,
  type VerseAudio, type VerseVideo,
} from '../data/verseIndex';
import type { BookKey } from '../utils/verseRef';
import { getRecordingById } from './useLectures';

// ---------------------------------------------------------- speaker preference

/**
 * The speaker whose lectures the Verses tab puts first and plays in sequence:
 * one of the catalogued Maharajas/Prabhujis, or 'all'. Shared by every verse
 * screen and persisted, so the choice follows the user from chapter to verse.
 */
export type VerseSpeaker = MaharajKey | 'all';
const PREF_KEY = 'verse_speaker_v1';

let pref: VerseSpeaker = 'all';
let loaded = false;
const listeners = new Set<(v: VerseSpeaker) => void>();

function setPref(v: VerseSpeaker) {
  pref = v;
  listeners.forEach((l) => l(v));
  AsyncStorage.setItem(PREF_KEY, v).catch(() => {});
}

export function useVerseSpeaker(): [VerseSpeaker, (v: VerseSpeaker) => void] {
  const [value, setValue] = useState<VerseSpeaker>(pref);
  useEffect(() => {
    listeners.add(setValue);
    if (!loaded) {
      loaded = true;
      AsyncStorage.getItem(PREF_KEY)
        .then((raw) => {
          if (raw && (raw === 'all' || raw in MAHARAJAS)) setPref(raw as VerseSpeaker);
        })
        .catch(() => {});
    } else {
      setValue(pref);
    }
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return [value, setPref];
}

// ---------------------------------------------------------- last opened verse

const LAST_KEY = 'verse_last_v1';
export interface VersePlace {
  book: BookKey;
  part: string;
  n: number;
  entry?: string;
}

export function rememberPlace(p: VersePlace) {
  AsyncStorage.setItem(LAST_KEY, JSON.stringify(p)).catch(() => {});
}

export function useLastPlace(): VersePlace | null {
  const [place, setPlace] = useState<VersePlace | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(LAST_KEY)
      .then((raw) => raw && setPlace(JSON.parse(raw)))
      .catch(() => {});
  }, []);
  return place;
}

// ---------------------------------------------------------- ordering

/**
 * Lower ranks first: the chosen speaker, then the other catalogued speakers,
 * then other Maharajas, Srila Prabhupada, other Prabhujis/Matajis. Within a
 * rank, a class given ON the verse beats one on a range that passes through
 * it, and newer beats older.
 */
/**
 * Recordings in a language other than English or Hindi (or English classes
 * with a running translation into one) — useful, but not what to hear first.
 */
const FOREIGN =
  /(^|[^a-z])(rus|russian|slovenian|slovenski|prevod|hrvatski|croatian|spanish|espanol|italiano?|deutsch|german|french|polish|polski|hungarian|magyar|czech|cesky|portug\w*|chinese|persian|latvian|lithuan\w*|ukrain\w*|bulgarian)([^a-z]|$)/i;

function rank(l: VerseAudio | VerseVideo, entry: string | null, preferred: VerseSpeaker): number {
  const own = preferred !== 'all' && l.speakerKey === preferred ? 0 : 1;
  const exact = entry == null || startsAtEntry(l, entry) ? 0 : 1;
  const foreign = FOREIGN.test(l.title) ? 1 : 0;
  // A class ON the verse beats a long reading that merely passes through it.
  return own * 1000 + l.tier * 100 + exact * 20 + foreign * 10;
}

export function sortLectures<T extends VerseAudio | VerseVideo>(
  list: T[],
  entry: string | null,
  preferred: VerseSpeaker,
): T[] {
  return list.slice().sort((a, b) => {
    const r = rank(a, entry, preferred) - rank(b, entry, preferred);
    if (r) return r;
    const da = 'date' in a ? a.date : '';
    const db = 'date' in b ? b.date : '';
    return db.localeCompare(da);
  });
}

export interface VerseLectures {
  audio: VerseAudio[];
  video: VerseVideo[];
}

/** Lectures touching one verse entry, best first. */
export function lecturesForVerse(
  book: BookKey,
  part: string,
  n: number,
  entry: string,
  preferred: VerseSpeaker,
): VerseLectures {
  const all = chapterLectures(book, part, n);
  return {
    audio: sortLectures(all.audio.filter((l) => coversEntry(l, entry)), entry, preferred),
    video: sortLectures(all.video.filter((l) => coversEntry(l, entry)), entry, preferred),
  };
}

/** Talks on the chapter as a whole (no verse given), best first. */
export function chapterTalks(book: BookKey, part: string, n: number, preferred: VerseSpeaker): VerseLectures {
  const all = chapterLectures(book, part, n);
  return {
    audio: sortLectures(all.audio.filter((l) => l.from == null), null, preferred),
    video: sortLectures(all.video.filter((l) => l.from == null), null, preferred),
  };
}

/** Per verse entry: how many audio lectures, video lectures, and from your speakers. */
export function verseCounts(book: BookKey, part: string, n: number, verses: string[]) {
  const all = chapterLectures(book, part, n);
  return verses.map((entry) => {
    let audio = 0;
    let mine = 0;
    let video = 0;
    for (const l of all.audio) {
      if (!coversEntry(l, entry)) continue;
      audio++;
      if (l.tier === 0) mine++;
    }
    for (const l of all.video) {
      if (!coversEntry(l, entry)) continue;
      video++;
      if (l.tier === 0) mine++;
    }
    return { entry, audio, video, mine };
  });
}

/** A playable Recording for an audio lecture from the index. */
export function recordingOf(l: VerseAudio): Recording | undefined {
  return l.speakerKey === 'guest' ? guestRecording(l.shard, l.row) : getRecordingById(l.id);
}

/**
 * One lecture per verse, in verse order — "the chapter in sequence". For each
 * verse the best-ranked audio lecture is taken (the chosen speaker if they
 * spoke on it, otherwise any other Maharaja), and a lecture already queued
 * for an earlier verse of its range is not queued again.
 */
export function sequenceForChapter(
  book: BookKey,
  part: string,
  n: number,
  verses: string[],
  preferred: VerseSpeaker,
): Array<{ entry: string; lecture: VerseAudio }> {
  const all = chapterLectures(book, part, n).audio;
  const used = new Set<string>();
  const out: Array<{ entry: string; lecture: VerseAudio }> = [];
  for (const entry of verses) {
    // A lecture already queued covers this verse too — don't add another.
    if (all.some((l) => used.has(l.id) && coversEntry(l, entry))) continue;
    const pick = sortLectures(all.filter((l) => startsAtEntry(l, entry)), entry, preferred)[0];
    if (!pick) continue;
    used.add(pick.id);
    out.push({ entry, lecture: pick });
  }
  return out;
}
