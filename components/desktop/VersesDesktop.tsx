/**
 * Desktop Verses (web only): three panes —
 *   scripture tree (book → canto/lila → chapter) |
 *   the chapter's verses with Srila Prabhupada's translations |
 *   every lecture on the selected verse, across speakers.
 *
 * Selection lives in the /verses route params, so the phone's
 * /shastra/[book], /shastra/chapter and /shastra/verse links all land here.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Image, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { a, useTheme } from './theme';
import { Badge, Button, Equalizer, Hover, IconButton, Kicker, ProgressBar, Select, Spinner, Tip, useMenu } from './kit';
import { useRecordingActions, videoHref } from './recordings';
import { useAudioMeta } from '../../contexts/AudioContext.web';
import { useDownload } from '../../contexts/DownloadContext';
import { useHistory } from '../../contexts/HistoryContext';
import { useSettings } from '../../contexts/SettingsContext';
import { GUEST_ACCENT, MAHARAJAS, MAHARAJ_ORDER, honoured, maharajOf } from '../../data/maharajas';
import {
  TIER_LABEL, adjacentChapter, adjacentVerse, chapterLabel, getBooks, getChapter, getPart, isProse, isSingleChapter, vedabaseUrl,
  verseLabel, verseTranslation, type BookInfo, type PartInfo, type SpeakerTier, type VerseAudio, type VerseVideo,
} from '../../data/verseIndex';
import {
  chapterTalks, lecturesForVerse, recordingOf, rememberPlace, sequenceForChapter, useLastPlace, useVerseSpeaker, verseCounts,
  type VerseSpeaker,
} from '../../hooks/useVerses';
import { useLiveVerseVideos, verseVideoResult } from '../../hooks/useLiveVerseVideos';
import { entryEnd, entryStart, parseVerseRefs, type BookKey } from '../../utils/verseRef';
import { BOOK_META, SONGS_COLOR } from '../../utils/shastraNav';
import { SONGS } from '../../utils/songs';
import { formatDuration, formatRecordingDate, type VideoResult } from '../../data/types';
import { openExternal } from '../../utils/desktopBridge';

export interface VersePlaceParams { book?: string; part?: string; n?: string; entry?: string }

type Sel = { book: BookKey; part: string; n: number; entry?: string } | null;

function parseSel(p: VersePlaceParams): Sel {
  const book = String(p.book ?? '').toUpperCase() as BookKey;
  if (!(book in BOOK_META)) return null;
  const part = String(p.part ?? '');
  const n = Number(p.n);
  if (!n || !getChapter(book, part, n)) return null;
  return { book, part, n, entry: p.entry ? String(p.entry) : undefined };
}

function selHref(s: { book: BookKey; part: string; n: number; entry?: string }) {
  return `/verses?book=${s.book}&part=${encodeURIComponent(s.part)}&n=${s.n}${s.entry ? `&entry=${encodeURIComponent(s.entry)}` : ''}`;
}

/** "Invocation" for the Isopanisad's verse 0. */
function entryName(entry: string) {
  return entry === '0' ? 'Invocation' : entry;
}

/** A chapter's label in the tree and headers ("i" for NOD's Introduction). */
function chapterNum(n: number) {
  return n === 0 ? 'i' : String(n);
}

function goSel(s: { book: BookKey; part: string; n: number; entry?: string }) {
  router.setParams({ book: s.book, part: s.part, n: String(s.n), entry: s.entry ?? '' } as any);
}

/** "SB 1.2.6" / "2.47" → a place in the table, or null. */
function resolveJump(text: string): { book: BookKey; part: string; n: number; entry?: string } | null {
  const tx = /^\s*\d/.test(text) ? `BG ${text}` : text;
  const ref = parseVerseRefs(tx)[0];
  if (!ref) return null;
  const ch = getChapter(ref.book, ref.part, ref.chapter);
  if (!ch) return null;
  if (ref.from == null) return { book: ref.book, part: ref.part, n: ref.chapter };
  const entry = ch.verses.find((e) => ref.from! >= entryStart(e) && ref.from! <= entryEnd(e));
  return entry ? { book: ref.book, part: ref.part, n: ref.chapter, entry } : null;
}

export default function VersesDesktop({ params }: { params: VersePlaceParams }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const sel = useMemo(() => parseSel(params), [params.book, params.part, params.n, params.entry]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (sel) rememberPlace({ book: sel.book, part: sel.part, n: sel.n, entry: sel.entry });
  }, [sel?.book, sel?.part, sel?.n, sel?.entry]); // eslint-disable-line react-hooks/exhaustive-deps

  const treeW = width >= 1450 ? 300 : width >= 1300 ? 264 : 220;
  const rightW = width >= 1600 ? 480 : width >= 1350 ? 420 : 340;

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: t.bg }}>
      <Tree width={treeW} sel={sel} />
      <View style={{ flex: 1, minWidth: 0, borderRightWidth: sel ? 1 : 0, borderRightColor: t.border }}>
        {sel ? <ChapterPane sel={sel} /> : <Overview />}
      </View>
      {sel ? (
        <View style={{ width: rightW }}>
          {isProse(sel.book)
            ? <ProseVideosPane sel={sel} />
            : sel.entry ? <VersePane sel={{ ...sel, entry: sel.entry }} /> : <ChapterTalksPane sel={sel} />}
        </View>
      ) : null}
    </View>
  );
}

// ------------------------------------------------------------------ tree

function Tree({ width, sel }: { width: number; sel: Sel }) {
  const t = useTheme();
  const books = useMemo(() => getBooks(), []);
  const [jump, setJump] = useState('');
  const [jumpErr, setJumpErr] = useState(false);
  const [speaker, setSpeaker] = useVerseSpeaker();
  const [open, setOpen] = useState<Set<string>>(() => new Set(sel ? [sel.book, `${sel.book}:${sel.part}`] : ['BG', 'BG:']));

  useEffect(() => {
    if (!sel) return;
    setOpen((prev) => {
      const k1 = sel.book;
      const k2 = `${sel.book}:${sel.part}`;
      if (prev.has(k1) && prev.has(k2)) return prev;
      const next = new Set(prev);
      next.add(k1);
      next.add(k2);
      return next;
    });
  }, [sel?.book, sel?.part]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (k: string) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    return next;
  });

  const go = () => {
    const r = resolveJump(jump);
    if (!r) { setJumpErr(true); return; }
    setJumpErr(false);
    setJump('');
    goSel(r);
  };

  const speakerOptions: Array<{ value: VerseSpeaker; label: string }> = [
    { value: 'all', label: 'All speakers equally' },
    ...MAHARAJ_ORDER.map((k) => ({ value: k as VerseSpeaker, label: honoured(MAHARAJAS[k].short) })),
  ];

  return (
    <View style={{ width, borderRightWidth: 1, borderRightColor: t.border, backgroundColor: t.dark ? t.surfaceLo : t.surfaceLo }}>
      <View style={{ padding: 14, gap: 10, borderBottomWidth: 1, borderBottomColor: t.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 36, paddingHorizontal: 10, borderRadius: 9, borderWidth: 1, borderColor: jumpErr ? t.danger : t.border, backgroundColor: t.surface }}>
          <Ionicons name="navigate-outline" size={15} color={t.textDim} />
          <TextInput
            value={jump}
            onChangeText={(v) => { setJump(v); if (jumpErr) setJumpErr(false); }}
            onSubmitEditing={go}
            placeholder="Go to verse — Bs 5.29"
            placeholderTextColor={t.textFaint}
            style={{ flex: 1, minWidth: 0, width: 0, color: t.text, fontSize: 13, outlineStyle: 'none', height: 34 } as any}
            autoCorrect={false}
          />
          <IconButton icon="arrow-forward" label="Go" size={26} iconSize={14} onPress={go} />
        </View>
        {jumpErr ? <Text style={{ color: t.danger, fontSize: 11.5 }}>Not a verse I can find — try “SB 1.2.6”, “Iso 7” or “NOD 12”.</Text> : null}
        <View>
          <Text style={{ color: t.textFaint, fontSize: 10.5, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Put first</Text>
          <Select label="Whose lectures come first" value={speaker} options={speakerOptions} onChange={setSpeaker} width="100%" />
        </View>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 8, paddingBottom: 20 }}>
        {books.map((b) => {
          const meta = BOOK_META[b.key];
          const bOpen = open.has(b.key);
          const single = isSingleChapter(b.key);
          const only = b.parts[0].chapters[0];
          const singleOn = single && sel?.book === b.key;
          return (
            <View key={b.key}>
              <Hover
                onPress={() => (single ? goSel({ book: b.key, part: b.parts[0].key, n: only.n }) : toggle(b.key))}
                accessibilityLabel={b.name}
                style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 9, height: 38, paddingHorizontal: 8, borderRadius: 8, backgroundColor: singleOn ? a(meta.color, 0.18) : hovered ? t.hover : 'transparent' })}
              >
                <Ionicons name={single ? 'remove' : bOpen ? 'chevron-down' : 'chevron-forward'} size={13} color={single ? 'transparent' : t.textDim} />
                <View style={{ width: 24, height: 24, borderRadius: 7, backgroundColor: a(meta.color, 0.18), alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={meta.icon as any} size={13} color={t.ink(meta.color)} />
                </View>
                <Text style={{ flex: 1, color: t.text, fontSize: 13.5, fontWeight: '800' }} numberOfLines={1}>{meta.short}</Text>
              </Hover>
              {!single && bOpen && (b.parts.length === 1
                ? <ChapterNodes book={b.key} part={b.parts[0]} sel={sel} depth={1} />
                : b.parts.map((p) => {
                  const k = `${b.key}:${p.key}`;
                  const pOpen = open.has(k);
                  return (
                    <View key={k}>
                      <Hover
                        onPress={() => toggle(k)}
                        accessibilityLabel={p.name}
                        style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, height: 32, paddingLeft: 26, paddingRight: 8, borderRadius: 8, backgroundColor: hovered ? t.hover : 'transparent' })}
                      >
                        <Ionicons name={pOpen ? 'chevron-down' : 'chevron-forward'} size={12} color={t.textDim} />
                        <Text style={{ flex: 1, color: t.textSub, fontSize: 13, fontWeight: '700' }}>{p.name}</Text>
                        <Text style={{ color: t.textFaint, fontSize: 11 }}>{p.chapters.length}</Text>
                      </Hover>
                      {pOpen ? <ChapterNodes book={b.key} part={p} sel={sel} depth={2} /> : null}
                    </View>
                  );
                }))}
            </View>
          );
        })}
        <Hover
          onPress={() => router.push('/songs' as any)}
          accessibilityLabel="Prayers & Songs"
          style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 9, height: 38, paddingHorizontal: 8, marginTop: 6, borderRadius: 8, backgroundColor: hovered ? t.hover : 'transparent' })}
        >
          <Ionicons name="remove" size={13} color="transparent" />
          <View style={{ width: 24, height: 24, borderRadius: 7, backgroundColor: a(SONGS_COLOR, 0.18), alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="musical-notes" size={13} color={t.ink(SONGS_COLOR)} />
          </View>
          <Text style={{ flex: 1, color: t.text, fontSize: 13.5, fontWeight: '800' }} numberOfLines={1}>Prayers & Songs</Text>
          <Ionicons name="arrow-forward" size={13} color={t.textDim} />
        </Hover>
        <Text style={{ color: t.textFaint, fontSize: 10.5, lineHeight: 14, margin: 10, marginTop: 18 }}>
          Verse text: Bhaktivedanta Book Trust (vedabase.io). Audio: audio.iskcondesiretree.com.
        </Text>
      </ScrollView>
    </View>
  );
}

function ChapterNodes({ book, part, sel, depth }: { book: BookKey; part: PartInfo; sel: Sel; depth: number }) {
  const t = useTheme();
  const meta = BOOK_META[book];
  // Coverage loads this part's index shard once — only for parts opened.
  const prose = isProse(book);
  const [speaker] = useVerseSpeaker();
  // A prose chapter (Nectar of Devotion) counts its lectures, relative to the
  // best-covered chapter; a verse chapter, the share of verses with one.
  const { coverage, counts } = useMemo(() => {
    if (prose) {
      const n = part.chapters.map((c) => {
        const tk = chapterTalks(book, part.key, c.n, speaker);
        return tk.audio.length + tk.video.length;
      });
      const most = Math.max(1, ...n);
      return { coverage: n.map((x) => x / most), counts: n };
    }
    const cov = part.chapters.map((c) => {
      const cs = verseCounts(book, part.key, c.n, c.verses);
      return c.verses.length ? cs.filter((x) => x.audio + x.video > 0).length / c.verses.length : 0;
    });
    return { coverage: cov, counts: null as number[] | null };
  }, [book, part, prose, speaker]);
  return (
    <View>
      {part.chapters.map((c, i) => {
        const on = sel?.book === book && sel.part === part.key && sel.n === c.n;
        return (
          <Tip key={c.n} label={`${c.n === 0 ? meta.short : chapterLabel(book, part.key, c.n)} · ${c.title} — ${counts ? `${counts[i]} lecture${counts[i] === 1 ? '' : 's'}` : `${c.verses.length} verses, lectures on ${Math.round(coverage[i] * 100)}%`}`}>
            <Hover
              onPress={() => goSel({ book, part: part.key, n: c.n })}
              accessibilityLabel={c.title}
              style={({ hovered }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 30, paddingVertical: 5,
                paddingLeft: depth === 1 ? 32 : 46, paddingRight: 8, borderRadius: 7,
                backgroundColor: on ? a(meta.color, 0.18) : hovered ? t.hover : 'transparent',
              } as any)}
            >
              <Text style={{ width: 22, color: on ? t.ink(meta.color) : t.textFaint, fontSize: 11.5, fontWeight: '800', textAlign: 'right', fontVariant: ['tabular-nums'] }}>{chapterNum(c.n)}</Text>
              <Text style={{ flex: 1, color: on ? t.text : t.textSub, fontSize: 12.5, fontWeight: on ? '700' : '500' }} numberOfLines={1}>{c.title}</Text>
              <View style={{ width: 22, height: 3, borderRadius: 2, backgroundColor: t.border, overflow: 'hidden' }}>
                <View style={{ width: `${coverage[i] * 100}%`, height: 3, backgroundColor: meta.color }} />
              </View>
            </Hover>
          </Tip>
        );
      })}
    </View>
  );
}

// ------------------------------------------------------------------ overview (nothing selected)

function Overview() {
  const t = useTheme();
  const books = useMemo(() => getBooks(), []);
  const last = useLastPlace();
  const lastCh = last ? getChapter(last.book, last.part, last.n) : undefined;
  return (
    <ScrollView contentContainerStyle={{ padding: 36 }}>
      <View style={{ maxWidth: 980, width: '100%', alignSelf: 'center' } as any}>
        <Kicker text="Shastra" />
        <Text style={{ color: t.text, fontSize: 30, fontWeight: '800', marginTop: 4 }}>Verse by verse</Text>
        <Text style={{ color: t.textSub, fontSize: 14.5, lineHeight: 22, marginTop: 8, maxWidth: 720 }}>
          Every shloka of the Bhagavad-gita, Srimad-Bhagavatam, Caitanya-caritamrta, The Nectar of Instruction, Brahma-samhita
          and Sri Isopanisad in order — and The Nectar of Devotion chapter by chapter — with the lectures given on it: your
          Maharajas and Prabhujis first, then other Maharajas wherever they have not spoken. Choose a book on the left, or type
          a verse like “SB 1.2.6”, “Bs 5.29” or “NOD 12”.
        </Text>
        {last && lastCh ? (
          <Hover
            onPress={() => goSel({ book: last.book, part: last.part, n: last.n, entry: last.entry })}
            accessibilityLabel="Continue"
            style={({ hovered }) => ({
              flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 24, padding: 16, borderRadius: 14,
              backgroundColor: hovered ? t.surfaceHi : t.surface, borderWidth: 1, borderColor: a(BOOK_META[last.book].color, 0.4),
            } as any)}
          >
            <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: a(BOOK_META[last.book].color, 0.18), alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="bookmark" size={19} color={t.ink(BOOK_META[last.book].color)} />
            </View>
            <View style={{ flex: 1 }}>
              <Kicker text="Continue where you left off" color={BOOK_META[last.book].color} />
              <Text style={{ color: t.text, fontSize: 15, fontWeight: '700', marginTop: 3 }}>
                {last.entry ? verseLabel(last.book, last.part, last.n, last.entry) : chapterLabel(last.book, last.part, last.n)} · {lastCh.title}
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={18} color={t.textDim} />
          </Hover>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 26, flexWrap: 'wrap' }}>
          {books.map((b) => <BookCard key={b.key} book={b} />)}
        </View>
        <Text style={{ color: t.text, fontSize: 17, fontWeight: '800', marginTop: 30 }}>Prayers & Songs</Text>
        <Hover
          onPress={() => router.push('/songs' as any)}
          accessibilityLabel="Prayers & Vaisnava Songs"
          style={({ hovered }) => ({
            flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 12, padding: 20, borderRadius: 18, borderWidth: 1,
            borderColor: a(SONGS_COLOR, hovered ? 0.6 : 0.35), backgroundColor: a(SONGS_COLOR, hovered ? 0.12 : 0.07),
          } as any)}
        >
          <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: a(SONGS_COLOR, 0.2), alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="musical-notes" size={24} color={t.ink(SONGS_COLOR)} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontSize: 16, fontWeight: '800' }}>Prayers & Vaisnava Songs</Text>
            <Text style={{ color: t.textSub, fontSize: 13, marginTop: 4 }}>
              Explanations of Gurvastakam, Siksastakam, Mangalacarana, the songs of Bhaktivinoda and Narottama dasa Thakura, Kunti’s prayers and more
            </Text>
            <Text style={{ color: t.ink(SONGS_COLOR), fontSize: 12.5, fontWeight: '700', marginTop: 8 }}>{SONGS.length} prayers & songs</Text>
          </View>
          <Ionicons name="arrow-forward" size={18} color={t.textDim} />
        </Hover>
      </View>
    </ScrollView>
  );
}

function BookCard({ book }: { book: BookInfo }) {
  const t = useTheme();
  const meta = BOOK_META[book.key];
  const chapters = book.parts.reduce((s, p) => s + p.chapters.length, 0);
  const verses = book.parts.reduce((s, p) => s + p.chapters.reduce((x, c) => x + c.verses.length, 0), 0);
  const first = book.parts[0];
  const single = isSingleChapter(book.key);
  const stats = isProse(book.key)
    ? `${chapters} chapters`
    : single
      ? `${verses.toLocaleString()} verses`
      : `${book.key === 'SB' ? `${book.parts.length} cantos · ` : book.key === 'CC' ? `${book.parts.length} lilas · ` : ''}${chapters} chapters · ${verses.toLocaleString()} verses`;
  return (
    <Hover
      onPress={() => goSel({ book: book.key, part: first.key, n: first.chapters[0].n })}
      accessibilityLabel={book.name}
      style={({ hovered }) => ({
        flexGrow: 1, flexBasis: 260, maxWidth: 460, padding: 22, borderRadius: 18, borderWidth: 1,
        borderColor: a(meta.color, hovered ? 0.6 : 0.35), backgroundColor: a(meta.color, hovered ? 0.12 : 0.07),
        transitionDuration: '120ms',
      } as any)}
    >
      <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: a(meta.color, 0.2), alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={meta.icon as any} size={24} color={t.ink(meta.color)} />
      </View>
      <Text style={{ color: t.text, fontSize: 17, fontWeight: '800', marginTop: 14 }}>{book.name}</Text>
      <Text style={{ color: t.textSub, fontSize: 13, marginTop: 4 }}>{meta.blurb}</Text>
      <Text style={{ color: t.ink(meta.color), fontSize: 12.5, fontWeight: '700', marginTop: 12 }}>{stats}</Text>
    </Hover>
  );
}

// ------------------------------------------------------------------ chapter pane

function ChapterPane({ sel }: { sel: NonNullable<Sel> }) {
  const t = useTheme();
  const { book, part, n } = sel;
  const audio = useAudioMeta();
  const { getLocalUri } = useDownload();
  const { readerFontScale } = useSettings();
  const [speaker] = useVerseSpeaker();
  const meta = BOOK_META[book];
  const chapter = useMemo(() => getChapter(book, part, n)!, [book, part, n]);
  const counts = useMemo(() => verseCounts(book, part, n, chapter.verses), [book, part, n, chapter]);
  const sequence = useMemo(() => sequenceForChapter(book, part, n, chapter.verses, speaker), [book, part, n, chapter, speaker]);
  const covered = counts.filter((c) => c.audio + c.video > 0).length;
  const prev = adjacentChapter(book, part, n, -1);
  const next = adjacentChapter(book, part, n, 1);
  const partName = getPart(book, part)?.name;
  const listRef = useRef<FlatList>(null);
  const fs = (x: number) => Math.round(x * readerFontScale);
  const prose = isProse(book);
  const single = isSingleChapter(book);
  const talks = useMemo(() => chapterTalks(book, part, n, speaker), [book, part, n, speaker]);
  const [showAllTalks, setShowAllTalks] = useState(false);
  useEffect(() => setShowAllTalks(false), [book, part, n]);

  // A prose chapter (Nectar of Devotion) plays its lectures in rank order; a verse chapter, verse by verse.
  const playSequence = (from = 0) => {
    const lectures = prose ? talks.audio.slice(from) : sequence.slice(from).map((s) => s.lecture);
    const items = lectures
      .map((l) => recordingOf(l))
      .filter((r): r is NonNullable<typeof r> => Boolean(r))
      .map((recording) => ({ recording, localUri: getLocalUri(recording.id) }));
    if (!items.length) {
      Alert.alert(
        'No audio lectures',
        prose
          ? 'This chapter has no archive lecture yet — try the videos alongside.'
          : 'No verse of this chapter has an archive lecture yet — try the videos on each verse.',
      );
      return;
    }
    audio.playQueue(items);
  };
  const kicker = prose
    ? n === 0 ? meta.short : `${meta.short} · Chapter ${n}`
    : single
      ? book === 'BS' ? `${meta.short} · Chapter ${n}` : meta.short
      : [partName && book !== 'BG' ? partName : meta.short, `Chapter ${n}`].join(' · ');
  const talkCount = talks.audio.length + talks.video.length;
  const whose = speaker === 'all' ? 'your Maharajas first' : `${honoured(MAHARAJAS[speaker].short)} first`;

  // Bring the selected verse into view when it changes from elsewhere (jump box, prev/next).
  useEffect(() => {
    if (!sel.entry) return;
    const i = counts.findIndex((c) => c.entry === sel.entry);
    if (i >= 0) {
      const tm = setTimeout(() => listRef.current?.scrollToIndex({ index: i, viewPosition: 0.3, animated: true }), 60);
      return () => clearTimeout(tm);
    }
  }, [sel.entry, counts]);

  const header = (
    <View style={{ paddingBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Kicker text={kicker} color={meta.color} />
        <View style={{ flex: 1 }} />
        {!single ? <>
        <IconButton icon="chevron-back" label={prev ? `Previous chapter (${chapterLabel(book, prev.part, prev.n)})` : 'First chapter'} disabled={!prev} onPress={() => prev && goSel({ book, part: prev.part, n: prev.n })} />
        <IconButton icon="chevron-forward" label={next ? `Next chapter (${chapterLabel(book, next.part, next.n)})` : 'Last chapter'} disabled={!next} onPress={() => next && goSel({ book, part: next.part, n: next.n })} />
        </> : null}
      </View>
      <Text style={{ color: t.text, fontSize: 26, fontWeight: '800', marginTop: 4 }}>{chapter.title}</Text>
      <Text style={{ color: t.textDim, fontSize: 13, marginTop: 5 }}>
        {prose
          ? `${talkCount} lecture${talkCount === 1 ? '' : 's'} on this chapter`
          : `${single ? meta.short : chapterLabel(book, part, n)} · ${chapter.verses.length} verses · lectures on ${covered}`}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
        <Button
          variant="primary"
          color={meta.color}
          icon="play"
          label={prose ? 'Play chapter lectures' : single ? 'Play all verses in sequence' : 'Play chapter in sequence'}
          onPress={() => playSequence(0)}
        />
        <Text style={{ flex: 1, minWidth: 220, color: t.textDim, fontSize: 12, lineHeight: 17 }}>
          {prose
            ? `${talks.audio.length} audio lectures — ${whose}, then other Maharajas.`
            : `${sequence.length} lectures, verse by verse — ${whose}, others where they have not spoken.`}
        </Text>
        <Button size="sm" variant="ghost" icon="globe-outline" label="vedabase.io" onPress={() => openExternal(vedabaseUrl(book, part, n))} />
      </View>
      {prose ? (
        <View style={{ marginTop: 22 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 }}>
            <Ionicons name="headset" size={15} color={t.textSub} />
            <Text style={{ flex: 1, color: t.text, fontSize: 15, fontWeight: '800' }}>Lectures</Text>
            <Badge text={String(talks.audio.length)} color={t.textDim} />
          </View>
          {talks.audio.length === 0 ? (
            <Text style={{ color: t.textDim, fontSize: 13 }}>No archive lecture on this chapter yet — the videos alongside may help.</Text>
          ) : (showAllTalks ? talks.audio : talks.audio.slice(0, PROSE_FOLD)).map((l) => <LectureRow key={l.id} lecture={l} />)}
          {talks.audio.length > PROSE_FOLD ? (
            <Button size="sm" variant="ghost" label={showAllTalks ? 'Show fewer' : `Show all ${talks.audio.length}`} onPress={() => setShowAllTalks((v) => !v)} style={{ alignSelf: 'flex-start', marginTop: 4 }} />
          ) : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <FlatList
      ref={listRef}
      data={prose ? [] : counts}
      keyExtractor={(c) => c.entry}
      ListHeaderComponent={header}
      contentContainerStyle={{ padding: 28, paddingBottom: 40 }}
      initialNumToRender={20}
      onScrollToIndexFailed={(info) => {
        listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
        setTimeout(() => listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.3, animated: false }), 120);
      }}
      renderItem={({ item }) => {
        const on = sel.entry === item.entry;
        const text = verseTranslation(book, part, n, item.entry);
        const none = item.audio + item.video === 0;
        const seqIdx = sequence.findIndex((s) => s.entry === item.entry);
        return (
          <Hover
            onPress={() => goSel({ book, part, n, entry: item.entry })}
            accessibilityLabel={verseLabel(book, part, n, item.entry)}
            style={({ hovered }) => ({
              flexDirection: 'row', gap: 16, paddingVertical: 14, paddingHorizontal: 16, marginVertical: 2, borderRadius: 12,
              backgroundColor: on ? a(meta.color, t.dark ? 0.13 : 0.1) : hovered ? t.hover : 'transparent',
              borderWidth: 1, borderColor: on ? a(meta.color, 0.45) : 'transparent',
            } as any)}
          >
            {({ hovered }) => (
              <>
                <View style={{ width: book === 'ISO' ? 72 : 44 }}>
                  <Text style={{ color: t.ink(meta.color), fontSize: item.entry === '0' ? 11 : 13, fontWeight: '800' }}>{entryName(item.entry)}</Text>
                  {seqIdx >= 0 && (hovered || on) ? (
                    <View style={{ marginTop: 6, marginLeft: -6 }}>
                      <IconButton icon="play" label={`Play the chapter from ${verseLabel(book, part, n, item.entry)}`} size={28} iconSize={14} color={t.ink(meta.color)} onPress={() => playSequence(seqIdx)} />
                    </View>
                  ) : null}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  {text ? (
                    <Text style={{ color: on ? t.text : t.textSub, fontSize: fs(14.5), lineHeight: fs(22.5) }} selectable>{text}</Text>
                  ) : (
                    <Text style={{ color: t.textFaint, fontSize: 13 }}>{verseLabel(book, part, n, item.entry)}</Text>
                  )}
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 8, alignItems: 'center' }}>
                    {none ? <Text style={{ color: t.textFaint, fontSize: 11.5 }}>No lecture yet</Text> : null}
                    {item.mine > 0 ? <Count icon="star" n={item.mine} color={meta.color} tip="by your speakers" /> : null}
                    {item.audio > 0 ? <Count icon="headset" n={item.audio} color={t.textSub} tip="audio lectures" /> : null}
                    {item.video > 0 ? <Count icon="logo-youtube" n={item.video} color={t.youtube} tip="videos" /> : null}
                  </View>
                </View>
              </>
            )}
          </Hover>
        );
      }}
    />
  );
}

function Count({ icon, n, color, tip }: { icon: any; n: number; color: string; tip: string }) {
  const t = useTheme();
  return (
    <Tip label={`${n} ${tip}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Ionicons name={icon} size={12} color={t.ink(color)} />
        <Text style={{ color: t.ink(color), fontSize: 11.5, fontWeight: '700' }}>{n}</Text>
      </View>
    </Tip>
  );
}

// ------------------------------------------------------------------ right pane

function ChapterTalksPane({ sel }: { sel: NonNullable<Sel> }) {
  const t = useTheme();
  const [speaker] = useVerseSpeaker();
  const talks = useMemo(() => chapterTalks(sel.book, sel.part, sel.n, speaker), [sel.book, sel.part, sel.n, speaker]);
  return (
    <ScrollView contentContainerStyle={{ padding: 22 }}>
      <Kicker text={isSingleChapter(sel.book) ? 'On the whole book' : 'On the whole chapter'} />
      <Text style={{ color: t.text, fontSize: 17, fontWeight: '800', marginTop: 4 }}>
        {isSingleChapter(sel.book) ? BOOK_META[sel.book].short : chapterLabel(sel.book, sel.part, sel.n)}
      </Text>
      <Text style={{ color: t.textDim, fontSize: 12.5, marginTop: 6, lineHeight: 18 }}>
        Select a verse in the middle to see every lecture on it.
      </Text>
      <View style={{ marginTop: 16 }}>
        {talks.audio.length ? talks.audio.map((l) => <LectureRow key={l.id} lecture={l} />) : (
          <Text style={{ color: t.textDim, fontSize: 13 }}>No talks on the {isSingleChapter(sel.book) ? 'book' : 'chapter'} as a whole.</Text>
        )}
      </View>
      {talks.video.length ? (
        <View style={{ marginTop: 18 }}>
          <Kicker text="Videos" />
          {talks.video.map((v) => <VideoRow key={v.videoId} video={verseVideoResult(v)} />)}
        </View>
      ) : null}
    </ScrollView>
  );
}

/** Right pane for a prose chapter: indexed videos by your speakers, then a live YouTube search. */
function ProseVideosPane({ sel }: { sel: NonNullable<Sel> }) {
  const t = useTheme();
  const [speaker] = useVerseSpeaker();
  const talks = useMemo(() => chapterTalks(sel.book, sel.part, sel.n, speaker), [sel.book, sel.part, sel.n, speaker]);
  const label = chapterLabel(sel.book, sel.part, sel.n);
  const live = useLiveVerseVideos(sel.book, sel.part, sel.n, null, label, talks.video, speaker);
  return (
    <ScrollView contentContainerStyle={{ padding: 22 }}>
      {talks.video.length > 0 ? (
        <View style={{ marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 }}>
            <Ionicons name="logo-youtube" size={14} color={t.youtube} />
            <Text style={{ flex: 1, color: t.text, fontSize: 13.5, fontWeight: '800' }}>Videos by your speakers</Text>
            <Badge text={String(talks.video.length)} color={t.textDim} />
          </View>
          {talks.video.map((v) => <VideoRow key={v.videoId} video={verseVideoResult(v)} />)}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 }}>
        <Ionicons name="search" size={14} color={t.textSub} />
        <Text style={{ flex: 1, color: t.text, fontSize: 13.5, fontWeight: '800' }}>More on YouTube</Text>
      </View>
      {live.loading ? <Spinner /> : live.error ? (
        <Button size="sm" label="Could not reach YouTube — retry" onPress={live.retry} />
      ) : live.videos.length ? live.videos.map((v) => <VideoRow key={v.videoId} video={v} />) : (
        <Text style={{ color: t.textDim, fontSize: 12.5 }}>No further videos name this chapter.</Text>
      )}
    </ScrollView>
  );
}

const TIERS: SpeakerTier[] = [0, 1, 2, 3];
const PROSE_FOLD = 10;
const FOLD = 8;

function VersePane({ sel }: { sel: NonNullable<Sel> & { entry: string } }) {
  const t = useTheme();
  const { book, part, n, entry } = sel;
  const [speaker] = useVerseSpeaker();
  const { readerFontScale } = useSettings();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const meta = BOOK_META[book];
  const label = verseLabel(book, part, n, entry);
  const text = useMemo(() => verseTranslation(book, part, n, entry), [book, part, n, entry]);
  const lectures = useMemo(() => lecturesForVerse(book, part, n, entry, speaker), [book, part, n, entry, speaker]);
  const live = useLiveVerseVideos(book, part, n, entry, label, lectures.video, speaker);
  const prev = adjacentVerse(book, part, n, entry, -1);
  const next = adjacentVerse(book, part, n, entry, 1);
  const total = lectures.audio.length + lectures.video.length;
  const scroll = useRef<ScrollView>(null);
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); setExpanded(new Set()); }, [entry, n, part, book]);

  return (
    <ScrollView ref={scroll} contentContainerStyle={{ padding: 22, paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ flex: 1, color: t.ink(meta.color), fontSize: 20, fontWeight: '800' }}>{label}</Text>
        <IconButton icon="chevron-up" label={prev ? `Previous verse (${verseLabel(book, prev.part, prev.n, prev.entry)})` : 'First verse'} disabled={!prev} onPress={() => prev && goSel({ book, ...prev })} />
        <IconButton icon="chevron-down" label={next ? `Next verse (${verseLabel(book, next.part, next.n, next.entry)})` : 'Last verse'} disabled={!next} onPress={() => next && goSel({ book, ...next })} />
      </View>
      {text ? (
        <View style={{ marginTop: 10, padding: 16, borderRadius: 12, backgroundColor: a(meta.color, t.dark ? 0.08 : 0.06), borderLeftWidth: 3, borderLeftColor: meta.color }}>
          <Text selectable style={{ color: t.text, fontSize: Math.round(15.5 * readerFontScale), lineHeight: Math.round(24 * readerFontScale), fontFamily: 'Georgia, "Cambria", serif' } as any}>{text}</Text>
        </View>
      ) : null}
      <Hover
        onPress={() => openExternal(vedabaseUrl(book, part, n, entry))}
        accessibilityLabel="Open on vedabase.io"
        style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, opacity: hovered ? 1 : 0.8 })}
      >
        <Ionicons name="open-outline" size={13} color={t.textDim} />
        <Text style={{ color: t.textDim, fontSize: 12, textDecorationLine: 'underline' }}>Sanskrit, synonyms and purport on vedabase.io</Text>
      </Hover>

      {total === 0 ? (
        <View style={{ marginTop: 18, padding: 14, borderRadius: 10, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border }}>
          <Text style={{ color: t.text, fontSize: 13.5, fontWeight: '700' }}>No archive lecture on this verse yet</Text>
          <Text style={{ color: t.textDim, fontSize: 12.5, marginTop: 4 }}>Videos found on YouTube are below. Talks on the whole {isSingleChapter(book) ? 'book' : 'chapter'} are listed when no verse is selected — click the {isSingleChapter(book) ? 'book' : 'chapter'} on the left.</Text>
        </View>
      ) : null}

      {TIERS.map((tier) => {
        const list = lectures.audio.filter((l) => l.tier === tier);
        if (!list.length) return null;
        const open = expanded.has(tier);
        return (
          <View key={tier} style={{ marginTop: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 }}>
              <Ionicons name="headset" size={14} color={t.textSub} />
              <Text style={{ flex: 1, color: t.text, fontSize: 13.5, fontWeight: '800' }} numberOfLines={1}>
                {tier === 0 && speaker !== 'all' ? `${honoured(MAHARAJAS[speaker].short)} & your speakers` : TIER_LABEL[tier]}
              </Text>
              <Badge text={String(list.length)} color={t.textDim} />
            </View>
            {(open ? list : list.slice(0, FOLD)).map((l) => <LectureRow key={`${l.id}:${l.from}`} lecture={l} />)}
            {list.length > FOLD ? (
              <Button
                size="sm"
                variant="ghost"
                label={open ? 'Show fewer' : `Show all ${list.length}`}
                onPress={() => setExpanded((prev) => { const s = new Set(prev); if (s.has(tier)) s.delete(tier); else s.add(tier); return s; })}
                style={{ alignSelf: 'flex-start', marginTop: 4 }}
              />
            ) : null}
          </View>
        );
      })}

      {lectures.video.length > 0 ? (
        <View style={{ marginTop: 22 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 }}>
            <Ionicons name="logo-youtube" size={14} color={t.youtube} />
            <Text style={{ flex: 1, color: t.text, fontSize: 13.5, fontWeight: '800' }}>Videos by your speakers</Text>
            <Badge text={String(lectures.video.length)} color={t.textDim} />
          </View>
          {lectures.video.map((v) => <VideoRow key={v.videoId} video={verseVideoResult(v)} />)}
        </View>
      ) : null}

      <View style={{ marginTop: 22 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 }}>
          <Ionicons name="search" size={14} color={t.textSub} />
          <Text style={{ flex: 1, color: t.text, fontSize: 13.5, fontWeight: '800' }}>More on YouTube for {label}</Text>
        </View>
        {live.loading ? <Spinner /> : live.error ? (
          <Button size="sm" label="Could not reach YouTube — retry" onPress={live.retry} />
        ) : live.videos.length ? live.videos.map((v) => <VideoRow key={v.videoId} video={v} />) : (
          <Text style={{ color: t.textDim, fontSize: 12.5 }}>No further videos name this verse.</Text>
        )}
      </View>
    </ScrollView>
  );
}

/** Shards of the one-chapter books, where a chapter talk is on the whole book. */
const SINGLE_CHAPTER_SHARDS = new Set(['noi', 'iso', 'bs']);

/** Same rules as components/VerseLectureRow.tsx. */
function rangeLabel(l: VerseAudio): string | null {
  if (l.from == null) {
    if (l.shard === 'nod' || l.shard === 'song') return null;
    return SINGLE_CHAPTER_SHARDS.has(l.shard) ? 'Whole book' : 'Whole chapter';
  }
  const from = l.from === 0 ? 'Invocation' : String(l.from);
  if (l.to != null && l.to !== l.from) return `Verses ${from}–${l.to}`;
  return l.from === 0 ? 'Invocation' : null;
}

export function LectureRow({ lecture }: { lecture: VerseAudio }) {
  const t = useTheme();
  const audio = useAudioMeta();
  const { isDownloaded } = useDownload();
  const { historyMap } = useHistory();
  const { togglePlay, menuFor } = useRecordingActions();
  const { open } = useMenu();
  const m = maharajOf(lecture.speakerKey);
  const accent = m?.accent ?? GUEST_ACCENT;
  const isCur = audio.recording?.id === lecture.id;
  const playing = isCur && audio.isPlaying;
  const h = historyMap.get(lecture.id);
  const frac = h && h.durationMs > 0 ? h.positionMs / h.durationMs : 0;
  const range = rangeLabel(lecture);
  const date = lecture.date ? (/^\d{4}-\d{2}-\d{2}$/.test(lecture.date) ? formatRecordingDate(lecture.date) : lecture.date) : null;
  return (
    <Hover
      onPress={() => { const r = recordingOf(lecture); if (r) router.push(`/lecture/${r.id}` as any); }}
      onContextMenu={(e) => { const r = recordingOf(lecture); if (r) open(e.clientX, e.clientY, menuFor(r)); }}
      accessibilityLabel={lecture.title}
      style={({ hovered }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 8, marginHorizontal: -8, borderRadius: 9,
        backgroundColor: isCur ? a(accent, 0.12) : hovered ? t.hover : 'transparent',
      } as any)}
    >
      <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: accent }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ color: t.ink(accent), fontSize: 11.5, fontWeight: '800' }} numberOfLines={1}>{lecture.speakerName}</Text>
          {isDownloaded(lecture.id) ? <Ionicons name="cloud-done" size={12} color={t.success} /> : null}
          {frac > 0.95 ? <Ionicons name="checkmark-done" size={13} color={t.success} /> : null}
        </View>
        <Text style={{ color: t.text, fontSize: 12.5, fontWeight: '600', marginTop: 2, lineHeight: 17 }} numberOfLines={2}>{lecture.title}</Text>
        {date || range ? <Text style={{ color: t.textDim, fontSize: 11, marginTop: 2 }}>{[date, range].filter(Boolean).join(' · ')}</Text> : null}
        {frac > 0.02 && frac <= 0.95 ? <View style={{ marginTop: 5, width: 120 }}><ProgressBar frac={frac} color={accent} height={3} /></View> : null}
      </View>
      {playing ? <Equalizer color={accent} playing /> : null}
      <IconButton
        icon={playing ? 'pause' : 'play'}
        label={playing ? 'Pause' : 'Play'}
        size={32}
        iconSize={15}
        color={t.ink(accent)}
        onPress={() => { const r = recordingOf(lecture); if (r) togglePlay(r); }}
      />
    </Hover>
  );
}

export function VideoRow({ video }: { video: VideoResult }) {
  const t = useTheme();
  return (
    <Hover
      onPress={() => router.push(videoHref(video) as any)}
      accessibilityLabel={video.title}
      style={({ hovered }) => ({ flexDirection: 'row', gap: 10, padding: 6, marginHorizontal: -6, borderRadius: 9, backgroundColor: hovered ? t.hover : 'transparent' })}
    >
      <View style={{ width: 128, height: 72, borderRadius: 7, overflow: 'hidden', backgroundColor: t.surfaceHi }}>
        {video.thumbnail ? <Image source={{ uri: video.thumbnail }} style={{ width: '100%', height: '100%' } as any} /> : null}
        {video.durationSec != null ? (
          <View style={{ position: 'absolute', right: 4, bottom: 4, backgroundColor: '#000000cc', borderRadius: 4, paddingHorizontal: 4 }}>
            <Text style={{ color: '#fff', fontSize: 10.5, fontWeight: '700' }}>{formatDuration(video.durationSec)}</Text>
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: t.text, fontSize: 12.5, fontWeight: '600', lineHeight: 17 }} numberOfLines={3}>{video.title}</Text>
        <Text style={{ color: t.textDim, fontSize: 11, marginTop: 3 }} numberOfLines={1}>{video.channel}</Text>
      </View>
    </Hover>
  );
}

export { selHref };
