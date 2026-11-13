import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import VerseSpeakerChips from '../../components/VerseSpeakerChips';
import VerseLectureRow from '../../components/VerseLectureRow';
import VideoCard from '../../components/VideoCard';
import { useAudio } from '../../contexts/AudioContext';
import { useDownload } from '../../contexts/DownloadContext';
import { MAHARAJAS, honoured } from '../../data/maharajas';
import { getSong, getSongGroups, songLectures } from '../../data/songIndex';
import { TIER_LABEL, type SpeakerTier } from '../../data/verseIndex';
import type { VideoResult } from '../../data/types';
import { recordingOf, sortLectures, useVerseSpeaker } from '../../hooks/useVerses';
import { search } from '../../utils/youtube';
import { isPerformance, matchSongs } from '../../utils/songs';
import { SONGS_COLOR } from '../../utils/shastraNav';
import { C, R, alpha } from '../../constants/theme';

const TIERS: SpeakerTier[] = [0, 1, 2, 3];
const FOLD = 8;

/** One prayer or song: who wrote it, how it opens, and every lecture explaining it. */
export default function SongScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const song = getSong(String(id ?? ''));
  const navigation = useNavigation();
  const audio = useAudio();
  const { getLocalUri } = useDownload();
  const [speaker] = useVerseSpeaker();
  const [expanded, setExpanded] = useState<Set<SpeakerTier>>(new Set());

  const lectures = useMemo(
    () => (song ? sortLectures(songLectures(song.id), null, speaker) : []),
    [song, speaker],
  );
  const group = getSongGroups().find((g) => g.key === song?.group);

  useEffect(() => {
    if (song) navigation.setOptions({ title: song.name });
  }, [song, navigation]);

  const live = useLiveSongVideos(song?.id ?? '', song?.name ?? '', speaker);

  if (!song) {
    return (
      <View style={styles.screen}>
        <Text style={styles.noneTitle}>Unknown prayer or song.</Text>
      </View>
    );
  }

  const playAll = (from = 0) => {
    const items = lectures
      .slice(from)
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

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingTop: 8, paddingBottom: 160 }}>
      <View style={[styles.hero, { borderColor: SONGS_COLOR + alpha(0.35), backgroundColor: SONGS_COLOR + alpha(0.08) }]}>
        <Text style={[styles.kicker, { color: SONGS_COLOR }]}>{group?.name}</Text>
        <Text style={styles.title}>{song.name}</Text>
        <Text style={styles.author}>{song.author}</Text>
        <Text style={styles.line}>{song.line}</Text>
        <Pressable
          onPress={() => playAll(0)}
          style={({ pressed }) => [styles.playBtn, { backgroundColor: SONGS_COLOR }, pressed && styles.pressed]}
        >
          <Ionicons name="play" size={16} color="#fff" />
          <Text style={styles.playText}>Play all lectures</Text>
        </Pressable>
        <Text style={styles.playNote}>
          {lectures.length} audio lecture{lectures.length === 1 ? '' : 's'} — {whose}, then other Maharajas.
        </Text>
      </View>

      <VerseSpeakerChips />

      {lectures.length === 0 && (
        <View style={styles.none}>
          <Ionicons name="mic-off-outline" size={28} color={C.textFaint} />
          <Text style={styles.noneTitle}>No archive lecture on this one yet</Text>
          <Text style={styles.noneText}>Videos found on YouTube are below.</Text>
        </View>
      )}

      {TIERS.map((t) => {
        const list = lectures.filter((l) => l.tier === t);
        if (!list.length) return null;
        const open = expanded.has(t);
        return (
          <View key={t}>
            <SectionTitle
              text={t === 0 && speaker !== 'all' ? `${honoured(MAHARAJAS[speaker].short)} & your speakers` : TIER_LABEL[t]}
              count={list.length}
              icon="headset"
            />
            {(open ? list : list.slice(0, FOLD)).map((l) => (
              <VerseLectureRow key={l.id} lecture={l} />
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
                <Text style={[styles.moreText, { color: SONGS_COLOR }]}>{open ? 'Show fewer' : `Show all ${list.length}`}</Text>
              </Pressable>
            )}
          </View>
        );
      })}

      <SectionTitle text="On YouTube" count={live.videos.length || undefined} icon="logo-youtube" />
      {live.loading ? (
        <ActivityIndicator style={{ marginVertical: 16 }} color={SONGS_COLOR} />
      ) : live.error ? (
        <Pressable onPress={live.retry} style={styles.moreBtn}>
          <Text style={[styles.moreText, { color: SONGS_COLOR }]}>Could not reach YouTube — tap to retry</Text>
        </Pressable>
      ) : live.videos.length ? (
        live.videos.map((v) => <VideoCard key={v.videoId} video={v} />)
      ) : (
        <Text style={styles.liveEmpty}>No explanation videos found on YouTube.</Text>
      )}
    </ScrollView>
  );
}

/**
 * Live YouTube search for talks explaining a song ("Gurvastakam explanation"),
 * keeping videos whose title names this very song and that are not simply
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
        setVideos(
          page.videos.filter(
            (v) =>
              (v.durationSec == null || v.durationSec >= 300) &&
              matchSongs(v.title).includes(id) &&
              !isPerformance(v.title),
          ),
        );
      })
      .catch(() => {
        if (!stale) setError(true);
      })
      .finally(() => {
        clearTimeout(timeout);
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
      clearTimeout(timeout);
      ctrl.abort();
    };
  }, [id, name, speaker, nonce]);

  return { videos, loading, error, retry: () => setNonce((x) => x + 1) };
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  pressed: { opacity: 0.75 },
  hero: { marginHorizontal: 16, padding: 16, borderRadius: R.xl, borderWidth: 1 },
  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  title: { color: C.text, fontSize: 22, fontWeight: '800', marginTop: 4 },
  author: { color: C.textSub, fontSize: 12.5, marginTop: 3 },
  line: { color: C.text, fontSize: 14, fontStyle: 'italic', marginTop: 10, lineHeight: 20 },
  playBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 14, paddingVertical: 12, borderRadius: R.pill,
  },
  playText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  playNote: { color: C.textDim, fontSize: 11, marginTop: 7, textAlign: 'center' },

  none: { alignItems: 'center', gap: 6, marginHorizontal: 30, marginTop: 18 },
  noneTitle: { color: C.text, fontSize: 14.5, fontWeight: '700', textAlign: 'center' },
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
