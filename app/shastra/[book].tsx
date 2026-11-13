import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getBook, isProse, type PartInfo } from '../../data/verseIndex';
import { chapterTalks, useVerseSpeaker, verseCounts } from '../../hooks/useVerses';
import type { BookKey } from '../../utils/verseRef';
import { BOOK_META, chapterHref } from '../../utils/shastraNav';
import { C, R, alpha } from '../../constants/theme';

/** A book's cantos / lilas, each opening onto its chapters in order. */
export default function BookScreen() {
  const { book: raw } = useLocalSearchParams<{ book: string }>();
  const navigation = useNavigation();
  const bookKey = String(raw ?? 'BG').toUpperCase() as BookKey;
  const book = useMemo(() => getBook(bookKey), [bookKey]);
  const meta = BOOK_META[bookKey] ?? BOOK_META.BG;

  // The Gita has a single "part"; open it. Cantos and lilas start closed so
  // the whole Bhagavatam index isn't parsed just to show a list of cantos.
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(book && book.parts.length === 1 ? [book.parts[0].key] : []),
  );

  useEffect(() => {
    navigation.setOptions({ title: meta.short });
  }, [meta.short, navigation]);

  if (!book) {
    return (
      <View style={styles.screen}>
        <Text style={styles.empty}>Unknown book.</Text>
      </View>
    );
  }

  const toggle = (k: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 150, paddingTop: 8 }}>
      <View style={[styles.hero, { borderColor: meta.color + alpha(0.35), backgroundColor: meta.color + alpha(0.08) }]}>
        <Ionicons name={meta.icon as any} size={26} color={meta.color} />
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>{book.name}</Text>
          <Text style={styles.heroSub}>{meta.blurb}</Text>
        </View>
      </View>

      {book.parts.map((p) =>
        book.parts.length === 1 ? (
          <ChapterList key={p.key} book={bookKey} part={p} color={meta.color} />
        ) : (
          <View key={p.key}>
            <Pressable
              onPress={() => toggle(p.key)}
              style={({ pressed }) => [styles.partRow, pressed && styles.pressed]}
            >
              <View style={[styles.partBadge, { backgroundColor: meta.color + alpha(0.16) }]}>
                <Text style={[styles.partBadgeText, { color: meta.color }]}>
                  {bookKey === 'SB' ? p.key : p.key[0].toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.partName}>{p.name}</Text>
                <Text style={styles.partSub}>
                  {p.chapters.length} chapters · {p.chapters.reduce((a, c) => a + c.verses.length, 0).toLocaleString()} verses
                </Text>
              </View>
              <Ionicons name={open.has(p.key) ? 'chevron-up' : 'chevron-down'} size={18} color={C.textDim} />
            </Pressable>
            {open.has(p.key) && <ChapterList book={bookKey} part={p} color={meta.color} />}
          </View>
        ),
      )}
    </ScrollView>
  );
}

function ChapterList({ book, part, color }: { book: BookKey; part: PartInfo; color: string }) {
  const prose = isProse(book);
  const [speaker] = useVerseSpeaker();
  // Coverage per chapter — loads this part's index shard once. A prose
  // chapter (Nectar of Devotion) counts its lectures; a verse chapter counts
  // the verses that have at least one.
  const coverage = useMemo(
    () =>
      part.chapters.map((c) => {
        if (prose) {
          const t = chapterTalks(book, part.key, c.n, speaker);
          const all = [...t.audio, ...t.video];
          return { covered: all.length, mine: all.filter((l) => l.tier === 0).length };
        }
        const counts = verseCounts(book, part.key, c.n, c.verses);
        return {
          covered: counts.filter((x) => x.audio + x.video > 0).length,
          mine: counts.filter((x) => x.mine > 0).length,
        };
      }),
    [book, part, prose, speaker],
  );
  // Prose: the bar is relative to the best-covered chapter.
  const most = Math.max(1, ...coverage.map((c) => c.covered));

  return (
    <View style={styles.list}>
      {part.chapters.map((c, i) => {
        const cov = coverage[i];
        const frac = prose ? cov.covered / most : c.verses.length ? cov.covered / c.verses.length : 0;
        return (
          <Pressable
            key={c.n}
            onPress={() => router.push(chapterHref(book, part.key, c.n) as any)}
            style={({ pressed }) => [styles.chRow, i > 0 && styles.divider, pressed && styles.pressed]}
          >
            {/* NOD's Introduction is chapter 0. */}
            <Text style={[styles.chNum, { color }]}>{c.n === 0 ? 'i' : c.n}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.chTitle} numberOfLines={2}>{c.title}</Text>
              <Text style={styles.chMeta}>
                {prose
                  ? cov.covered
                    ? `${cov.covered} lecture${cov.covered === 1 ? '' : 's'}`
                    : 'no lecture yet'
                  : `${c.verses.length} verses · lectures on ${cov.covered}`}
                {cov.mine ? ` · ${cov.mine} by your speakers` : ''}
              </Text>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${frac * 100}%`, backgroundColor: color }]} />
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={C.textFaint} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  pressed: { opacity: 0.75 },
  empty: { color: C.textDim, textAlign: 'center', marginTop: 60 },
  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginHorizontal: 16, marginBottom: 10, padding: 16, borderRadius: R.xl, borderWidth: 1,
  },
  heroTitle: { color: C.text, fontSize: 17, fontWeight: '800' },
  heroSub: { color: C.textSub, fontSize: 12, marginTop: 3 },

  partRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginTop: 8, padding: 13,
    backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.border,
  },
  partBadge: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  partBadgeText: { fontSize: 15, fontWeight: '800' },
  partName: { color: C.text, fontSize: 15, fontWeight: '700' },
  partSub: { color: C.textDim, fontSize: 11.5, marginTop: 2 },

  list: {
    marginHorizontal: 16, marginTop: 6,
    backgroundColor: C.surfaceLo, borderRadius: R.lg, borderWidth: 1, borderColor: C.border,
    overflow: 'hidden',
  },
  chRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  divider: { borderTopWidth: 1, borderTopColor: C.border },
  chNum: { width: 26, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  chTitle: { color: C.text, fontSize: 13.5, fontWeight: '700', lineHeight: 18 },
  chMeta: { color: C.textDim, fontSize: 11, marginTop: 3 },
  track: { height: 3, backgroundColor: C.surfaceHi, borderRadius: 2, marginTop: 7, overflow: 'hidden' },
  fill: { height: 3, borderRadius: 2 },
});
