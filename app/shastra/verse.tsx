import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import VerseSpeakerChips from '../../components/VerseSpeakerChips';
import VerseLectureRow from '../../components/VerseLectureRow';
import VideoCard from '../../components/VideoCard';
import { useSettings } from '../../contexts/SettingsContext';
import { MAHARAJAS, honoured } from '../../data/maharajas';
import {
  TIER_LABEL, adjacentVerse, getChapter, isSingleChapter, vedabaseUrl, verseLabel, verseTranslation,
  type SpeakerTier, type VerseAudio, type VerseVideo,
} from '../../data/verseIndex';
import { lecturesForVerse, rememberPlace, useVerseSpeaker } from '../../hooks/useVerses';
import { useLiveVerseVideos, verseVideoResult } from '../../hooks/useLiveVerseVideos';
import type { BookKey } from '../../utils/verseRef';
import { BOOK_META, chapterHref, verseHref } from '../../utils/shastraNav';
import { C, R, alpha } from '../../constants/theme';

const TIERS: SpeakerTier[] = [0, 1, 2, 3];
/** Rows shown per tier before "Show all". */
const FOLD = 6;


/** One verse: its translation and every lecture on it, best first. */
export default function VerseScreen() {
  const params = useLocalSearchParams<{ book: string; part: string; n: string; entry: string }>();
  const book = String(params.book ?? 'BG') as BookKey;
  const part = String(params.part ?? '');
  const n = Number(params.n ?? 1);
  const entry = String(params.entry ?? '1');
  const navigation = useNavigation();
  const [speaker] = useVerseSpeaker();
  const { readerFontScale } = useSettings();
  const fs = (x: number) => Math.round(x * readerFontScale);
  const [expanded, setExpanded] = useState<Set<SpeakerTier>>(new Set());

  const meta = BOOK_META[book] ?? BOOK_META.BG;
  const label = verseLabel(book, part, n, entry);
  const chapter = useMemo(() => getChapter(book, part, n), [book, part, n]);
  const text = useMemo(() => verseTranslation(book, part, n, entry), [book, part, n, entry]);
  const lectures = useMemo(() => lecturesForVerse(book, part, n, entry, speaker), [book, part, n, entry, speaker]);

  useEffect(() => {
    navigation.setOptions({ title: label });
    rememberPlace({ book, part, n, entry });
  }, [label, navigation, book, part, n, entry]);

  const live = useLiveVerseVideos(book, part, n, entry, label, lectures.video, speaker);

  const prev = adjacentVerse(book, part, n, entry, -1);
  const next = adjacentVerse(book, part, n, entry, 1);
  const go = (to: { part: string; n: number; entry: string }) =>
    router.replace(verseHref(book, to.part, to.n, to.entry) as any);

  const byTier = (t: SpeakerTier) => lectures.audio.filter((l) => l.tier === t);
  const total = lectures.audio.length + lectures.video.length;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingTop: 8, paddingBottom: 160 }}>
      {/* ---------------- the verse ---------------- */}
      <View style={[styles.hero, { borderColor: meta.color + alpha(0.35), backgroundColor: meta.color + alpha(0.08) }]}>
        <Pressable onPress={() => router.push(chapterHref(book, part, n) as any)} hitSlop={6}>
          <Text style={[styles.kicker, { color: meta.color }]} numberOfLines={1}>
            {chapter?.title} ›
          </Text>
        </Pressable>
        <Text style={styles.label}>{label}</Text>
        {text ? (
          <Text style={[styles.translation, { fontSize: fs(15), lineHeight: fs(23) }]}>{text}</Text>
        ) : null}
        <Pressable
          onPress={() => WebBrowser.openBrowserAsync(vedabaseUrl(book, part, n, entry))}
          style={styles.vedabase}
          hitSlop={6}
        >
          <Ionicons name="book-outline" size={13} color={C.textDim} />
          <Text style={styles.vedabaseText}>Sanskrit, synonyms and purport on vedabase.io</Text>
        </Pressable>
      </View>

      <View style={styles.navRow}>
        <NavBtn icon="chevron-back" text={prev ? verseLabel(book, prev.part, prev.n, prev.entry) : null} onPress={() => prev && go(prev)} />
        <NavBtn icon="chevron-forward" text={next ? verseLabel(book, next.part, next.n, next.entry) : null} onPress={() => next && go(next)} trailing />
      </View>

      <VerseSpeakerChips />

      {total === 0 && (
        <View style={styles.none}>
          <Ionicons name="mic-off-outline" size={28} color={C.textFaint} />
          <Text style={styles.noneTitle}>No archive lecture on this verse yet</Text>
          <Text style={styles.noneText}>
            Videos found on YouTube are below. Talks on the whole {isSingleChapter(book) ? 'book' : 'chapter'} are
            on the {isSingleChapter(book) ? 'book' : 'chapter'} page.
          </Text>
        </View>
      )}

      {/* ---------------- audio, by tier ---------------- */}
      {TIERS.map((t) => {
        const list = byTier(t);
        if (!list.length) return null;
        const open = expanded.has(t);
        const shown = open ? list : list.slice(0, FOLD);
        return (
          <View key={t}>
            <SectionTitle
              text={t === 0 && speaker !== 'all' ? `${honoured(MAHARAJAS[speaker].short)} & your speakers` : TIER_LABEL[t]}
              count={list.length}
              icon="headset"
            />
            {shown.map((l: VerseAudio) => (
              <VerseLectureRow key={`${l.id}:${l.from}`} lecture={l} />
            ))}
            {list.length > FOLD && (
              <Pressable
                onPress={() =>
                  setExpanded((prev) => {
                    const s = new Set(prev);
                    if (s.has(t)) s.delete(t);
                    else s.add(t);
                    return s;
                  })
                }
                style={styles.moreBtn}
              >
                <Text style={[styles.moreText, { color: meta.color }]}>
                  {open ? 'Show fewer' : `Show all ${list.length}`}
                </Text>
              </Pressable>
            )}
          </View>
        );
      })}

      {/* ---------------- video ---------------- */}
      {lectures.video.length > 0 && (
        <>
          <SectionTitle text="Videos by your speakers" count={lectures.video.length} icon="logo-youtube" />
          {lectures.video.map((v) => (
            <VideoCard key={v.videoId} video={verseVideoResult(v)} />
          ))}
        </>
      )}

      <SectionTitle text={`More on YouTube for ${label}`} count={live.videos.length || undefined} icon="search" />
      {live.loading ? (
        <ActivityIndicator style={{ marginVertical: 16 }} color={meta.color} />
      ) : live.error ? (
        <Pressable onPress={live.retry} style={styles.moreBtn}>
          <Text style={[styles.moreText, { color: meta.color }]}>Could not reach YouTube — tap to retry</Text>
        </Pressable>
      ) : live.videos.length ? (
        live.videos.map((v) => <VideoCard key={v.videoId} video={v} />)
      ) : (
        <Text style={styles.liveEmpty}>No further videos name this verse.</Text>
      )}
    </ScrollView>
  );
}

function SectionTitle({ text, count, icon }: { text: string; count?: number; icon: string }) {
  return (
    <View style={styles.sectionRow}>
      <Ionicons name={icon as any} size={15} color={C.textSub} />
      <Text style={styles.section} numberOfLines={1}>{text}</Text>
      {count ? <Text style={styles.sectionCount}>{count}</Text> : null}
    </View>
  );
}

function NavBtn({
  icon, text, onPress, trailing,
}: { icon: string; text: string | null; onPress: () => void; trailing?: boolean }) {
  if (!text) return <View />;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.navBtn, pressed && styles.pressed]}>
      {!trailing && <Ionicons name={icon as any} size={16} color={C.textSub} />}
      <Text style={styles.navText}>{text}</Text>
      {trailing && <Ionicons name={icon as any} size={16} color={C.textSub} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  pressed: { opacity: 0.75 },
  hero: { marginHorizontal: 16, padding: 16, borderRadius: R.xl, borderWidth: 1 },
  kicker: { fontSize: 11.5, fontWeight: '800' },
  label: { color: C.text, fontSize: 24, fontWeight: '800', marginTop: 4 },
  translation: { color: C.text, fontWeight: '500', marginTop: 10 },
  vedabase: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  vedabaseText: { color: C.textDim, fontSize: 12, textDecorationLine: 'underline' },

  navRow: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 16, marginTop: 10 },
  navBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 14, paddingVertical: 9,
    backgroundColor: C.surface, borderRadius: R.pill, borderWidth: 1, borderColor: C.border,
  },
  navText: { color: C.textSub, fontSize: 12.5, fontWeight: '700' },

  none: { alignItems: 'center', gap: 6, marginHorizontal: 30, marginTop: 18 },
  noneTitle: { color: C.text, fontSize: 14.5, fontWeight: '700' },
  noneText: { color: C.textDim, fontSize: 12, textAlign: 'center', lineHeight: 17 },

  sectionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 20, marginBottom: 6,
  },
  section: { color: C.text, fontSize: 15.5, fontWeight: '800', flexShrink: 1 },
  sectionCount: {
    color: C.textDim, fontSize: 11.5, fontWeight: '800',
    backgroundColor: C.surfaceHi, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 8, overflow: 'hidden',
  },
  moreBtn: { alignItems: 'center', paddingVertical: 10 },
  moreText: { fontSize: 13, fontWeight: '700' },
  liveEmpty: { color: C.textFaint, fontSize: 12, marginHorizontal: 16, marginVertical: 8 },
});
