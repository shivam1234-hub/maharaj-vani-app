import React, { useMemo } from 'react';
import {
  Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaharajSwitch from '../../components/MaharajSwitch';
import MaharajAvatar from '../../components/MaharajAvatar';
import RecentVideosRow from '../../components/RecentVideosRow';
import { useMaharaj } from '../../contexts/MaharajContext';
import { useAudio } from '../../contexts/AudioContext';
import { useDownload } from '../../contexts/DownloadContext';
import { useHistory } from '../../contexts/HistoryContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { getCatalog, getRecordingById } from '../../hooks/useLectures';
import { formatBytes, formatRecordingDate, getCategoryMeta } from '../../data/types';
import { C, R, alpha } from '../../constants/theme';
import { respectful } from '../../data/maharajas';

export default function HomeScreen() {
  const { maharaj, active } = useMaharaj();
  const audio = useAudio();
  const { totalCount, totalBytes, getLocalUri } = useDownload();
  const { history } = useHistory();
  const { favourites } = useLibrary();
  const insets = useSafeAreaInsets();

  const all = useMemo(() => getCatalog(active), [active]);

  const stats = useMemo(() => {
    const bytes = all.reduce((s, r) => s + r.sizeBytes, 0);
    // A loop, not Math.min(...years): spreading thousands of arguments is
    // fragile on Hermes.
    let from: number | null = null;
    let to: number | null = null;
    for (const r of all) {
      if (!r.year) continue;
      if (from == null || r.year < from) from = r.year;
      if (to == null || r.year > to) to = r.year;
    }
    return { count: all.length, bytes, from, to };
  }, [all]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of all) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
    return [...counts.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count);
  }, [all]);

  // Most recent unfinished lecture belonging to the Maharaja on screen.
  const resume = useMemo(() => {
    for (const h of history) {
      if (h.durationMs > 0 && h.positionMs / h.durationMs > 0.95) continue;
      const rec = getRecordingById(h.id);
      if (rec && rec.maharaj === active) return { rec, entry: h };
    }
    return null;
  }, [history, active]);

  const recent = useMemo(() => all.filter((r) => r.date).slice(0, 6), [all]);

  const favCount = useMemo(
    () => [...favourites].filter((id) => getRecordingById(id)?.maharaj === active).length,
    [favourites, active],
  );

  const accent = maharaj.accent;
  const resumeFrac = resume
    ? Math.min(resume.entry.positionMs / Math.max(resume.entry.durationMs, 1), 1)
    : 0;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: 150 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ---------------- header ---------------- */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>Hare Krishna</Text>
          <Text style={styles.appTitle}>Vaishnava Vani</Text>
        </View>
        <Pressable
          onPress={() => router.push('/global-search')}
          style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}
          accessibilityLabel="Search everything"
        >
          <Ionicons name="search" size={20} color={C.text} />
        </Pressable>
      </View>

      <MaharajSwitch />

      {/* ---------------- hero ---------------- */}
      <View
        style={[
          styles.hero,
          { backgroundColor: accent + alpha(0.1), borderColor: accent + alpha(0.35) },
        ]}
      >
        {/* Soft accent glow in the corner, in place of a gradient. */}
        <View style={[styles.glow, { backgroundColor: accent + alpha(0.16) }]} />

        <View style={styles.heroTop}>
          <MaharajAvatar maharaj={maharaj} size={58} />
          <View style={{ flex: 1 }}>
            <Text style={styles.heroHH}>{maharaj.honorific}</Text>
            <Text style={styles.heroName}>{respectful(maharaj.short)}</Text>
          </View>
        </View>

        <View style={styles.statRow}>
          <Stat value={stats.count.toLocaleString()} label="recordings" accent={accent} />
          {stats.from && stats.to ? (
            <Stat value={`${stats.from}–${String(stats.to).slice(-2)}`} label="years" accent={accent} />
          ) : null}
          <Stat value={formatBytes(stats.bytes)} label="of audio" accent={accent} />
        </View>

        <View style={styles.heroBtns}>
          <Pressable
            onPress={() => recent[0] && audio.play(recent[0], getLocalUri(recent[0].id))}
            style={({ pressed }) => [styles.primaryBtn, { backgroundColor: accent }, pressed && styles.pressed]}
          >
            <Ionicons name="play" size={16} color="#fff" />
            <Text style={styles.primaryBtnText}>Play latest</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/browse')}
            style={({ pressed }) => [
              styles.secondaryBtn,
              { borderColor: accent + alpha(0.6) },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="library-outline" size={16} color={accent} />
            <Text style={[styles.secondaryBtnText, { color: accent }]}>All lectures</Text>
          </Pressable>
        </View>
      </View>

      {/* ---------------- continue listening ---------------- */}
      {resume && (
        <Pressable
          onPress={() => router.push(`/lecture/${resume.rec.id}`)}
          style={({ pressed }) => [styles.resumeCard, pressed && styles.pressed]}
        >
          <Pressable
            onPress={() =>
              audio.play(resume.rec, getLocalUri(resume.rec.id), resume.entry.positionMs)
            }
            style={[styles.resumePlay, { backgroundColor: accent }]}
            hitSlop={6}
          >
            <Ionicons name="play" size={20} color="#fff" style={{ marginLeft: 2 }} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.resumeLabel, { color: accent }]}>CONTINUE LISTENING</Text>
            <Text style={styles.resumeTitle} numberOfLines={2}>{resume.rec.title}</Text>
            <View style={styles.resumeTrack}>
              <View
                style={[styles.resumeFill, { width: `${resumeFrac * 100}%`, backgroundColor: accent }]}
              />
            </View>
          </View>
          <Text style={styles.resumePct}>{Math.round(resumeFrac * 100)}%</Text>
        </Pressable>
      )}

      {/* ---------------- latest videos ---------------- */}
      <RecentVideosRow maharaj={maharaj} />

      {/* ---------------- quick actions ---------------- */}
      <View style={styles.quickRow}>
        <QuickAction
          icon="search"
          label="Search"
          color={accent}
          onPress={() => router.push('/browse')}
        />
        <QuickAction
          icon="logo-youtube"
          label="Videos"
          color={C.youtube}
          onPress={() => router.push('/youtube')}
        />
        <QuickAction
          icon="cloud-done"
          label={totalCount ? `${totalCount} saved` : 'Downloads'}
          sub={totalCount ? formatBytes(totalBytes) : undefined}
          color={C.success}
          onPress={() => router.push('/downloads')}
        />
        <QuickAction
          icon="heart"
          label="Favourites"
          sub={favCount ? String(favCount) : undefined}
          color={C.danger}
          onPress={() => router.push('/browse?favourites=1')}
        />
      </View>

      {/* Spans every Maharaja and both sources, unlike the Search tab which
          stays scoped to whoever is selected. */}
      <Pressable
        onPress={() => router.push('/global-search')}
        style={({ pressed }) => [styles.globalBtn, pressed && styles.pressed]}
      >
        <View style={styles.globalIcon}>
          <Ionicons name="planet-outline" size={19} color={C.textSub} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.globalTitle}>Search everything</Text>
          <Text style={styles.globalSub}>All speakers · archive audio + YouTube</Text>
        </View>
        <Ionicons name="arrow-forward" size={18} color={C.textFaint} />
      </Pressable>

      {/* Verse-by-verse lectures across every speaker. */}
      <Pressable
        onPress={() => router.push('/verses')}
        style={({ pressed }) => [styles.globalBtn, pressed && styles.pressed]}
      >
        <View style={[styles.globalIcon, { backgroundColor: '#FF7722' + alpha(0.16) }]}>
          <Ionicons name="book" size={19} color="#FF7722" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.globalTitle}>Verse by verse</Text>
          <Text style={styles.globalSub}>Bhagavad-gita · Bhagavatam · Caitanya-caritamrta, in sequence</Text>
        </View>
        <Ionicons name="arrow-forward" size={18} color={C.textFaint} />
      </Pressable>

      {/* ---------------- categories ---------------- */}
      <Text style={styles.sectionTitle}>Browse by category</Text>
      <View style={styles.grid}>
        {categories.map((c) => {
          const meta = getCategoryMeta(c.key);
          return (
            <Pressable
              key={c.key}
              onPress={() => router.push(`/category/${encodeURIComponent(c.key)}`)}
              style={({ pressed }) => [styles.catCard, pressed && styles.pressed]}
            >
              <View style={[styles.catIcon, { backgroundColor: meta.color + alpha(0.16) }]}>
                <Ionicons name={meta.icon as any} size={19} color={meta.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.catLabel} numberOfLines={2}>{meta.label}</Text>
                <Text style={styles.catCount}>{c.count.toLocaleString()}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* ---------------- latest recordings ---------------- */}
      {recent.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Latest recordings</Text>
          <View style={styles.listCard}>
            {recent.map((r, i) => {
              const meta = getCategoryMeta(r.category);
              const playing = audio.recording?.id === r.id && audio.isPlaying;
              return (
                <Pressable
                  key={r.id}
                  onPress={() => router.push(`/lecture/${r.id}`)}
                  style={({ pressed }) => [
                    styles.recentRow,
                    i > 0 && styles.recentDivider,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={[styles.recentIcon, { backgroundColor: meta.color + alpha(0.16) }]}>
                    <Ionicons name={meta.icon as any} size={16} color={meta.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.recentTitle} numberOfLines={1}>{r.title}</Text>
                    <Text style={styles.recentMeta} numberOfLines={1}>
                      {[formatRecordingDate(r.date), r.location].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() =>
                      playing ? audio.pause() : audio.play(r, getLocalUri(r.id))
                    }
                    hitSlop={8}
                    style={[styles.recentPlay, { borderColor: accent + alpha(0.5) }]}
                  >
                    <Ionicons name={playing ? 'pause' : 'play'} size={14} color={accent} />
                  </Pressable>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      <Text style={styles.footer}>Audio courtesy of audio.iskcondesiretree.com</Text>
    </ScrollView>
  );
}

function Stat({ value, label, accent }: { value: string; label: string; accent: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: accent }]} numberOfLines={1}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function QuickAction({
  icon, label, sub, color, onPress,
}: {
  icon: string; label: string; sub?: string; color: string; onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.quick, pressed && styles.pressed]}>
      <View style={[styles.quickIcon, { backgroundColor: color + alpha(0.15) }]}>
        <Ionicons name={icon as any} size={21} color={color} />
      </View>
      <Text style={styles.quickLabel} numberOfLines={1}>{label}</Text>
      {sub ? <Text style={styles.quickSub} numberOfLines={1}>{sub}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  pressed: { opacity: 0.75 },

  header: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 8 },
  greeting: { color: C.textDim, fontSize: 13, fontWeight: '600', letterSpacing: 0.3 },
  appTitle: { color: C.text, fontSize: 27, fontWeight: '800', marginTop: 1 },
  headerBtn: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
  },

  hero: {
    marginHorizontal: 16, marginTop: 14, padding: 18,
    borderRadius: R.xl, borderWidth: 1, overflow: 'hidden',
  },
  glow: { position: 'absolute', width: 220, height: 220, borderRadius: 110, top: -110, right: -70 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroHH: { color: C.textSub, fontSize: 12, fontWeight: '600', letterSpacing: 0.4 },
  heroName: { color: C.text, fontSize: 21, fontWeight: '800', lineHeight: 26, marginTop: 1 },
  statRow: {
    flexDirection: 'row', marginTop: 18, paddingVertical: 12,
    borderRadius: R.md, backgroundColor: '#00000033',
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 16, fontWeight: '800' },
  statLabel: { color: C.textDim, fontSize: 11, marginTop: 2, fontWeight: '600' },
  heroBtns: { flexDirection: 'row', gap: 10, marginTop: 16 },
  primaryBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 12, borderRadius: R.pill,
  },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  secondaryBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 12, borderRadius: R.pill, borderWidth: 1.5,
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '800' },

  resumeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginHorizontal: 16, marginTop: 14, padding: 14,
    backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.border,
  },
  resumePlay: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  resumeLabel: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8 },
  resumeTitle: { color: C.text, fontSize: 14, fontWeight: '700', marginTop: 3, lineHeight: 18 },
  resumeTrack: {
    height: 4, backgroundColor: C.surfaceHi, borderRadius: 2, marginTop: 9, overflow: 'hidden',
  },
  resumeFill: { height: 4, borderRadius: 2 },
  resumePct: { color: C.textDim, fontSize: 12, fontWeight: '700' },

  quickRow: { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 24 },
  quick: {
    flex: 1, alignItems: 'center', paddingVertical: 14, gap: 7,
    backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.border,
  },
  quickIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { color: C.textSub, fontSize: 11.5, fontWeight: '700' },
  quickSub: { color: C.textFaint, fontSize: 10.5, fontWeight: '700', marginTop: -4 },

  globalBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginTop: 12, padding: 14,
    backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.border,
  },
  globalIcon: {
    width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.surfaceHi,
  },
  globalTitle: { color: C.text, fontSize: 14.5, fontWeight: '700' },
  globalSub: { color: C.textDim, fontSize: 11.5, marginTop: 2 },

  sectionTitle: {
    color: C.text, fontSize: 17, fontWeight: '800',
    marginHorizontal: 16, marginTop: 28, marginBottom: 12,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginHorizontal: 16 },
  catCard: {
    width: '48.5%', flexDirection: 'row', alignItems: 'center', gap: 11,
    backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.border,
    padding: 12,
  },
  catIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  catLabel: { color: C.text, fontSize: 13, fontWeight: '700', lineHeight: 16 },
  catCount: { color: C.textDim, fontSize: 11.5, fontWeight: '600', marginTop: 2 },

  listCard: {
    marginHorizontal: 16, backgroundColor: C.surface, borderRadius: R.lg,
    borderWidth: 1, borderColor: C.border, overflow: 'hidden',
  },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  recentDivider: { borderTopWidth: 1, borderTopColor: C.border },
  recentIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  recentTitle: { color: C.text, fontSize: 13.5, fontWeight: '600' },
  recentMeta: { color: C.textDim, fontSize: 11.5, marginTop: 3 },
  recentPlay: {
    width: 32, height: 32, borderRadius: 16, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },

  footer: { color: C.textFaint, fontSize: 11, textAlign: 'center', marginTop: 30 },
});
