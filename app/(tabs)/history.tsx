import React, { useMemo, useState } from 'react';
import {
  Alert, FlatList, Image, Pressable, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HistoryRetention, isVideoEntry, useHistory } from '../../contexts/HistoryContext';
import { useAudio } from '../../contexts/AudioContext';
import { useDownload } from '../../contexts/DownloadContext';
import { useMaharaj } from '../../contexts/MaharajContext';
import { getRecordingById } from '../../hooks/useLectures';
import { getCategoryMeta } from '../../data/types';
import { formatMs, formatRelativeTime } from '../../utils/time';

const RETENTIONS: Array<{ value: HistoryRetention; label: string }> = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: -1, label: 'Forever' },
];

export default function HistoryScreen() {
  const { history, settings, updateSettings, clearHistory } = useHistory();
  const audio = useAudio();
  const { getLocalUri } = useDownload();
  const { maharaj } = useMaharaj();
  const insets = useSafeAreaInsets();

  // Lectures and videos share one list (one retention policy, one Clear), so
  // the filter is presentational.
  const [filter, setFilter] = useState<'all' | 'audio' | 'video'>('all');

  const rows = useMemo(
    () =>
      history
        .filter((h) =>
          filter === 'all' ? true : filter === 'video' ? isVideoEntry(h) : !isVideoEntry(h),
        )
        .map((h) => ({ entry: h, recording: getRecordingById(h.id) })),
    [history, filter],
  );

  const videoCount = useMemo(() => history.filter(isVideoEntry).length, [history]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>History</Text>
          <Text style={styles.sub}>
            {history.length === 0
              ? 'Nothing played yet'
              : `${history.length} ${history.length === 1 ? 'entry' : 'entries'}`}
          </Text>
        </View>
        {history.length > 0 && (
          <TouchableOpacity
            onPress={() =>
              Alert.alert('Clear history?', 'This removes all listening history and saved positions.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear', style: 'destructive', onPress: clearHistory },
              ])
            }
            style={styles.clearBtn}
            hitSlop={6}
          >
            <Ionicons name="trash-outline" size={15} color="#E74C3C" />
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.retentionRow}>
        <Text style={styles.retentionLabel}>Keep for</Text>
        {RETENTIONS.map((r) => {
          const on = settings.retention === r.value;
          return (
            <TouchableOpacity
              key={r.label}
              onPress={() => updateSettings({ retention: r.value })}
              style={[
                styles.retChip,
                on && { backgroundColor: maharaj.accent + '26', borderColor: maharaj.accent },
              ]}
            >
              <Text style={[styles.retChipText, on && { color: maharaj.accent, fontWeight: '700' }]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {videoCount > 0 && (
        <View style={styles.filterRow}>
          {([
            ['all', `All (${history.length})`],
            ['audio', `Lectures (${history.length - videoCount})`],
            ['video', `Videos (${videoCount})`],
          ] as const).map(([key, label]) => {
            const on = filter === key;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => setFilter(key)}
                style={[
                  styles.filterChip,
                  on && { backgroundColor: maharaj.accent + '26', borderColor: maharaj.accent },
                ]}
              >
                <Text style={[styles.filterText, on && { color: maharaj.accent }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <FlatList
        data={rows}
        keyExtractor={(r) => r.entry.id}
        contentContainerStyle={{ paddingBottom: 150, paddingTop: 4 }}
        renderItem={({ item }) => {
          const { entry, recording } = item;

          // Watched YouTube videos: no local recording, and tapping resumes
          // the embed at the saved second rather than restarting it.
          if (isVideoEntry(entry)) {
            const vFrac =
              entry.durationMs > 0 ? Math.min(entry.positionMs / entry.durationMs, 1) : 0;
            const vDone = vFrac > 0.95;
            return (
              <Pressable
                onPress={() =>
                  router.push(
                    `/video/${entry.videoId}?title=${encodeURIComponent(entry.title)}` +
                      `&start=${Math.floor(entry.positionMs / 1000)}` +
                      `&channel=${encodeURIComponent(entry.channel ?? '')}` +
                      `&thumb=${encodeURIComponent(entry.thumbnail ?? '')}`,
                  )
                }
                style={({ pressed }) => [styles.card, pressed && styles.pressed]}
              >
                <View style={[styles.accentBar, { backgroundColor: '#E74C3C' }]} />
                {entry.thumbnail ? (
                  <Image source={{ uri: entry.thumbnail }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbFallback]}>
                    <Ionicons name="logo-youtube" size={18} color="#E74C3C" />
                  </View>
                )}
                <View style={styles.cardBody}>
                  <View style={styles.cardTop}>
                    {vDone ? (
                      <Ionicons name="checkmark-done" size={13} color="#27AE60" />
                    ) : (
                      <Ionicons name="logo-youtube" size={13} color="#E74C3C" />
                    )}
                    <Text style={styles.cardTitle} numberOfLines={2}>{entry.title}</Text>
                  </View>
                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {[
                      entry.channel,
                      formatRelativeTime(entry.playedAt),
                      entry.durationMs > 0
                        ? `${formatMs(entry.positionMs)} of ${formatMs(entry.durationMs)}`
                        : entry.positionMs > 0
                          ? `stopped at ${formatMs(entry.positionMs)}`
                          : null,
                    ].filter(Boolean).join(' · ')}
                  </Text>
                  {vFrac > 0 && !vDone && (
                    <View style={styles.progTrack}>
                      <View
                        style={[styles.progFill, { width: `${vFrac * 100}%`, backgroundColor: '#E74C3C' }]}
                      />
                    </View>
                  )}
                </View>
                <View style={styles.playBtn}>
                  <Ionicons name="play" size={15} color="#E74C3C" />
                </View>
              </Pressable>
            );
          }

          const meta = getCategoryMeta(recording?.category ?? entry.type);
          const frac = entry.durationMs > 0 ? Math.min(entry.positionMs / entry.durationMs, 1) : 0;
          const finished = frac > 0.95;
          const isCurrent = audio.recording?.id === entry.id;

          return (
            <Pressable
              onPress={() => recording && router.push(`/lecture/${recording.id}`)}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <View style={[styles.accentBar, { backgroundColor: meta.color }]} />
              <View style={styles.cardBody}>
                <View style={styles.cardTop}>
                  {finished ? (
                    <Ionicons name="checkmark-done" size={13} color="#27AE60" />
                  ) : (
                    <Ionicons name="play-circle-outline" size={13} color={meta.color} />
                  )}
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {recording?.title ?? entry.title}
                  </Text>
                </View>
                <Text style={styles.cardMeta}>
                  {formatRelativeTime(entry.playedAt)}
                  {entry.durationMs > 0
                    ? ` · ${formatMs(entry.positionMs)} of ${formatMs(entry.durationMs)}`
                    : ''}
                </Text>
                {frac > 0 && !finished && (
                  <View style={styles.progTrack}>
                    <View
                      style={[styles.progFill, { width: `${frac * 100}%`, backgroundColor: meta.color }]}
                    />
                  </View>
                )}
              </View>

              <TouchableOpacity
                onPress={() => {
                  if (!recording) return;
                  if (isCurrent) {
                    audio.isPlaying ? audio.pause() : audio.resume();
                  } else {
                    audio.play(recording, getLocalUri(recording.id), entry.positionMs);
                  }
                }}
                hitSlop={8}
                style={[
                  styles.playBtn,
                  isCurrent && { backgroundColor: meta.color + '22', borderColor: meta.color },
                ]}
              >
                <Ionicons
                  name={isCurrent && audio.isPlaying ? 'pause' : 'play'}
                  size={15}
                  color={isCurrent ? meta.color : '#666'}
                />
              </TouchableOpacity>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="time-outline" size={40} color="#2a3050" />
            <Text style={styles.emptyTitle}>No listening history</Text>
            <Text style={styles.emptyText}>
              Lectures you play appear here, and each one resumes where you stopped.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0a0d1a' },
  filterRow: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 10 },
  filterChip: {
    minHeight: 34, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8,
    backgroundColor: '#141834', borderWidth: 1, borderColor: '#232a4d',
  },
  filterText: { color: '#c2c8e4', fontSize: 12, fontWeight: '700' },
  thumb: { width: 62, height: 40, borderRadius: 6, marginLeft: 10, backgroundColor: '#12162a' },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 10 },
  title: { color: '#fff', fontSize: 22, fontWeight: '800' },
  sub: { color: '#5a6288', fontSize: 12, marginTop: 2 },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  clearText: { color: '#E74C3C', fontSize: 12.5, fontWeight: '700' },

  retentionRow: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6,
    marginHorizontal: 16, marginBottom: 8,
  },
  retentionLabel: { color: '#5a6288', fontSize: 11.5, fontWeight: '700', marginRight: 2 },
  retChip: {
    // See the chip note in youtube.tsx — a height floor, not padding alone.
    minHeight: 34, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8,
    backgroundColor: '#141834', borderWidth: 1, borderColor: '#232a4d',
  },
  retChipText: {
    color: '#c2c8e4', fontSize: 12.5, fontWeight: '600',
  },

  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#121629', marginHorizontal: 16, marginVertical: 4,
    borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#1a2040',
  },
  pressed: { opacity: 0.75 },
  accentBar: { width: 3, alignSelf: 'stretch' },
  cardBody: { flex: 1, paddingVertical: 11, paddingHorizontal: 11 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { color: '#eee', fontSize: 14, fontWeight: '600', flex: 1, lineHeight: 18 },
  cardMeta: { color: '#666', fontSize: 11.5, marginTop: 4 },
  progTrack: {
    height: 2, backgroundColor: '#242c4d', borderRadius: 1, marginTop: 7, overflow: 'hidden',
  },
  progFill: { height: 2, borderRadius: 1 },
  playBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 11, borderWidth: 1, borderColor: '#2a3050',
  },
  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40, gap: 8 },
  emptyTitle: { color: '#c9cee8', fontSize: 15.5, fontWeight: '700', marginTop: 6 },
  emptyText: { color: '#5a6288', fontSize: 12.5, textAlign: 'center', lineHeight: 18 },
});
