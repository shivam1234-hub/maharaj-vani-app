import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { SPEEDS, useAudio } from '../../contexts/AudioContext';
import { useDownload } from '../../contexts/DownloadContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { useHistory } from '../../contexts/HistoryContext';
import { useSettings } from '../../contexts/SettingsContext';
import { getCatalog, getRecordingById } from '../../hooks/useLectures';
import { maharajOf, speakerName } from '../../data/maharajas';
import {
  formatBytes, formatRecordingDate, getCategoryMeta,
} from '../../data/types';
import SeekBar from '../../components/SeekBar';
import MaharajAvatar from '../../components/MaharajAvatar';

const SEEK_STEPS = [-60, -15, 15, 60];

export default function LectureScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const audio = useAudio();
  const {
    isDownloaded, downloadRecording, deleteDownload, cancelDownload, progress, getLocalUri,
  } = useDownload();
  const { isFavourite, toggleFavourite, getTagsFor, addTag, removeTag, allTags } = useLibrary();
  const { historyMap } = useHistory();
  const { readerFontScale } = useSettings();

  const [showTagPicker, setShowTagPicker] = useState(false);

  const recording = useMemo(() => (id ? getRecordingById(String(id)) : undefined), [id]);

  React.useEffect(() => {
    if (recording) navigation.setOptions({ title: recording.folder || 'Lecture' });
  }, [recording, navigation]);

  if (!recording) {
    return (
      <View style={styles.missing}>
        <Ionicons name="help-circle-outline" size={44} color="#2a3050" />
        <Text style={styles.missingTitle}>Recording not found</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.missingBtn}>
          <Text style={styles.missingBtnText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const meta = getCategoryMeta(recording.category);
  const accent = meta.color;
  // Undefined for a guest speaker (another Maharaja's lecture from the Verses tab).
  const maharaj = maharajOf(recording.maharaj);

  const isCurrent = audio.recording?.id === recording.id;
  const downloaded = isDownloaded(recording.id);
  const dl = progress[recording.id];
  const busy = dl != null && dl.status !== 'error';
  const favourite = isFavourite(recording.id);
  const tags = getTagsFor(recording.id);
  const played = historyMap.get(recording.id);

  const fs = (n: number) => Math.round(n * readerFontScale);

  const position = isCurrent ? audio.positionMs : played?.positionMs ?? 0;
  const duration = isCurrent ? audio.durationMs : played?.durationMs ?? 0;

  const handlePlay = () => {
    if (isCurrent) {
      audio.isPlaying ? audio.pause() : audio.resume();
      return;
    }
    audio.play(recording, getLocalUri(recording.id), played?.positionMs ?? 0);
  };

  const handleDownload = () => {
    if (busy) {
      cancelDownload(recording.id);
      return;
    }
    if (downloaded) {
      Alert.alert('Delete download', 'Remove the offline copy of this recording?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteDownload(recording.id) },
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

  // Same folder, minus this one — the natural "next in the series".
  const related = useMemo(
    () =>
      maharaj
        ? getCatalog(maharaj.key)
            .filter((r) => r.id !== recording.id && r.folder === recording.folder)
            .slice(0, 8)
        : [],
    [recording],
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: 160 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.hero, { borderColor: accent + '3a', backgroundColor: accent + '12' }]}>
        <View style={[styles.heroGlow, { backgroundColor: accent + '1c' }]} />
        {maharaj && (
          <View style={styles.artWrap}>
            <MaharajAvatar maharaj={maharaj} size={92} />
          </View>
        )}
        <View style={styles.heroTop}>
          <View style={[styles.badge, { backgroundColor: accent + '22' }]}>
            <Ionicons name={meta.icon as any} size={12} color={accent} />
            <Text style={[styles.badgeText, { color: accent }]}>{meta.label}</Text>
          </View>
          {downloaded && (
            <View style={styles.offlinePill}>
              <Ionicons name="cloud-done" size={11} color="#27AE60" />
              <Text style={styles.offlineText}>Offline</Text>
            </View>
          )}
        </View>

        <Text style={[styles.title, { fontSize: fs(19) }]}>{recording.title}</Text>
        <Text style={[styles.maharajName, { color: maharaj?.accent ?? accent, fontSize: fs(13) }]}>
          {maharaj?.name ?? speakerName(recording)}
        </Text>

        <View style={styles.metaGrid}>
          {recording.date ? (
            <MetaItem icon="calendar-outline" text={formatRecordingDate(recording.date)} scale={fs} />
          ) : recording.year ? (
            <MetaItem icon="calendar-outline" text={String(recording.year)} scale={fs} />
          ) : null}
          {recording.location && (
            <MetaItem icon="location-outline" text={recording.location} scale={fs} />
          )}
          {recording.scripture && (
            <MetaItem icon="book-outline" text={recording.scripture} scale={fs} />
          )}
          <MetaItem
            icon="musical-note-outline"
            text={`${formatBytes(recording.sizeBytes)} · ${recording.format}`}
            scale={fs}
          />
        </View>

        {recording.breadcrumb.length > 0 && (
          <Text style={[styles.breadcrumb, { fontSize: fs(11) }]}>
            {recording.breadcrumb.join(' › ')}
          </Text>
        )}
      </View>

      {/* ---------------- player ---------------- */}
      <View style={styles.player}>
        <SeekBar
          positionMs={position}
          durationMs={duration}
          onSeek={(ms) => {
            // Dragging before this lecture is the loaded one should start it
            // at the chosen point rather than silently do nothing.
            if (isCurrent) audio.seek(ms);
            else audio.play(recording, getLocalUri(recording.id), ms);
          }}
          accent={accent}
          // Enabled even when not loaded, as long as a duration is known from
          // a previous listen — dragging then starts playback at that point.
          enabled={isCurrent || duration > 0}
        />

        <View style={styles.controls}>
          {SEEK_STEPS.slice(0, 2).map((s) => (
            <TouchableOpacity
              key={s}
              onPress={() => audio.seek(Math.max(0, position + s * 1000))}
              disabled={!isCurrent}
              style={[styles.seekBtn, !isCurrent && styles.disabled]}
            >
              <Text style={styles.seekBtnText}>{s}s</Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            onPress={handlePlay}
            style={[styles.bigPlay, { backgroundColor: accent }]}
          >
            {audio.isLoading && isCurrent ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Ionicons
                name={isCurrent && audio.isPlaying ? 'pause' : 'play'}
                size={26}
                color="#fff"
              />
            )}
          </TouchableOpacity>

          {SEEK_STEPS.slice(2).map((s) => (
            <TouchableOpacity
              key={s}
              onPress={() => audio.seek(position + s * 1000)}
              disabled={!isCurrent}
              style={[styles.seekBtn, !isCurrent && styles.disabled]}
            >
              <Text style={styles.seekBtnText}>+{s}s</Text>
            </TouchableOpacity>
          ))}
        </View>

        {isCurrent && audio.error && <Text style={styles.errorText}>{audio.error}</Text>}

        <View style={styles.speedRow}>
          <Text style={styles.speedLabel}>Speed</Text>
          {SPEEDS.map((s) => {
            const on = audio.speed === s;
            return (
              <TouchableOpacity
                key={s}
                onPress={() => audio.setSpeed(s)}
                style={[styles.speedChip, on && { backgroundColor: accent + '26', borderColor: accent }]}
              >
                <Text style={[styles.speedText, on && { color: accent, fontWeight: '700' }]}>
                  {s}×
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {isCurrent && (
          <Text style={styles.sourceNote}>
            {audio.offline ? 'Playing the downloaded copy' : 'Streaming from the archive'}
          </Text>
        )}
      </View>

      {/* ---------------- actions ---------------- */}
      <View style={styles.actionRow}>
        <ActionButton
          icon={favourite ? 'heart' : 'heart-outline'}
          label={favourite ? 'Saved' : 'Favourite'}
          color={favourite ? '#E74C3C' : '#7b83ad'}
          onPress={() => toggleFavourite(recording.id)}
        />
        <ActionButton
          icon={
            busy ? 'close-circle-outline' : downloaded ? 'checkmark-circle' : 'cloud-download-outline'
          }
          label={
            busy
              ? dl.bytesTotal > 0
                ? `${Math.round((dl.bytesWritten / dl.bytesTotal) * 100)}%`
                : 'Starting'
              : downloaded
                ? 'Downloaded'
                : 'Download'
          }
          color={downloaded ? '#27AE60' : busy ? accent : '#7b83ad'}
          onPress={handleDownload}
        />
        <ActionButton
          icon="pricetag-outline"
          label={tags.length ? `${tags.length} tag${tags.length > 1 ? 's' : ''}` : 'Tag'}
          color={tags.length ? accent : '#7b83ad'}
          onPress={() => setShowTagPicker((v) => !v)}
        />
        <ActionButton
          icon="globe-outline"
          label="Website"
          color="#7b83ad"
          onPress={() => WebBrowser.openBrowserAsync(recording.sourceUrl).catch(() => {})}
        />
      </View>

      {tags.length > 0 && (
        <View style={styles.tagRow}>
          {tags.map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => removeTag(recording.id, t)}
              style={[styles.tagChip, { borderColor: accent + '55', backgroundColor: accent + '18' }]}
            >
              <Text style={[styles.tagText, { color: accent }]}>{t}</Text>
              <Ionicons name="close" size={11} color={accent} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {showTagPicker && (
        <View style={styles.tagPicker}>
          <Text style={styles.tagPickerLabel}>Add a tag</Text>
          <View style={styles.tagRow}>
            {['To hear again', 'Favourite class', 'Share', 'Study', ...allTags]
              .filter((t, i, a) => a.indexOf(t) === i && !tags.includes(t))
              .slice(0, 10)
              .map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => addTag(recording.id, t)}
                  style={styles.tagChipAdd}
                >
                  <Ionicons name="add" size={11} color="#98a0c8" />
                  <Text style={styles.tagAddText}>{t}</Text>
                </TouchableOpacity>
              ))}
          </View>
        </View>
      )}

      {related.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>More from “{recording.folder}”</Text>
          {related.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => router.replace(`/lecture/${r.id}`)}
              style={({ pressed }) => [styles.relatedRow, pressed && styles.pressed]}
            >
              <View style={[styles.relatedDot, { backgroundColor: getCategoryMeta(r.category).color }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.relatedTitle} numberOfLines={1}>{r.title}</Text>
                <Text style={styles.relatedMeta} numberOfLines={1}>
                  {[r.date ? formatRecordingDate(r.date) : r.year, formatBytes(r.sizeBytes)]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              {isDownloaded(r.id) && <Ionicons name="cloud-done" size={13} color="#27AE60" />}
              <Ionicons name="chevron-forward" size={15} color="#39406a" />
            </Pressable>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function MetaItem({
  icon, text, scale,
}: { icon: string; text: string; scale: (n: number) => number }) {
  return (
    <View style={styles.metaItem}>
      <Ionicons name={icon as any} size={12} color="#6b73a0" />
      <Text style={[styles.metaText, { fontSize: scale(12) }]}>{text}</Text>
    </View>
  );
}

function ActionButton({
  icon, label, color, onPress,
}: { icon: string; label: string; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.actionBtn}>
      <Ionicons name={icon as any} size={19} color={color} />
      <Text style={[styles.actionLabel, { color }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#090c18' },
  pressed: { opacity: 0.72 },

  missing: { flex: 1, backgroundColor: '#0a0d1a', alignItems: 'center', justifyContent: 'center', gap: 10 },
  missingTitle: { color: '#c9cee8', fontSize: 16, fontWeight: '700' },
  missingBtn: {
    marginTop: 8, paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: 10, borderWidth: 1, borderColor: '#2a3050',
  },
  missingBtnText: { color: '#98a0c8', fontSize: 13, fontWeight: '700' },

  hero: {
    margin: 16, padding: 18, backgroundColor: '#11152a',
    borderRadius: 22, borderWidth: 1, overflow: 'hidden',
  },
  heroGlow: { position: 'absolute', width: 260, height: 260, borderRadius: 130, top: -150, alignSelf: 'center' },
  artWrap: { alignItems: 'center', marginBottom: 14, marginTop: 4 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 7,
  },
  badgeText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.3 },
  offlinePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7,
    backgroundColor: '#27AE6018',
  },
  offlineText: { color: '#27AE60', fontSize: 10, fontWeight: '800' },
  title: { color: '#fff', fontWeight: '800', marginTop: 12, lineHeight: 26 },
  maharajName: { fontWeight: '700', marginTop: 6 },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: '#8f97c2' },
  breadcrumb: { color: '#4a5178', marginTop: 12 },

  player: {
    marginHorizontal: 16, padding: 18, backgroundColor: '#11152a',
    borderRadius: 22, borderWidth: 1, borderColor: '#1e2546',
  },
  controls: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, marginTop: 16,
  },
  seekBtn: {
    paddingHorizontal: 11, paddingVertical: 9, borderRadius: 999,
    backgroundColor: '#171c36', borderWidth: 1, borderColor: '#2b3360',
  },
  disabled: { opacity: 0.4 },
  seekBtnText: {
    color: '#c2c8e4', fontSize: 12, fontWeight: '700',
  },
  bigPlay: {
    width: 70, height: 70, borderRadius: 35,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    alignItems: 'center', justifyContent: 'center', marginHorizontal: 4,
  },
  errorText: { color: '#E74C3C', fontSize: 12, textAlign: 'center', marginTop: 12 },
  speedRow: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
    gap: 6, marginTop: 16, justifyContent: 'center',
  },
  speedLabel: { color: '#5a6288', fontSize: 11, fontWeight: '700', marginRight: 2 },
  speedChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
    backgroundColor: '#161c38', borderWidth: 1, borderColor: '#232a4d',
  },
  speedText: {
    color: '#c2c8e4', fontSize: 12, fontWeight: '600',
  },
  sourceNote: { color: '#4a5178', fontSize: 10.5, textAlign: 'center', marginTop: 12 },

  actionRow: {
    flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 14,
  },
  actionBtn: {
    flex: 1, alignItems: 'center', gap: 6, paddingVertical: 14,
    backgroundColor: '#11152a', borderRadius: 16,
    borderWidth: 1, borderColor: '#1e2546',
  },
  actionLabel: { fontSize: 10.5, fontWeight: '700' },

  tagRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
    marginHorizontal: 16, marginTop: 12,
  },
  tagChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1,
  },
  tagText: { fontSize: 11.5, fontWeight: '700' },
  tagPicker: { marginTop: 14 },
  tagPickerLabel: {
    color: '#7b83ad', fontSize: 11, fontWeight: '800',
    letterSpacing: 0.6, textTransform: 'uppercase', marginHorizontal: 16,
  },
  tagChipAdd: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: '#141834', borderWidth: 1, borderColor: '#232a4d',
  },
  tagAddText: { color: '#98a0c8', fontSize: 11.5, fontWeight: '600' },

  sectionTitle: {
    color: '#fff', fontSize: 15, fontWeight: '700',
    marginHorizontal: 16, marginTop: 26, marginBottom: 8,
  },
  relatedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginVertical: 4, padding: 13,
    backgroundColor: '#11152a', borderRadius: 14,
    borderWidth: 1, borderColor: '#1e2546',
  },
  relatedDot: { width: 6, height: 6, borderRadius: 3 },
  relatedTitle: { color: '#dfe3f5', fontSize: 12.5, fontWeight: '600' },
  relatedMeta: { color: '#5a6288', fontSize: 10.5, marginTop: 2 },
});
