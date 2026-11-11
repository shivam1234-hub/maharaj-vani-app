/**
 * Desktop Prayers & Songs (web only): the grouped, searchable catalogue on
 * the left; the selected prayer's text, lectures by tier, "play all" and a
 * live YouTube search for explanation videos on the right. Port of
 * app/songs/index.tsx + app/songs/[id].tsx.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { a, useTheme } from './theme';
import { Badge, Button, Empty, Hover, Kicker, SearchField, Select, Spinner } from './kit';
import { VideoGrid } from './recordings';
import { LectureRow } from './VersesDesktop';
import { useAudioMeta } from '../../contexts/AudioContext.web';
import { useDownload } from '../../contexts/DownloadContext';
import { MAHARAJAS, MAHARAJ_ORDER, honoured } from '../../data/maharajas';
import { getSong, getSongGroups, songCounts, songLectures, songsInGroup } from '../../data/songIndex';
import { TIER_LABEL, type SpeakerTier } from '../../data/verseIndex';
import type { VideoResult } from '../../data/types';
import { recordingOf, sortLectures, useVerseSpeaker, type VerseSpeaker } from '../../hooks/useVerses';
import { search } from '../../utils/youtube';
import { isPerformance, matchSongs, normalize, SONGS } from '../../utils/songs';
import { SONGS_COLOR } from '../../utils/shastraNav';

const TIERS: SpeakerTier[] = [0, 1, 2, 3];
const FOLD = 8;

export default function SongsDesktop({ initialId }: { initialId?: string }) {
  const t = useTheme();
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(initialId && getSong(initialId) ? initialId : null);
  useEffect(() => {
    if (initialId && getSong(initialId)) setSelected(initialId);
  }, [initialId]);

  const groups = useMemo(
    () => getSongGroups().map((g) => ({
      ...g,
      songs: songsInGroup(g.key).map((s) => ({ ...s, counts: songCounts(s.id) })),
    })),
    [],
  );
  const needle = normalize(q).trim();
  const shown = groups
    .map((g) => ({
      ...g,
      songs: needle ? g.songs.filter((s) => normalize(`${s.name} ${s.author} ${s.line}`).includes(needle)) : g.songs,
    }))
    .filter((g) => g.songs.length);
  const total = useMemo(() => groups.reduce((n, g) => n + g.songs.reduce((x, s) => x + s.counts.all, 0), 0), [groups]);

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: t.bg }}>
      {/* ---------------- list ---------------- */}
      <View style={{ width: 380, borderRightWidth: 1, borderRightColor: t.border, backgroundColor: t.surfaceLo }}>
        <View style={{ padding: 18, paddingBottom: 12, gap: 12, borderBottomWidth: 1, borderBottomColor: t.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: a(SONGS_COLOR, 0.18), alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="musical-notes" size={20} color={t.ink(SONGS_COLOR)} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontSize: 18, fontWeight: '800' }}>Prayers & Songs</Text>
              <Text style={{ color: t.textDim, fontSize: 12, marginTop: 1 }}>{SONGS.length} prayers & songs · {total.toLocaleString()} lectures</Text>
            </View>
          </View>
          <SearchField value={q} onChange={setQ} placeholder="Find a prayer or song — Gurvastakam, Jiv Jago…" />
        </View>
        <ScrollView contentContainerStyle={{ padding: 10, paddingBottom: 24 }}>
          {shown.map((g) => (
            <View key={g.key} style={{ marginBottom: 10 }}>
              <Text style={{ color: t.textFaint, fontSize: 10.5, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginTop: 10, marginHorizontal: 10 }}>{g.name}</Text>
              <Text style={{ color: t.textDim, fontSize: 11.5, marginHorizontal: 10, marginTop: 3, marginBottom: 6, lineHeight: 16 }} numberOfLines={2}>{g.blurb}</Text>
              {g.songs.map((s) => {
                const on = selected === s.id;
                return (
                  <Hover
                    key={s.id}
                    onPress={() => setSelected(s.id)}
                    accessibilityLabel={s.name}
                    style={({ hovered }) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 9,
                      backgroundColor: on ? a(SONGS_COLOR, 0.16) : hovered ? t.hover : 'transparent',
                    } as any)}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: on ? t.text : t.textSub, fontSize: 13.5, fontWeight: on ? '800' : '600' }} numberOfLines={1}>{s.name}</Text>
                      <Text style={{ color: t.textDim, fontSize: 11.5, marginTop: 2 }} numberOfLines={1}>{s.author}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ color: s.counts.all ? t.textSub : t.textFaint, fontSize: 11.5, fontWeight: '700' }}>
                        {s.counts.all ? `${s.counts.all}` : 'YouTube'}
                      </Text>
                      {s.counts.mine ? <Text style={{ color: t.ink(SONGS_COLOR), fontSize: 10.5, fontWeight: '700' }}>★ {s.counts.mine}</Text> : null}
                    </View>
                  </Hover>
                );
              })}
            </View>
          ))}
          {!shown.length ? <Text style={{ color: t.textDim, fontSize: 13, margin: 12 }}>Nothing matches “{q}”.</Text> : null}
        </ScrollView>
      </View>

      {/* ---------------- detail ---------------- */}
      <View style={{ flex: 1, minWidth: 0 }}>
        {selected ? <SongDetail id={selected} /> : (
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Empty
              icon="musical-notes-outline"
              title="Choose a prayer or song"
              text="Lectures explaining the daily prayers, the astakas, the songs of the acaryas and the great prayers of the Bhagavatam — each with every class on it, playable as a queue, and explanation videos from YouTube."
            />
          </View>
        )}
      </View>
    </View>
  );
}

function SongDetail({ id }: { id: string }) {
  const t = useTheme();
  const song = getSong(id)!;
  const audio = useAudioMeta();
  const { getLocalUri } = useDownload();
  const [speaker, setSpeaker] = useVerseSpeaker();
  const [expanded, setExpanded] = useState<Set<SpeakerTier>>(new Set());
  useEffect(() => setExpanded(new Set()), [id]);
  const lectures = useMemo(() => sortLectures(songLectures(id), null, speaker), [id, speaker]);
  const group = getSongGroups().find((g) => g.key === song.group);
  const live = useLiveSongVideos(id, song.name, speaker);

  const playAll = () => {
    const items = lectures
      .map((l) => recordingOf(l))
      .filter((r): r is NonNullable<typeof r> => Boolean(r))
      .map((recording) => ({ recording, localUri: getLocalUri(recording.id) }));
    if (!items.length) {
      Alert.alert('No audio lectures', 'No archive lecture explains this one yet — try the videos below.');
      return;
    }
    audio.playQueue(items);
  };
  const whose = speaker === 'all' ? 'your Maharajas first' : `${honoured(MAHARAJAS[speaker].short)} first`;
  const speakerOptions: Array<{ value: VerseSpeaker; label: string }> = [
    { value: 'all', label: 'All speakers equally' },
    ...MAHARAJ_ORDER.map((k) => ({ value: k as VerseSpeaker, label: honoured(MAHARAJAS[k].short) })),
  ];

  return (
    <ScrollView key={id} contentContainerStyle={{ padding: 28, paddingBottom: 40 }}>
      <View style={{ maxWidth: 1100, width: '100%', alignSelf: 'center' } as any}>
        <View
          style={{
            padding: 26, borderRadius: 20, borderWidth: 1, borderColor: a(SONGS_COLOR, 0.35),
            backgroundImage: `linear-gradient(135deg, ${a(SONGS_COLOR, t.dark ? 0.22 : 0.12)}, ${a(SONGS_COLOR, 0.03)} 70%)`,
            backgroundColor: t.surface,
          } as any}
        >
          <Kicker text={group?.name ?? 'Prayers & Songs'} color={SONGS_COLOR} />
          <Text style={{ color: t.text, fontSize: 28, fontWeight: '800', marginTop: 6 }}>{song.name}</Text>
          <Text style={{ color: t.textSub, fontSize: 14, marginTop: 4 }}>{song.author}</Text>
          <Text selectable style={{ color: t.text, fontSize: 17, fontStyle: 'italic', marginTop: 14, lineHeight: 25, fontFamily: 'Georgia, "Cambria", serif' } as any}>{song.line}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 20, flexWrap: 'wrap' }}>
            <Button variant="primary" color={SONGS_COLOR} icon="play" label="Play all lectures" onPress={playAll} disabled={!lectures.length} />
            <Text style={{ flex: 1, minWidth: 220, color: t.textDim, fontSize: 12.5 }}>
              {lectures.length} audio lecture{lectures.length === 1 ? '' : 's'} — {whose}, then other Maharajas.
            </Text>
            <View style={{ width: 240 }}>
              <Select label="Whose lectures come first" value={speaker} options={speakerOptions} onChange={setSpeaker} width="100%" />
            </View>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 28, marginTop: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <View style={{ flexGrow: 3, flexBasis: 380, minWidth: 0 }}>
            {lectures.length === 0 ? (
              <Empty icon="mic-off-outline" title="No archive lecture on this one yet" text="Explanation videos found on YouTube are alongside." />
            ) : null}
            {TIERS.map((tier) => {
              const list = lectures.filter((l) => l.tier === tier);
              if (!list.length) return null;
              const open = expanded.has(tier);
              return (
                <View key={tier} style={{ marginBottom: 20 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                    <Ionicons name="headset" size={14} color={t.textSub} />
                    <Text style={{ flex: 1, color: t.text, fontSize: 14, fontWeight: '800' }} numberOfLines={1}>
                      {tier === 0 && speaker !== 'all' ? `${honoured(MAHARAJAS[speaker].short)} & your speakers` : TIER_LABEL[tier]}
                    </Text>
                    <Badge text={String(list.length)} color={t.textDim} />
                  </View>
                  {(open ? list : list.slice(0, FOLD)).map((l) => <LectureRow key={l.id} lecture={l} />)}
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
          </View>
          <View style={{ flexGrow: 2, flexBasis: 280, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 }}>
              <Ionicons name="logo-youtube" size={15} color={t.youtube} />
              <Text style={{ flex: 1, color: t.text, fontSize: 14, fontWeight: '800' }}>On YouTube</Text>
              {live.videos.length ? <Badge text={String(live.videos.length)} color={t.textDim} /> : null}
            </View>
            {live.loading ? <Spinner label="Searching for explanation videos…" /> : live.error ? (
              <Button size="sm" label="Could not reach YouTube — retry" onPress={live.retry} />
            ) : live.videos.length ? (
              <VideoGrid videos={live.videos} minWidth={240} gap={14} />
            ) : (
              <Text style={{ color: t.textDim, fontSize: 12.5 }}>No explanation videos found on YouTube.</Text>
            )}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

/**
 * Live YouTube search for talks explaining a song — same filter as
 * app/songs/[id].tsx: the title must name this very song and not simply be
 * the song being sung.
 */
function useLiveSongVideos(id: string, name: string, speaker: string) {
  const [videos, setVideos] = useState<VideoResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!id) return;
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 20000);
    let stale = false;
    setLoading(true);
    setError(false);
    const who = speaker !== 'all' && speaker in MAHARAJAS ? `${MAHARAJAS[speaker as keyof typeof MAHARAJAS].short} ` : '';
    search(`${who}${name} explanation lecture`, ctrl.signal)
      .then((page) => {
        if (stale) return;
        setVideos(page.videos.filter((v) =>
          (v.durationSec == null || v.durationSec >= 300) && matchSongs(v.title).includes(id) && !isPerformance(v.title)));
      })
      .catch(() => { if (!stale) setError(true); })
      .finally(() => { clearTimeout(timeout); if (!stale) setLoading(false); });
    return () => { stale = true; clearTimeout(timeout); ctrl.abort(); };
  }, [id, name, speaker, nonce]);
  return { videos, loading, error, retry: () => setNonce((x) => x + 1) };
}
