import React, { useMemo } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDownload } from '../../contexts/DownloadContext';
import { useAudio } from '../../contexts/AudioContext';
import { useHistory } from '../../contexts/HistoryContext';
import { useMaharaj } from '../../contexts/MaharajContext';
import { getRecordingById } from '../../hooks/useLectures';
import { maharajOf, speakerName, honoured } from '../../data/maharajas';
import { Recording, formatBytes, getCategoryMeta } from '../../data/types';

interface Row {
  id: string;
  recording: Recording | null;
  title: string;
  maharaj?: string;
  bytes: number;
  downloadedAt: string;
}

export default function DownloadsScreen() {
  const {
    registry, progress, totalBytes, totalCount, queuedCount,
    deleteDownload, deleteAll, cancelDownload, getLocalUri, downloadRecording,
  } = useDownload();
  const audio = useAudio();
  const { historyMap } = useHistory();
  const { maharaj } = useMaharaj();
  const insets = useSafeAreaInsets();

  const rows = useMemo<Row[]>(
    () =>
      Object.entries(registry)
        .map(([id, e]) => {
          const rec = getRecordingById(id);
          return {
            id,
            recording: rec ?? null,
            title: rec?.title ?? e.title ?? id,
            maharaj: rec?.maharaj ?? e.maharaj,
            bytes: e.totalBytes,
            downloadedAt: e.downloadedAt,
          };
        })
        .sort((a, b) => (b.downloadedAt ?? '').localeCompare(a.downloadedAt ?? '')),
    [registry],
  );

  // In-flight and failed items, which have no registry row yet.
  const active = useMemo(
    () =>
      Object.entries(progress).map(([id, p]) => {
        const rec = getRecordingById(id);
        return { id, p, rec, title: rec?.title ?? id };
      }),
    [progress],
  );

  const handleDeleteAll = () => {
    Alert.alert(
      'Delete all downloads?',
      `This frees ${formatBytes(totalBytes)} and removes ${totalCount} recordings from this device.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete all', style: 'destructive', onPress: () => deleteAll() },
      ],
    );
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Downloads</Text>
          <Text style={styles.sub}>
            {totalCount === 0
              ? 'Nothing saved yet'
              : `${totalCount} ${totalCount === 1 ? 'recording' : 'recordings'} · ${formatBytes(totalBytes)}`}
            {queuedCount > 0 ? ` · ${queuedCount} queued` : ''}
          </Text>
        </View>
        {totalCount > 0 && (
          <TouchableOpacity onPress={handleDeleteAll} style={styles.clearBtn} hitSlop={6}>
            <Ionicons name="trash-outline" size={15} color="#E74C3C" />
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingBottom: 150, paddingTop: 4 }}
        ListHeaderComponent={
          active.length > 0 ? (
            <View style={styles.activeBlock}>
              <Text style={styles.sectionLabel}>In progress</Text>
              {active.map(({ id, p, title }) => {
                const frac = p.bytesTotal > 0 ? p.bytesWritten / p.bytesTotal : 0;
                const failed = p.status === 'error';
                return (
                  <View key={id} style={styles.activeRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.activeTitle} numberOfLines={1}>{title}</Text>
                      <Text style={styles.activeMeta}>
                        {failed
                          ? 'Failed — tap retry'
                          : p.status === 'queued'
                            ? 'Queued'
                            : p.bytesTotal > 0
                              ? `${formatBytes(p.bytesWritten)} of ${formatBytes(p.bytesTotal)}`
                              : 'Starting…'}
                      </Text>
                      {!failed && p.bytesTotal > 0 && (
                        <View style={styles.progTrack}>
                          <View
                            style={[
                              styles.progFill,
                              { width: `${frac * 100}%`, backgroundColor: maharaj.accent },
                            ]}
                          />
                        </View>
                      )}
                    </View>
                    {failed ? (
                      <TouchableOpacity
                        onPress={() => {
                          const rec = getRecordingById(id);
                          if (rec) {
                            downloadRecording({
                              id: rec.id,
                              url: rec.url,
                              title: rec.title,
                              maharaj: rec.maharaj,
                              sizeBytes: rec.sizeBytes,
                            });
                          }
                        }}
                        hitSlop={8}
                        style={styles.rowBtn}
                      >
                        <Ionicons name="refresh" size={17} color={maharaj.accent} />
                      </TouchableOpacity>
                    ) : (
                      <ActivityIndicator size="small" color={maharaj.accent} />
                    )}
                    <TouchableOpacity onPress={() => cancelDownload(id)} hitSlop={8} style={styles.rowBtn}>
                      <Ionicons name="close" size={17} color="#888" />
                    </TouchableOpacity>
                  </View>
                );
              })}
              {rows.length > 0 && <Text style={styles.sectionLabel}>Saved</Text>}
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const rec = item.recording;
          const meta = getCategoryMeta(rec?.category ?? '');
          const played = historyMap.get(item.id);
          const isCurrent = audio.recording?.id === item.id;

          return (
            <Pressable
              onPress={() => rec && router.push(`/lecture/${rec.id}`)}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <View style={[styles.accentBar, { backgroundColor: meta.color }]} />
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.cardMeta} numberOfLines={1}>
                  {[
                    item.maharaj ? (rec ? speakerName(rec) : maharajOf(item.maharaj) ? honoured(maharajOf(item.maharaj)!.short) : null) : null,
                    formatBytes(item.bytes),
                    rec?.location,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                {!rec && (
                  <Text style={styles.orphanNote}>
                    Not in the current catalogue — playable, but details unavailable
                  </Text>
                )}
              </View>

              <TouchableOpacity
                onPress={() => {
                  if (!rec) return;
                  if (isCurrent) {
                    audio.isPlaying ? audio.pause() : audio.resume();
                  } else {
                    audio.play(rec, getLocalUri(item.id), played?.positionMs ?? 0);
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

              <TouchableOpacity
                onPress={() =>
                  Alert.alert('Delete download', `Remove “${item.title}” from this device?`, [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () => deleteDownload(item.id),
                    },
                  ])
                }
                hitSlop={8}
                style={styles.rowBtn}
              >
                <Ionicons name="trash-outline" size={16} color="#5a6288" />
              </TouchableOpacity>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          active.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="cloud-download-outline" size={40} color="#2a3050" />
              <Text style={styles.emptyTitle}>No downloads yet</Text>
              <Text style={styles.emptyText}>
                Tap the download icon on any recording to keep it for offline listening.
              </Text>
              <TouchableOpacity
                onPress={() => router.push('/browse')}
                style={[styles.emptyBtn, { borderColor: maharaj.accent }]}
              >
                <Text style={[styles.emptyBtnText, { color: maharaj.accent }]}>Browse lectures</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0a0d1a' },
  header: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 10 },
  title: { color: '#fff', fontSize: 22, fontWeight: '800' },
  sub: { color: '#5a6288', fontSize: 12, marginTop: 2 },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  clearText: { color: '#E74C3C', fontSize: 12.5, fontWeight: '700' },

  sectionLabel: {
    color: '#7b83ad', fontSize: 11, fontWeight: '800', letterSpacing: 0.6,
    textTransform: 'uppercase', marginHorizontal: 16, marginTop: 8, marginBottom: 8,
  },
  activeBlock: { marginBottom: 4 },
  activeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginVertical: 3, padding: 12,
    backgroundColor: '#101426', borderRadius: 11, borderWidth: 1, borderColor: '#191f3a',
  },
  activeTitle: { color: '#dfe3f5', fontSize: 13, fontWeight: '600' },
  activeMeta: { color: '#5a6288', fontSize: 11, marginTop: 2 },
  progTrack: {
    height: 3, backgroundColor: '#242c4d', borderRadius: 2, marginTop: 7, overflow: 'hidden',
  },
  progFill: { height: 3, borderRadius: 2 },

  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#121629', marginHorizontal: 16, marginVertical: 4,
    borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#1a2040',
  },
  pressed: { opacity: 0.75 },
  accentBar: { width: 3, alignSelf: 'stretch' },
  cardBody: { flex: 1, paddingVertical: 11, paddingHorizontal: 11 },
  cardTitle: { color: '#eee', fontSize: 14, fontWeight: '600', lineHeight: 18 },
  cardMeta: { color: '#666', fontSize: 11.5, marginTop: 4 },
  orphanNote: { color: '#8a6d3b', fontSize: 10.5, marginTop: 4 },
  rowBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center', marginRight: 4,
  },
  playBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 4, borderWidth: 1, borderColor: '#2a3050',
  },
  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40, gap: 8 },
  emptyTitle: { color: '#c9cee8', fontSize: 15.5, fontWeight: '700', marginTop: 6 },
  emptyText: { color: '#5a6288', fontSize: 12.5, textAlign: 'center', lineHeight: 18 },
  emptyBtn: {
    marginTop: 14, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, borderWidth: 1,
  },
  emptyBtnText: { fontSize: 13, fontWeight: '700' },
});
