import React from 'react';
import {
  ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { MaharajConfig } from '../data/maharajas';
import { VideoResult, formatDuration } from '../data/types';
import { useRecentVideos } from '../hooks/useRecentVideos';
import { C, R, alpha } from '../constants/theme';

const CARD_W = 236;

/** Home-screen strip of the active Maharaja's newest YouTube uploads. */
export default function RecentVideosRow({ maharaj }: { maharaj: MaharajConfig }) {
  const { videos, loading, error, retry } = useRecentVideos(maharaj);

  return (
    <View>
      <View style={styles.head}>
        <View style={styles.headLeft}>
          <Ionicons name="logo-youtube" size={17} color={C.youtube} />
          <Text style={styles.title}>Latest videos</Text>
        </View>
        <Pressable onPress={() => router.push('/youtube')} hitSlop={8} style={styles.seeAll}>
          <Text style={[styles.seeAllText, { color: maharaj.accent }]}>See all</Text>
          <Ionicons name="chevron-forward" size={14} color={maharaj.accent} />
        </Pressable>
      </View>

      {loading && videos.length === 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.card}>
              <View style={[styles.thumb, styles.skeleton]}>
                {i === 0 && <ActivityIndicator color={maharaj.accent} />}
              </View>
              <View style={[styles.skelLine, { width: '90%' }]} />
              <View style={[styles.skelLine, { width: '55%' }]} />
            </View>
          ))}
        </ScrollView>
      ) : error && videos.length === 0 ? (
        <Pressable onPress={retry} style={styles.errorBox}>
          <Ionicons name="cloud-offline-outline" size={18} color={C.textDim} />
          <Text style={styles.errorText}>{error}. Tap to retry.</Text>
        </Pressable>
      ) : videos.length === 0 ? (
        <Text style={styles.empty}>No recent videos found.</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
          {videos.map((v) => (
            <VideoTile key={v.videoId} video={v} accent={maharaj.accent} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function VideoTile({ video, accent }: { video: VideoResult; accent: string }) {
  const live = /live|streaming now/i.test(`${video.publishedText ?? ''} ${video.title}`) &&
    video.durationSec == null;
  return (
    <Pressable
      onPress={() =>
        router.push(
          `/video/${video.videoId}?title=${encodeURIComponent(video.title)}` +
            `&channel=${encodeURIComponent(video.channel ?? '')}` +
            `&thumb=${encodeURIComponent(video.thumbnail ?? '')}`,
        )
      }
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]}
    >
      <View style={styles.thumb}>
        {video.thumbnail ? (
          <Image source={{ uri: video.thumbnail }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <Ionicons name="logo-youtube" size={26} color={C.youtube} />
        )}
        <View style={styles.playOverlay}>
          <Ionicons name="play" size={16} color="#fff" style={{ marginLeft: 2 }} />
        </View>
        {live ? (
          <View style={[styles.badge, { backgroundColor: C.youtube }]}>
            <Text style={styles.badgeText}>LIVE</Text>
          </View>
        ) : video.durationSec != null ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{formatDuration(video.durationSec)}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.vTitle} numberOfLines={2}>{video.title}</Text>
      <Text style={styles.vMeta} numberOfLines={1}>
        {[video.publishedText, video.channel].filter(Boolean).join(' · ')}
      </Text>
      <View style={[styles.accentLine, { backgroundColor: accent + alpha(0.5) }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 16, marginTop: 26, marginBottom: 10,
  },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: C.text, fontSize: 17, fontWeight: '800' },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: { fontSize: 13, fontWeight: '700' },

  strip: { paddingHorizontal: 16, gap: 12 },
  card: {
    width: CARD_W, backgroundColor: C.surface, borderRadius: R.lg,
    borderWidth: 1, borderColor: C.border, overflow: 'hidden', paddingBottom: 12,
  },
  thumb: {
    width: CARD_W, height: Math.round((CARD_W * 9) / 16),
    backgroundColor: C.surfaceLo, alignItems: 'center', justifyContent: 'center',
  },
  playOverlay: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: '#000000a0',
    alignItems: 'center', justifyContent: 'center',
  },
  badge: {
    position: 'absolute', right: 8, bottom: 8, backgroundColor: '#000000cc',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5,
  },
  badgeText: { color: '#fff', fontSize: 10.5, fontWeight: '800' },
  vTitle: {
    color: C.text, fontSize: 13.5, fontWeight: '700', lineHeight: 18,
    marginTop: 10, marginHorizontal: 12, minHeight: 36,
  },
  vMeta: { color: C.textDim, fontSize: 11.5, marginTop: 5, marginHorizontal: 12 },
  accentLine: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2 },

  skeleton: { backgroundColor: C.surfaceHi },
  skelLine: {
    height: 10, borderRadius: 5, backgroundColor: C.surfaceHi,
    marginTop: 12, marginHorizontal: 12,
  },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, padding: 16, borderRadius: R.lg,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
  },
  errorText: { color: C.textDim, fontSize: 13, flex: 1 },
  empty: { color: C.textDim, fontSize: 13, marginHorizontal: 16 },
});
