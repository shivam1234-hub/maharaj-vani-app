import React, { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { VideoResult, formatDuration } from '../data/types';
import { useMaharaj } from '../contexts/MaharajContext';
import { hasArchiveAudio } from '../utils/matchArchive';

export default function VideoCard({ video }: { video: VideoResult }) {
  const { active } = useMaharaj();

  // Flags rows that will actually keep playing once you leave the app. The
  // YouTube embed always stops when hidden, so this is true only where a
  // confident archive match exists to hand playback over to.
  const offlineable = useMemo(
    () => hasArchiveAudio(video.title, active),
    [video.title, active],
  );

  return (
    <Pressable
      onPress={() =>
        router.push(
          // Channel and thumbnail ride along so the history row can show them
          // later without another network round-trip.
          `/video/${video.videoId}?title=${encodeURIComponent(video.title)}` +
            `&channel=${encodeURIComponent(video.channel ?? '')}` +
            `&thumb=${encodeURIComponent(video.thumbnail ?? '')}`,
        )
      }
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.thumbWrap}>
        {video.thumbnail ? (
          <Image source={{ uri: video.thumbnail }} style={styles.thumb} resizeMode="cover" />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback]}>
            <Ionicons name="logo-youtube" size={22} color="#E74C3C" />
          </View>
        )}
        {video.durationSec != null && (
          <View style={styles.durationPill}>
            <Text style={styles.durationText}>{formatDuration(video.durationSec)}</Text>
          </View>
        )}
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={3}>{video.title}</Text>
        <Text style={styles.channel} numberOfLines={1}>{video.channel}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          {[video.viewsText, video.publishedText].filter(Boolean).join(' · ')}
        </Text>
        {offlineable && (
          <View style={styles.audioBadge}>
            <Ionicons name="headset-outline" size={10} color="#27AE60" />
            <Text style={styles.audioBadgeText}>Plays in background</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#121629',
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 12,
    padding: 9,
    borderWidth: 1,
    borderColor: '#1a2040',
  },
  pressed: { opacity: 0.75 },
  thumbWrap: { width: 132, height: 76, borderRadius: 8, overflow: 'hidden', backgroundColor: '#0d1020' },
  thumb: { width: '100%', height: '100%' },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  durationPill: {
    position: 'absolute', bottom: 4, right: 4,
    backgroundColor: '#000000cc', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3,
  },
  durationText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  body: { flex: 1, justifyContent: 'center' },
  title: { color: '#eee', fontSize: 13.5, fontWeight: '600', lineHeight: 18 },
  channel: { color: '#7b83ad', fontSize: 11.5, marginTop: 4 },
  meta: { color: '#5a6288', fontSize: 10.5, marginTop: 2 },
  audioBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    marginTop: 6, paddingHorizontal: 7, minHeight: 20, justifyContent: 'center',
    borderRadius: 6, backgroundColor: '#27AE6018',
    borderWidth: 1, borderColor: '#27AE6040',
  },
  audioBadgeText: { color: '#27AE60', fontSize: 9.5, fontWeight: '700' },
});
