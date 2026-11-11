import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import VerseSpeakerChips from '../../components/VerseSpeakerChips';
import VerseLectureRow from '../../components/VerseLectureRow';
import { useAudio } from '../../contexts/AudioContext';
import { useDownload } from '../../contexts/DownloadContext';
import { MAHARAJAS, honoured } from '../../data/maharajas';
import {
  adjacentChapter, chapterLabel, getChapter, getPart, verseLabel, verseTranslation,
} from '../../data/verseIndex';
import {
  chapterTalks, recordingOf, rememberPlace, sequenceForChapter, useVerseSpeaker, verseCounts,
} from '../../hooks/useVerses';
import type { BookKey } from '../../utils/verseRef';
import { BOOK_META, chapterHref, verseHref } from '../../utils/shastraNav';
import { C, R, alpha } from '../../constants/theme';

/** One chapter: every verse in order, each with how many lectures it has. */
export default function ChapterScreen() {
  const params = useLocalSearchParams<{ book: string; part: string; n: string }>();
  const book = String(params.book ?? 'BG') as BookKey;
  const part = String(params.part ?? '');
  const n = Number(params.n ?? 1);
  const navigation = useNavigation();
  const audio = useAudio();
  const { getLocalUri } = useDownload();
  const [speaker] = useVerseSpeaker();
  const [showAllTalks, setShowAllTalks] = useState(false);

  const chapter = useMemo(() => getChapter(book, part, n), [book, part, n]);
  const meta = BOOK_META[book] ?? BOOK_META.BG;
  const label = chapterLabel(book, part, n);

  useEffect(() => {
    navigation.setOptions({ title: label });
    if (chapter) rememberPlace({ book, part, n });
  }, [label, navigation, chapter, book, part, n]);

  const counts = useMemo(
    () => (chapter ? verseCounts(book, part, n, chapter.verses) : []),
    [book, part, n, chapter],
  );
  const talks = useMemo(() => chapterTalks(book, part, n, speaker), [book, part, n, speaker]);
  const sequence = useMemo(
    () => (chapter ? sequenceForChapter(book, part, n, chapter.verses, speaker) : []),
    [book, part, n, chapter, speaker],
  );

  if (!chapter) {
    return (
      <View style={styles.screen}>
        <Text style={styles.empty}>Chapter not found.</Text>
      </View>
    );
  }

  const covered = counts.filter((c) => c.audio + c.video > 0).length;
  const prev = adjacentChapter(book, part, n, -1);
  const next = adjacentChapter(book, part, n, 1);
  const partName = getPart(book, part)?.name;

  const playSequence = (fromIndex = 0) => {
    const items = sequence
      .slice(fromIndex)
      .map((s) => recordingOf(s.lecture))
      .filter((r): r is NonNullable<typeof r> => Boolean(r))
      .map((recording) => ({ recording, localUri: getLocalUri(recording.id) }));
    if (!items.length) {
      Alert.alert('No audio lectures', 'No verse of this chapter has an archive lecture yet — try the videos on each verse.');
      return;
    }
    audio.playQueue(items);
  };

  const whose =
    speaker === 'all' ? 'your Maharajas first' : `${honoured(MAHARAJAS[speaker].short)} first`;

  const header = (
    <View>
      <View style={[styles.hero, { borderColor: meta.color + alpha(0.35), backgroundColor: meta.color + alpha(0.08) }]}>
        <Text style={[styles.heroKicker, { color: meta.color }]}>
          {[partName && book !== 'BG' ? partName : null, `Chapter ${n}`].filter(Boolean).join(' · ')}
        </Text>
        <Text style={styles.heroTitle}>{chapter.title}</Text>
        <Text style={styles.heroSub}>
          {chapter.verses.length} verses · lectures on {covered}
        </Text>

        <Pressable
          onPress={() => playSequence(0)}
          style={({ pressed }) => [styles.seqBtn, { backgroundColor: meta.color }, pressed && styles.pressed]}
        >
          <Ionicons name="play" size={16} color="#fff" />
          <Text style={styles.seqText}>Play chapter in sequence</Text>
        </Pressable>
        <Text style={styles.seqNote}>
          {sequence.length} lectures, verse by verse — {whose}, others where they have not spoken.
        </Text>
      </View>

      <VerseSpeakerChips />

      {talks.audio.length > 0 && (
        <>
          <Text style={styles.section}>On the whole chapter</Text>
          {(showAllTalks ? talks.audio : talks.audio.slice(0, 3)).map((l) => (
            <VerseLectureRow key={l.id} lecture={l} />
          ))}
          {talks.audio.length > 3 && (
            <Pressable onPress={() => setShowAllTalks((v) => !v)} style={styles.moreBtn}>
              <Text style={[styles.moreText, { color: meta.color }]}>
                {showAllTalks ? 'Show fewer' : `Show all ${talks.audio.length}`}
              </Text>
            </Pressable>
          )}
        </>
      )}

      <Text style={styles.section}>Verses</Text>
    </View>
  );

  const footer = (
    <View style={styles.navRow}>
      {prev ? (
        <Pressable
          onPress={() => router.replace(chapterHref(book, prev.part, prev.n) as any)}
          style={({ pressed }) => [styles.navBtn, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={16} color={C.textSub} />
          <Text style={styles.navText}>{chapterLabel(book, prev.part, prev.n)}</Text>
        </Pressable>
      ) : (
        <View />
      )}
      {next ? (
        <Pressable
          onPress={() => router.replace(chapterHref(book, next.part, next.n) as any)}
          style={({ pressed }) => [styles.navBtn, pressed && styles.pressed]}
        >
          <Text style={styles.navText}>{chapterLabel(book, next.part, next.n)}</Text>
          <Ionicons name="chevron-forward" size={16} color={C.textSub} />
        </Pressable>
      ) : (
        <View />
      )}
    </View>
  );

  return (
    <FlatList
      style={styles.screen}
      data={counts}
      keyExtractor={(c) => c.entry}
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      contentContainerStyle={{ paddingTop: 8, paddingBottom: 150 }}
      initialNumToRender={15}
      maxToRenderPerBatch={20}
      windowSize={11}
      renderItem={({ item }) => {
        const text = verseTranslation(book, part, n, item.entry);
        const none = item.audio + item.video === 0;
        const seqIdx = sequence.findIndex((s) => s.entry === item.entry);
        return (
          <Pressable
            onPress={() => router.push(verseHref(book, part, n, item.entry) as any)}
            style={({ pressed }) => [styles.verse, pressed && styles.pressed]}
          >
            <View style={styles.verseTop}>
              <Text style={[styles.verseLabel, { color: meta.color }]}>
                {verseLabel(book, part, n, item.entry)}
              </Text>
              <View style={{ flex: 1 }} />
              {none ? (
                <Text style={styles.noneText}>no lecture yet</Text>
              ) : (
                <>
                  {item.mine > 0 && <Badge icon="star" text={String(item.mine)} color={meta.color} />}
                  {item.audio > 0 && <Badge icon="headset" text={String(item.audio)} color={C.textSub} />}
                  {item.video > 0 && <Badge icon="logo-youtube" text={String(item.video)} color={C.youtube} />}
                </>
              )}
              {seqIdx >= 0 && (
                <Pressable
                  onPress={() => playSequence(seqIdx)}
                  hitSlop={8}
                  style={[styles.miniPlay, { borderColor: meta.color + alpha(0.6) }]}
                  accessibilityLabel={`Play from ${verseLabel(book, part, n, item.entry)}`}
                >
                  <Ionicons name="play" size={12} color={meta.color} style={{ marginLeft: 1 }} />
                </Pressable>
              )}
            </View>
            {text ? (
              <Text style={styles.verseText} numberOfLines={3}>
                {text}
              </Text>
            ) : null}
          </Pressable>
        );
      }}
    />
  );
}

function Badge({ icon, text, color }: { icon: string; text: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color + alpha(0.12) }]}>
      <Ionicons name={icon as any} size={10} color={color} />
      <Text style={[styles.badgeText, { color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  pressed: { opacity: 0.75 },
  empty: { color: C.textDim, textAlign: 'center', marginTop: 60 },

  hero: { marginHorizontal: 16, marginBottom: 6, padding: 16, borderRadius: R.xl, borderWidth: 1 },
  heroKicker: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  heroTitle: { color: C.text, fontSize: 19, fontWeight: '800', marginTop: 4, lineHeight: 24 },
  heroSub: { color: C.textSub, fontSize: 12, marginTop: 4 },
  seqBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 14, paddingVertical: 12, borderRadius: R.pill,
  },
  seqText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  seqNote: { color: C.textDim, fontSize: 11, marginTop: 7, textAlign: 'center' },

  section: {
    color: C.text, fontSize: 16, fontWeight: '800',
    marginHorizontal: 16, marginTop: 18, marginBottom: 6,
  },
  moreBtn: { alignItems: 'center', paddingVertical: 8 },
  moreText: { fontSize: 13, fontWeight: '700' },

  verse: {
    marginHorizontal: 16, marginVertical: 4, padding: 12,
    backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.border,
  },
  verseTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  verseLabel: { fontSize: 13, fontWeight: '800' },
  verseText: { color: C.textSub, fontSize: 12.5, lineHeight: 18, marginTop: 6 },
  noneText: { color: C.textFaint, fontSize: 11, fontStyle: 'italic' },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  badgeText: { fontSize: 10.5, fontWeight: '800' },
  miniPlay: {
    width: 26, height: 26, borderRadius: 13, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', marginLeft: 4,
  },

  navRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginHorizontal: 16, marginTop: 18,
  },
  navBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: C.surface, borderRadius: R.pill, borderWidth: 1, borderColor: C.border,
  },
  navText: { color: C.textSub, fontSize: 12.5, fontWeight: '700' },
});
