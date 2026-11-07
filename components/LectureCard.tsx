import React from 'react';
import {
  ActivityIndicator, Alert, Pressable, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  Recording, formatBytes, formatRecordingDate, getCategoryMeta,
} from '../data/types';
import { useAudio } from '../contexts/AudioContext';
import { useDownload } from '../contexts/DownloadContext';
import { useLibrary } from '../contexts/LibraryContext';
import { useHistory } from '../contexts/HistoryContext';

interface Props {
  recording: Recording;
  /** Hide the breadcrumb line on screens already scoped to one folder. */
  hideFolder?: boolean;
}

export default function LectureCard({ recording, hideFolder }: Props) {
  const audio = useAudio();
  const { isDownloaded, downloadRecording, deleteDownload, cancelDownload, progress, getLocalUri } =
    useDownload();
  const { isFavourite, toggleFavourite } = useLibrary();
  const { historyMap } = useHistory();

  const meta = getCategoryMeta(recording.category);
  const accent = meta.color;

  const isCurrent = audio.recording?.id === recording.id;
  const isPlaying = isCurrent && audio.isPlaying;

  const downloaded = isDownloaded(recording.id);
  const dl = progress[recording.id];
  const busy = dl != null && dl.status !== 'error';
  const failed = dl?.status === 'error';
  const favourite = isFavourite(recording.id);

  const played = historyMap.get(recording.id);
  const listenedFrac =
    played && played.durationMs > 0 ? Math.min(played.positionMs / played.durationMs, 1) : 0;
  const finished = listenedFrac > 0.95;

  const handlePress = () => router.push(`/lecture/${recording.id}`);

  const handlePlay = () => {
    if (isCurrent) {
      if (isPlaying) audio.pause();
      else audio.resume();
      return;
    }
    audio.play(recording, getLocalUri(recording.id), played?.positionMs ?? 0);
  };

  const handleDownloadPress = () => {
    if (busy) {
      cancelDownload(recording.id);
      return;
    }
    if (downloaded) {
      Alert.alert('Downloaded', 'This recording is saved for offline listening.', [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteDownload(recording.id),
        },
      ]);
      return;
    }
    downloadRecording({
      id: recording.id,
      url: recording.url,
      title: recording.title,
      maharaj: recording.maharaj,
      sizeBytes: recording.sizeBytes,
    });
  };

  const renderDownloadIcon = () => {
    if (busy) {
      const frac = dl.bytesTotal > 0 ? dl.bytesWritten / dl.bytesTotal : 0;
      return (
        <View style={styles.dlBusy}>
          <ActivityIndicator size="small" color={accent} />
          {dl.bytesTotal > 0 && (
            <Text style={[styles.dlPct, { color: accent }]}>{Math.round(frac * 100)}</Text>
          )}
        </View>
      );
    }
    if (downloaded) return <Ionicons name="checkmark-circle" size={18} color="#27AE60" />;
    if (failed) return <Ionicons name="alert-circle" size={18} color="#E74C3C" />;
    return <Ionicons name="cloud-download-outline" size={18} color="#4c5480" />;
  };

  return (
    <Pressable onPress={handlePress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={[styles.iconTile, { backgroundColor: accent + '22' }]}>
        <Ionicons name={meta.icon as any} size={19} color={accent} />
      </View>

      <View style={styles.content}>
        <View style={styles.topRow}>
          <View style={[styles.badge, { backgroundColor: accent + '20' }]}>
            <Text style={[styles.badgeText, { color: accent }]}>{meta.badge}</Text>
          </View>
          {finished ? (
            <Ionicons name="checkmark-done" size={13} color="#27AE60" />
          ) : listenedFrac > 0 ? (
            <Ionicons name="play-circle-outline" size={13} color={accent} />
          ) : null}
          <Text style={styles.title} numberOfLines={2}>
            {recording.title}
          </Text>
        </View>

        <View style={styles.metaRow}>
          {recording.location ? (
            <>
              <View style={styles.metaItem}>
                <Ionicons name="location-outline" size={11} color="#666" />
                <Text style={styles.metaText}>{recording.location}</Text>
              </View>
              <View style={styles.metaDot} />
            </>
          ) : null}
          {recording.date ? (
            <>
              <Text style={styles.metaText}>{formatRecordingDate(recording.date)}</Text>
              <View style={styles.metaDot} />
            </>
          ) : recording.year ? (
            <>
              <Text style={styles.metaText}>{recording.year}</Text>
              <View style={styles.metaDot} />
            </>
          ) : null}
          <Text style={styles.metaText}>{formatBytes(recording.sizeBytes)}</Text>
        </View>

        {!hideFolder && recording.breadcrumb.length > 0 && (
          <Text style={styles.folder} numberOfLines={1}>
            {recording.breadcrumb.join(' › ')}
          </Text>
        )}

        {listenedFrac > 0 && !finished && (
          <View style={styles.resumeTrack}>
            <View
              style={[styles.resumeFill, { width: `${listenedFrac * 100}%`, backgroundColor: accent }]}
            />
          </View>
        )}
      </View>

      <TouchableOpacity onPress={() => toggleFavourite(recording.id)} hitSlop={8} style={styles.iconBtn}>
        <Ionicons
          name={favourite ? 'heart' : 'heart-outline'}
          size={17}
          color={favourite ? '#E5484D' : '#4c5480'}
        />
      </TouchableOpacity>

      <TouchableOpacity onPress={handleDownloadPress} hitSlop={8} style={styles.iconBtn}>
        {renderDownloadIcon()}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={handlePlay}
        hitSlop={8}
        style={[
          styles.playBtn,
          { borderColor: accent + '88' },
          isCurrent && { backgroundColor: accent, borderColor: accent },
        ]}
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
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#11152a',
    marginHorizontal: 16,
    marginVertical: 5,
    paddingLeft: 12,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1e2546',
  },
  pressed: { opacity: 0.75 },
  iconTile: {
    width: 42, height: 42, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  content: { flex: 1, paddingVertical: 12, paddingHorizontal: 12 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  badgeText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.4 },
  title: { color: '#f2f4fb', fontSize: 14.5, fontWeight: '700', flex: 1, lineHeight: 19 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { color: '#7880a8', fontSize: 11.5 },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#3a4170' },
  folder: { color: '#4c5480', fontSize: 10.5, marginTop: 5 },
  resumeTrack: {
    height: 3,
    backgroundColor: '#1e2546',
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  resumeFill: { height: 3, borderRadius: 2 },
  iconBtn: {
    width: 32, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  dlBusy: { alignItems: 'center', justifyContent: 'center' },
  dlPct: { position: 'absolute', fontSize: 7.5, fontWeight: '800' },
  playBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 2, marginRight: 12, borderWidth: 1.5,
  },
});
