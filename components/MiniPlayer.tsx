import React from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, usePathname } from 'expo-router';
import { useAudio } from '../contexts/AudioContext';
import { maharajOf, speakerName } from '../data/maharajas';
import MaharajAvatar from './MaharajAvatar';
import { C, R, shadow } from '../constants/theme';

const TAB_BAR_HEIGHT = 64;
const TAB_ROUTES = new Set(['/', '/verses', '/browse', '/youtube', '/downloads', '/history']);

export default function MiniPlayer() {
  const audio = useAudio();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();

  const rec = audio.recording;
  if (!rec) return null;
  // The lecture screen is the full player, and the video screen has its own
  // transport: a second set of controls floating over them only got in the way.
  if (pathname.startsWith('/lecture/') || pathname.startsWith('/video/')) return null;

  const maharaj = maharajOf(rec.maharaj);
  const accent = maharaj?.accent ?? '#FF7722';
  const progress = audio.durationMs > 0 ? Math.min(audio.positionMs / audio.durationMs, 1) : 0;
  // Above the tab bar on tab screens; near the bottom edge on stack screens,
  // which have no tab bar.
  const bottom = TAB_ROUTES.has(pathname) ? TAB_BAR_HEIGHT + insets.bottom + 8 : insets.bottom + 12;

  return (
    <View style={[styles.wrapper, { bottom }]} pointerEvents="box-none">
      <Pressable
        onPress={() => router.push(`/lecture/${rec.id}`)}
        style={[styles.card, { borderColor: accent + '55' }]}
      >
        {maharaj ? <MaharajAvatar maharaj={maharaj} size={34} /> : null}

        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>{rec.title}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            {audio.offline ? 'Offline · ' : ''}
            {speakerName(rec)}
          </Text>
        </View>

        <TouchableOpacity onPress={audio.skipBackward} style={styles.iconBtn} hitSlop={4}>
          <Ionicons name="play-back" size={17} color={C.textSub} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => (audio.isPlaying ? audio.pause() : audio.resume())}
          style={[styles.playBtn, { backgroundColor: accent }]}
          hitSlop={6}
        >
          <Ionicons
            name={audio.isPlaying ? 'pause' : 'play'}
            size={19}
            color="#fff"
            style={audio.isPlaying ? undefined : { marginLeft: 2 }}
          />
        </TouchableOpacity>
        {/* In a "play chapter in sequence" queue, step to the next verse's lecture. */}
        {audio.queueLength > 1 && audio.queueIndex < audio.queueLength - 1 ? (
          <TouchableOpacity onPress={audio.skipToNext} style={styles.iconBtn} hitSlop={4} accessibilityLabel="Next lecture">
            <Ionicons name="play-skip-forward" size={17} color={C.textSub} />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity onPress={audio.stop} style={styles.iconBtn} hitSlop={4}>
          <Ionicons name="close" size={19} color={C.textDim} />
        </TouchableOpacity>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: accent }]} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'absolute', left: 10, right: 10, zIndex: 100 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingLeft: 8, paddingRight: 6, paddingVertical: 8,
    backgroundColor: C.surfaceHi, borderRadius: R.lg, borderWidth: 1,
    overflow: 'hidden',
    ...shadow,
  },
  info: { flex: 1 },
  title: { color: C.text, fontSize: 13.5, fontWeight: '700' },
  meta: { color: C.textDim, fontSize: 11.5, marginTop: 2 },
  iconBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  playBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  progressTrack: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: C.border,
  },
  progressFill: { height: 3 },
});
