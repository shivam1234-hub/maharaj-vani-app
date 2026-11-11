import React, { useMemo, useState } from 'react';
import {
  Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import VerseSpeakerChips from '../../components/VerseSpeakerChips';
import { getBooks, getChapter, chapterLabel, verseLabel, type BookInfo } from '../../data/verseIndex';
import { useLastPlace } from '../../hooks/useVerses';
import { entryEnd, entryStart, parseVerseRefs, type BookKey } from '../../utils/verseRef';
import { C, R, alpha } from '../../constants/theme';
import { BOOK_META, chapterHref, verseHref } from '../../utils/shastraNav';

/**
 * "SB 1.2.6" typed into the jump box → the verse entry holding verse 6 of
 * SB 1.2 (which may be a joined entry like "5-6"), or the chapter when no
 * verse was given. null when the reference is not a real verse.
 */
function resolveJump(text: string): string | null {
  // Bare numbers are read as Gita references ("2.47"), the most common ask.
  const t = /^\s*\d/.test(text) ? `BG ${text}` : text;
  const ref = parseVerseRefs(t)[0];
  if (!ref) return null;
  const ch = getChapter(ref.book, ref.part, ref.chapter);
  if (!ch) return null;
  if (ref.from == null) return chapterHref(ref.book, ref.part, ref.chapter);
  const entry = ch.verses.find((e) => ref.from! >= entryStart(e) && ref.from! <= entryEnd(e));
  return entry ? verseHref(ref.book, ref.part, ref.chapter, entry) : null;
}

export default function VersesScreen() {
  const insets = useSafeAreaInsets();
  const books = useMemo(() => getBooks(), []);
  const last = useLastPlace();
  const [jump, setJump] = useState('');
  const [jumpError, setJumpError] = useState(false);

  const go = () => {
    const href = resolveJump(jump);
    if (!href) {
      setJumpError(true);
      return;
    }
    setJumpError(false);
    Keyboard.dismiss();
    router.push(href as any);
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: 150 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.kicker}>Shastra</Text>
        <Text style={styles.title}>Verse by verse</Text>
        <Text style={styles.sub}>
          Every shloka in order, with the lectures given on it — your Maharajas and Prabhujis
          first, then other Maharajas wherever they have not spoken.
        </Text>
      </View>

      {/* ---------------- jump to a verse ---------------- */}
      <View style={[styles.jump, jumpError && { borderColor: C.danger }]}>
        <Ionicons name="navigate-outline" size={18} color={C.textDim} />
        <TextInput
          value={jump}
          onChangeText={(v) => {
            setJump(v);
            if (jumpError) setJumpError(false);
          }}
          onSubmitEditing={go}
          placeholder="Go to verse — SB 1.2.6, BG 2.47"
          placeholderTextColor={C.textFaint}
          style={styles.jumpInput}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="go"
        />
        <Pressable onPress={go} hitSlop={8} style={styles.jumpBtn} accessibilityLabel="Go to verse">
          <Ionicons name="arrow-forward" size={17} color="#fff" />
        </Pressable>
      </View>
      {jumpError && <Text style={styles.jumpErr}>Not a verse I can find — try “SB 1.2.6”.</Text>}

      {/* ---------------- continue ---------------- */}
      {last && getChapter(last.book, last.part, last.n) && (
        <Pressable
          onPress={() =>
            router.push(
              (last.entry
                ? verseHref(last.book, last.part, last.n, last.entry)
                : chapterHref(last.book, last.part, last.n)) as any,
            )
          }
          style={({ pressed }) => [styles.continue, pressed && styles.pressed]}
        >
          <View style={[styles.contIcon, { backgroundColor: BOOK_META[last.book].color + alpha(0.18) }]}>
            <Ionicons name="bookmark" size={18} color={BOOK_META[last.book].color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.contLabel, { color: BOOK_META[last.book].color }]}>CONTINUE</Text>
            <Text style={styles.contTitle}>
              {last.entry
                ? verseLabel(last.book, last.part, last.n, last.entry)
                : chapterLabel(last.book, last.part, last.n)}
              {' · '}
              {getChapter(last.book, last.part, last.n)?.title}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.textFaint} />
        </Pressable>
      )}

      <Text style={styles.section}>Put first</Text>
      <VerseSpeakerChips />

      <Text style={styles.section}>Books</Text>
      {books.map((b) => (
        <BookCard key={b.key} book={b} />
      ))}

      <Text style={styles.footer}>
        Verse text: Bhaktivedanta Book Trust (vedabase.io). Audio: audio.iskcondesiretree.com.
      </Text>
    </ScrollView>
  );
}

function BookCard({ book }: { book: BookInfo }) {
  const meta = BOOK_META[book.key];
  const chapters = book.parts.reduce((a, p) => a + p.chapters.length, 0);
  const verses = book.parts.reduce((a, p) => a + p.chapters.reduce((x, c) => x + c.verses.length, 0), 0);
  const parts =
    book.key === 'SB' ? `${book.parts.length} cantos · ` : book.key === 'CC' ? `${book.parts.length} lilas · ` : '';

  return (
    <Pressable
      onPress={() => router.push(`/shastra/${book.key}` as any)}
      style={({ pressed }) => [
        styles.book,
        { borderColor: meta.color + alpha(0.35), backgroundColor: meta.color + alpha(0.08) },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.bookIcon, { backgroundColor: meta.color + alpha(0.18) }]}>
        <Ionicons name={meta.icon as any} size={24} color={meta.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.bookName}>{book.name}</Text>
        <Text style={styles.bookBlurb}>{meta.blurb}</Text>
        <Text style={[styles.bookStats, { color: meta.color }]}>
          {parts}
          {chapters} chapters · {verses.toLocaleString()} verses
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={C.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  pressed: { opacity: 0.75 },
  header: { marginHorizontal: 16, marginBottom: 14 },
  kicker: { color: C.textDim, fontSize: 13, fontWeight: '600', letterSpacing: 0.3 },
  title: { color: C.text, fontSize: 27, fontWeight: '800', marginTop: 1 },
  sub: { color: C.textSub, fontSize: 13, lineHeight: 19, marginTop: 6 },

  jump: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, paddingLeft: 14, paddingRight: 6, minHeight: 50,
    backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.border,
  },
  jumpInput: { flex: 1, color: C.text, fontSize: 14, paddingVertical: 10 },
  jumpBtn: {
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FF7722',
  },
  jumpErr: { color: C.danger, fontSize: 12, marginHorizontal: 20, marginTop: 6 },

  continue: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginTop: 14, padding: 14,
    backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.border,
  },
  contIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  contLabel: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8 },
  contTitle: { color: C.text, fontSize: 14, fontWeight: '700', marginTop: 3 },

  section: {
    color: C.text, fontSize: 17, fontWeight: '800',
    marginHorizontal: 16, marginTop: 24, marginBottom: 6,
  },
  book: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginHorizontal: 16, marginTop: 10, padding: 16,
    borderRadius: R.xl, borderWidth: 1,
  },
  bookIcon: { width: 50, height: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  bookName: { color: C.text, fontSize: 16, fontWeight: '800' },
  bookBlurb: { color: C.textSub, fontSize: 12, marginTop: 3 },
  bookStats: { fontSize: 11.5, fontWeight: '700', marginTop: 6 },
  footer: { color: C.textFaint, fontSize: 11, textAlign: 'center', marginTop: 30, marginHorizontal: 24 },
});
