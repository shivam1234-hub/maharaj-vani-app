import React, { useMemo } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import MaharajAvatar from '../../components/MaharajAvatar';
import Page from '../../components/desktop/Page';
import { a, useTheme } from '../../components/desktop/theme';
import { Button, Hover, ProgressBar, SectionHeader, Kicker, Spinner } from '../../components/desktop/kit';
import { RecordingList, VideoGrid, useGridColumns, useRecordingActions } from '../../components/desktop/recordings';
import { useMaharaj } from '../../contexts/MaharajContext';
import { useAudioMeta } from '../../contexts/AudioContext.web';
import { useDownload } from '../../contexts/DownloadContext';
import { useHistory } from '../../contexts/HistoryContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { useRecentVideos } from '../../hooks/useRecentVideos';
import { getCatalog, getRecordingById } from '../../hooks/useLectures';
import { formatBytes, formatRecordingDate, getCategoryMeta } from '../../data/types';
import { respectful } from '../../data/maharajas';
import { formatMs } from '../../utils/time';

/** Desktop Home: speaker hero, continue listening, latest YouTube, categories, latest recordings. */
export default function HomeScreen() {
  const t = useTheme();
  const { maharaj, active } = useMaharaj();
  const audio = useAudioMeta();
  const { totalCount, totalBytes, getLocalUri } = useDownload();
  const { history } = useHistory();
  const { favourites } = useLibrary();
  const { togglePlay } = useRecordingActions();
  const accent = maharaj.accent;
  const wide = useWindowDimensions().width >= 1280;

  const all = useMemo(() => getCatalog(active), [active]);
  const stats = useMemo(() => {
    const bytes = all.reduce((s, r) => s + r.sizeBytes, 0);
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
    return [...counts.entries()].map(([key, count]) => ({ key, count })).sort((x, y) => y.count - x.count);
  }, [all]);

  // Unfinished lectures by the speaker on screen, most recent first.
  const resume = useMemo(() => {
    const out: Array<{ rec: NonNullable<ReturnType<typeof getRecordingById>>; positionMs: number; durationMs: number }> = [];
    for (const h of history) {
      if (h.videoId || h.positionMs < 5000) continue;
      if (h.durationMs > 0 && h.positionMs / h.durationMs > 0.95) continue;
      const rec = getRecordingById(h.id);
      if (rec && rec.maharaj === active) out.push({ rec, positionMs: h.positionMs, durationMs: h.durationMs });
      if (out.length >= 4) break;
    }
    return out;
  }, [history, active]);

  const recent = useMemo(() => all.filter((r) => r.date).slice(0, 8), [all]);
  const favCount = useMemo(
    () => [...favourites].filter((id) => getRecordingById(id)?.maharaj === active).length,
    [favourites, active],
  );

  const grid = useGridColumns(250);
  const { videos, loading, error, retry } = useRecentVideos(maharaj, 12);

  return (
    <Page>
      {/* ---------------- hero ---------------- */}
      <View
        style={{
          borderRadius: 22, borderWidth: 1, borderColor: a(accent, 0.35), overflow: 'hidden',
          backgroundImage: `linear-gradient(120deg, ${a(accent, t.dark ? 0.28 : 0.2)} 0%, ${a(accent, t.dark ? 0.08 : 0.06)} 55%, ${a(accent, 0.02)} 100%)`,
          backgroundColor: t.surface,
          padding: 30,
          flexDirection: 'row', gap: 32, alignItems: 'center',
        } as any}
      >
        <View style={{ position: 'absolute', width: 420, height: 420, borderRadius: 210, right: -120, top: -180, backgroundColor: a(accent, 0.1) }} />
        <MaharajAvatar maharaj={maharaj} size={wide ? 116 : 84} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Kicker text={maharaj.honorific} color={accent} />
          <Text style={{ color: t.text, fontSize: 34, fontWeight: '800', marginTop: 4, letterSpacing: -0.3 }} numberOfLines={2}>
            {respectful(maharaj.short)}
          </Text>
          <View style={{ flexDirection: 'row', gap: 28, marginTop: 16, flexWrap: 'wrap' }}>
            <Stat value={stats.count.toLocaleString()} label="recordings" />
            {stats.from && stats.to ? <Stat value={`${stats.from}–${stats.to}`} label="years" /> : null}
            <Stat value={formatBytes(stats.bytes)} label="of audio" />
            <Stat value={String(categories.length)} label="categories" />
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
            <Button
              variant="primary"
              icon="play"
              label="Play latest"
              size="md"
              color={accent}
              onPress={() => recent[0] && audio.play(recent[0], getLocalUri(recent[0].id))}
            />
            <Button icon="library-outline" label="All lectures" onPress={() => router.navigate('/browse')} />
            <Button icon="book-outline" label="Verse by verse" onPress={() => router.navigate('/verses')} />
            <Button icon="logo-youtube" label="On YouTube" onPress={() => router.navigate('/youtube')} />
          </View>
        </View>
        <View style={{ width: 230, gap: 10, display: wide ? 'flex' : 'none' }}>
          <QuickTile icon="cloud-done" color={t.success} label={totalCount ? `${totalCount} downloaded` : 'Downloads'} sub={totalCount ? formatBytes(totalBytes) : 'Save lectures for offline'} onPress={() => router.navigate('/downloads')} />
          <QuickTile icon="heart" color={t.danger} label="Favourites" sub={favCount ? `${favCount} of ${respectful(maharaj.short)}` : 'None yet'} onPress={() => router.navigate('/browse?favourites=1' as any)} />
          <QuickTile icon="planet-outline" color={t.textSub} label="Search everything" sub="All speakers · audio + YouTube" onPress={() => router.push('/global-search')} />
        </View>
      </View>

      {/* ---------------- continue listening ---------------- */}
      {resume.length > 0 && (
        <View style={{ marginTop: 36 }}>
          <SectionHeader title="Continue listening" icon="play-circle-outline" right={<Button size="sm" variant="ghost" label="History" iconRight="chevron-forward" onPress={() => router.navigate('/history')} />} />
          <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
            {resume.map(({ rec, positionMs, durationMs }) => {
              const frac = durationMs > 0 ? positionMs / durationMs : 0;
              const meta = getCategoryMeta(rec.category);
              const playing = audio.recording?.id === rec.id && audio.isPlaying;
              return (
                <Hover
                  key={rec.id}
                  onPress={() => router.push(`/lecture/${rec.id}` as any)}
                  accessibilityLabel={rec.title}
                  style={({ hovered }) => ({
                    flexGrow: 1, flexBasis: 300, maxWidth: 480, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14,
                    borderRadius: 14, borderWidth: 1, borderColor: hovered ? t.borderHi : t.border,
                    backgroundColor: hovered ? t.surfaceHi : t.surface, transitionDuration: '120ms',
                  } as any)}
                >
                  <Hover
                    onPress={() => togglePlay(rec)}
                    accessibilityLabel={playing ? 'Pause' : 'Resume'}
                    style={({ hovered }) => ({
                      width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: accent, transform: [{ scale: hovered ? 1.06 : 1 }],
                    } as any)}
                  >
                    <Ionicons name={playing ? 'pause' : 'play'} size={20} color="#fff" style={playing ? undefined : { marginLeft: 2 }} />
                  </Hover>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: t.text, fontSize: 13.5, fontWeight: '700' }} numberOfLines={2}>{rec.title}</Text>
                    <Text style={{ color: t.textDim, fontSize: 11.5, marginTop: 4 }} numberOfLines={1}>
                      {durationMs > 0 ? `${formatMs(positionMs)} of ${formatMs(durationMs)}` : `Stopped at ${formatMs(positionMs)}`} · {meta.label}
                    </Text>
                    <View style={{ marginTop: 8 }}><ProgressBar frac={frac} color={accent} /></View>
                  </View>
                </Hover>
              );
            })}
          </View>
        </View>
      )}

      {/* ---------------- latest videos ---------------- */}
      <View style={{ marginTop: 36 }} onLayout={grid.onLayout}>
        <SectionHeader
          title="Latest on YouTube"
          subtitle={`Newest uploads by or about ${respectful(maharaj.short)}`}
          icon="logo-youtube"
          right={<Button size="sm" variant="ghost" label="See all" iconRight="chevron-forward" onPress={() => router.navigate('/youtube')} />}
        />
        {videos.length > 0 ? (
          <VideoGrid videos={videos} max={grid.cols * 2} />
        ) : loading ? (
          <Spinner label="Fetching the latest uploads…" />
        ) : error ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 12, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border }}>
            <Ionicons name="cloud-offline-outline" size={20} color={t.textDim} />
            <Text style={{ flex: 1, color: t.textSub, fontSize: 13 }}>Could not reach YouTube.</Text>
            <Button size="sm" label="Try again" onPress={retry} />
          </View>
        ) : (
          <Text style={{ color: t.textDim, fontSize: 13 }}>No recent uploads found.</Text>
        )}
      </View>

      {/* ---------------- categories ---------------- */}
      <View style={{ marginTop: 40 }}>
        <SectionHeader title="Browse by category" subtitle="Folders on the archive, grouped" icon="albums-outline" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {categories.map((c) => {
            const meta = getCategoryMeta(c.key);
            return (
              <Hover
                key={c.key}
                onPress={() => router.push(`/category/${encodeURIComponent(c.key)}` as any)}
                accessibilityLabel={meta.label}
                style={({ hovered }) => ({
                  flexGrow: 1, flexBasis: 210, maxWidth: 360, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
                  borderRadius: 14, borderWidth: 1, borderColor: hovered ? a(meta.color, 0.6) : t.border,
                  backgroundColor: hovered ? a(meta.color, 0.08) : t.surface, transitionDuration: '120ms',
                } as any)}
              >
                <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: a(meta.color, 0.16), alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={meta.icon as any} size={20} color={t.ink(meta.color)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontSize: 13.5, fontWeight: '700' }} numberOfLines={1}>{meta.label}</Text>
                  <Text style={{ color: t.textDim, fontSize: 12, marginTop: 2 }}>{c.count.toLocaleString()} recordings</Text>
                </View>
              </Hover>
            );
          })}
        </View>
      </View>

      {/* ---------------- latest recordings ---------------- */}
      {recent.length > 0 && (
        <View style={{ marginTop: 40 }}>
          <SectionHeader
            title="Latest recordings"
            subtitle={recent[0].date ? `Most recent: ${formatRecordingDate(recent[0].date)}` : undefined}
            icon="mic-outline"
            right={<Button size="sm" variant="ghost" label="Browse all" iconRight="chevron-forward" onPress={() => router.navigate('/browse')} />}
          />
          <View style={{ backgroundColor: t.surface, borderRadius: 14, borderWidth: 1, borderColor: t.border, padding: 6 }}>
            <RecordingList rows={recent} />
          </View>
        </View>
      )}

      <Text style={{ color: t.textFaint, fontSize: 11.5, textAlign: 'center', marginTop: 36 }}>
        Audio courtesy of audio.iskcondesiretree.com
      </Text>
    </Page>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  const t = useTheme();
  return (
    <View>
      <Text style={{ color: t.accentText, fontSize: 20, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: t.textDim, fontSize: 12, fontWeight: '600', marginTop: 1 }}>{label}</Text>
    </View>
  );
}

function QuickTile({
  icon, color, label, sub, onPress,
}: { icon: any; color: string; label: string; sub: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Hover
      onPress={onPress}
      accessibilityLabel={label}
      style={({ hovered }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 11, padding: 11, borderRadius: 12,
        backgroundColor: hovered ? t.surfaceHi : a(t.surface, 0.75), borderWidth: 1, borderColor: t.border,
        transitionDuration: '120ms',
      } as any)}
    >
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: a(color, 0.15), alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: t.text, fontSize: 13, fontWeight: '700' }} numberOfLines={1}>{label}</Text>
        <Text style={{ color: t.textDim, fontSize: 11.5, marginTop: 1 }} numberOfLines={1}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={15} color={t.textFaint} />
    </Hover>
  );
}
