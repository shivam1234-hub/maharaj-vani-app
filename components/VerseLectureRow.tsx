import React from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAudio } from '../contexts/AudioContext';
import { useDownload } from '../contexts/DownloadContext';
import { useHistory } from '../contexts/HistoryContext';
import { GUEST_ACCENT, maharajOf } from '../data/maharajas';
import type { VerseAudio } from '../data/verseIndex';
import { formatRecordingDate } from '../data/types';
import { recordingOf } from '../hooks/useVerses';
import { C, R, alpha } from '../constants/theme';

/** Shards of the one-chapter books, where a chapter talk is on the whole book. */
const SINGLE_CHAPTER_SHARDS = new Set(['noi', 'iso', 'bs']);

/** "16–18" when a lecture spans verses, so a range class is recognisable. */
function rangeLabel(l: VerseAudio): string | null {
  if (l.from == null) {
    // The Nectar of Devotion is followed chapter by chapter: every talk is a chapter talk.
    if (l.shard === 'nod' || l.shard === 'song') return null;
    return SINGLE_CHAPTER_SHARDS.has(l.shard) ? 'Whole book' : 'Whole chapter';
  }
  // The Isopanisad Invocation is verse 0.
  const from = l.from === 0 ? 'Invocation' : String(l.from);
  if (l.to != null && l.to !== l.from) return `Verses ${from}–${l.to}`;
  return l.from === 0 ? 'Invocation' : null;
}

function dateLabel(d: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return formatRecordingDate(d);
  return d;
}

export default function VerseLectureRow({ lecture }: { lecture: VerseAudio }) {
  const audio = useAudio();
  const { getLocalUri, isDownloaded } = useDownload();
  const { historyMap } = useHistory();

  const m = maharajOf(lecture.speakerKey);
  const accent = m?.accent ?? GUEST_ACCENT;
  const isCurrent = audio.recording?.id === lecture.id;
  const isPlaying = isCurrent && audio.isPlaying;
  const played = historyMap.get(lecture.id);
  const listened = played && played.durationMs > 0 ? played.positionMs / played.durationMs : 0;

  const onPlay = () => {
    if (isCurrent) {
      if (isPlaying) audio.pause();
      else audio.resume();
      return;
    }
    const rec = recordingOf(lecture);
    if (rec) audio.play(rec, getLocalUri(rec.id), played?.positionMs ?? 0);
  };

  const onOpen = () => {
    // Resolving the recording first warms the guest cache, so the lecture
    // screen finds it without re-scanning the shard.
    const rec = recordingOf(lecture);
    if (rec) router.push(`/lecture/${rec.id}`);
  };

  const range = rangeLabel(lecture);
  const meta = [lecture.date ? dateLabel(lecture.date) : null, range].filter(Boolean).join(' · ');

  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={[styles.bar, { backgroundColor: accent }]} />
      <View style={styles.body}>
        <View style={styles.top}>
          <Text style={[styles.speaker, { color: accent }]} numberOfLines={1}>
            {lecture.speakerName}
          </Text>
          {isDownloaded(lecture.id) && <Ionicons name="cloud-done" size={12} color={C.success} />}
          {listened > 0.95 ? (
            <Ionicons name="checkmark-done" size={13} color={C.success} />
          ) : listened > 0 ? (
            <Ionicons name="play-circle-outline" size={13} color={accent} />
          ) : null}
        </View>
        <Text style={styles.title} numberOfLines={2}>{lecture.title}</Text>
        {meta ? <Text style={styles.meta} numberOfLines={1}>{meta}</Text> : null}
      </View>
      <TouchableOpacity
        onPress={onPlay}
        hitSlop={8}
        style={[
          styles.play,
          { borderColor: accent + alpha(0.55) },
          isCurrent && { backgroundColor: accent, borderColor: accent },
        ]}
        accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
      >
        <Ionicons
          name={isPlaying ? 'pause' : 'play'}
          size={15}
          color={isCurrent ? '#fff' : accent}
          style={isPlaying ? undefined : { marginLeft: 2 }}
        />
      </TouchableOpacity>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginVertical: 4,
    backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.border,
    overflow: 'hidden',
  },
  pressed: { opacity: 0.75 },
  bar: { width: 3, alignSelf: 'stretch' },
  body: { flex: 1, paddingVertical: 10, paddingHorizontal: 12 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  speaker: { fontSize: 11.5, fontWeight: '800', flexShrink: 1 },
  title: { color: C.text, fontSize: 13.5, fontWeight: '600', marginTop: 3, lineHeight: 18 },
  meta: { color: C.textDim, fontSize: 11, marginTop: 3 },
  play: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
});
