/**
 * Spotify-style now-playing bar pinned to the bottom of every desktop screen
 * (web/Electron only). Replaces the phone's floating MiniPlayer.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SPEEDS, useAudio } from '../../contexts/AudioContext.web';
import { useLibrary } from '../../contexts/LibraryContext';
import { maharajOf, speakerName } from '../../data/maharajas';
import { getCategoryMeta } from '../../data/types';
import { formatMs } from '../../utils/time';
import { desktop } from '../../utils/desktopBridge';
import MaharajAvatar from '../MaharajAvatar';
import { a, useTheme } from './theme';
import { Hover, IconButton, Range, Tip, useAnchor, useMenu } from './kit';

export const NOW_PLAYING_HEIGHT = 84;

export default function NowPlayingBar() {
  const t = useTheme();
  const audio = useAudio();
  const { isFavourite, toggleFavourite } = useLibrary();
  const { open } = useMenu();
  const speedAnchor = useAnchor();
  const queueAnchor = useAnchor();
  const [drag, setDrag] = useState<number | null>(null);
  const rec = audio.recording;
  const m = rec ? maharajOf(rec.maharaj) : undefined;
  const accent = m?.accent ?? (rec ? getCategoryMeta(rec.category).color : t.accent);

  const openLecture = () => rec && router.push(`/lecture/${rec.id}` as any);

  useEffect(() => desktop()?.onCommand((cmd) => {
    if (cmd === 'openNowPlaying' && rec) router.push(`/lecture/${rec.id}` as any);
  }), [rec]);

  const pos = drag ?? audio.positionMs;
  const dur = audio.durationMs;
  const hasQueue = audio.queueLength > 1;
  const fav = rec ? isFavourite(rec.id) : false;

  const showSpeed = () => {
    const p = speedAnchor.at();
    open(p.x - 40, (p.top ?? p.y) - 8 - SPEEDS.length * 34 - 12, SPEEDS.map((s) => ({
      label: `${s}×`,
      checked: audio.speed === s,
      onPress: () => audio.setSpeed(s),
      hint: s === 1 ? 'Normal' : undefined,
    })), 150);
  };

  const showQueue = () => {
    const p = queueAnchor.at();
    // A window around the current lecture — a chapter queue can run to 100+.
    const from = Math.max(0, audio.queueIndex - 2);
    const shown = audio.queue.slice(from, from + 12);
    const items = [
      { label: `Queue · ${audio.queueIndex + 1} of ${audio.queueLength}`, icon: 'list' as any, disabled: true },
      { separator: true },
      ...shown.map((q, k) => {
        const i = from + k;
        return {
          label: `${i + 1}. ${q.recording.title}`,
          icon: (i === audio.queueIndex ? 'volume-high' : 'musical-note-outline') as any,
          checked: i === audio.queueIndex,
          onPress: () => audio.playAt(i),
        };
      }),
    ];
    const h = (items.length - 1) * 34 + 9 + 12;
    open(Math.max(8, p.x - 380), (p.top ?? p.y) - 10 - h, items, 420);
  };

  return (
    <View
      style={{
        height: NOW_PLAYING_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 18,
        gap: 18,
        backgroundColor: t.dark ? '#070a14' : '#ffffff',
        borderTopWidth: 1,
        borderTopColor: t.border,
      }}
    >
      {/* ---------- left: what is playing ---------- */}
      <View style={{ flex: 1, flexBasis: 0, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {rec ? (
          <>
            <Hover onPress={openLecture} accessibilityLabel="Open the lecture page" style={() => ({ borderRadius: 30 })}>
              {m ? (
                <MaharajAvatar maharaj={m} size={44} />
              ) : (
                <View style={{ width: 52, height: 52, borderRadius: 12, backgroundColor: a(accent, 0.18), alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="mic" size={22} color={accent} />
                </View>
              )}
            </Hover>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Hover onPress={openLecture} accessibilityLabel={rec.title} style={() => ({})}>
                {({ hovered }) => (
                  <Text
                    style={{ color: t.text, fontSize: 13.5, fontWeight: '700', textDecorationLine: hovered ? 'underline' : 'none' }}
                    numberOfLines={1}
                  >
                    {rec.title}
                  </Text>
                )}
              </Hover>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                {audio.offline ? (
                  <Tip label="Playing the downloaded copy">
                    <Ionicons name="cloud-done" size={12} color={t.success} />
                  </Tip>
                ) : null}
                <Text style={{ color: t.textDim, fontSize: 12 }} numberOfLines={1}>
                  {speakerName(rec)}
                  {hasQueue ? ` · ${audio.queueIndex + 1} of ${audio.queueLength}` : ''}
                </Text>
              </View>
            </View>
            <IconButton
              icon={fav ? 'heart' : 'heart-outline'}
              label={fav ? 'Remove from favourites' : 'Add to favourites'}
              color={fav ? t.danger : t.textDim}
              onPress={() => toggleFavourite(rec.id)}
            />
          </>
        ) : (
          <>
            <View style={{ width: 52, height: 52, borderRadius: 12, backgroundColor: t.surfaceHi, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="musical-notes-outline" size={22} color={t.textFaint} />
            </View>
            <View>
              <Text style={{ color: t.textSub, fontSize: 13.5, fontWeight: '700' }}>Nothing playing</Text>
              <Text style={{ color: t.textFaint, fontSize: 12, marginTop: 3 }}>Choose a lecture to start listening</Text>
            </View>
          </>
        )}
      </View>

      {/* ---------- centre: transport + seek ---------- */}
      <View style={{ flex: 1.25, flexBasis: 0, maxWidth: 680, alignItems: 'center', gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <IconButton icon="play-skip-back" label="Previous (Ctrl+Shift+↑)" onPress={audio.skipToPrevious} disabled={!rec} size={32} iconSize={16} />
          <IconButton icon="play-back" label="Back 15 seconds (←)" onPress={audio.skipBackward} disabled={!rec} size={34} iconSize={18} />
          <Tip label={audio.isPlaying ? 'Pause (Space)' : 'Play (Space)'}>
            <Hover
              onPress={() => (audio.isPlaying ? audio.pause() : audio.resume())}
              disabled={!rec}
              accessibilityLabel={audio.isPlaying ? 'Pause' : 'Play'}
              style={({ hovered, pressed }) => ({
                width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
                backgroundColor: rec ? (t.dark ? '#ffffff' : t.text) : t.surfaceHi,
                transform: [{ scale: pressed ? 0.94 : hovered ? 1.06 : 1 }],
                transitionDuration: '120ms', marginHorizontal: 4,
              } as any)}
            >
              {audio.isLoading && audio.isPlaying ? (
                <ActivityIndicator size="small" color={t.dark ? '#000' : '#fff'} />
              ) : (
                <Ionicons
                  name={audio.isPlaying ? 'pause' : 'play'}
                  size={20}
                  color={rec ? (t.dark ? '#090c18' : '#fff') : t.textFaint}
                  style={audio.isPlaying ? undefined : { marginLeft: 2 }}
                />
              )}
            </Hover>
          </Tip>
          <IconButton icon="play-forward" label="Forward 15 seconds (→)" onPress={audio.skipForward} disabled={!rec} size={34} iconSize={18} />
          <IconButton
            icon="play-skip-forward"
            label="Next lecture (Ctrl+Shift+↓)"
            onPress={audio.skipToNext}
            disabled={!rec || audio.queueIndex >= audio.queueLength - 1}
            size={32}
            iconSize={16}
          />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%' }}>
          <Text style={{ color: t.textDim, fontSize: 11.5, width: 52, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
            {rec ? formatMs(pos) : '–:––'}
          </Text>
          <View style={{ flex: 1 }}>
            <Range
              label="Seek"
              value={pos}
              max={dur}
              color={accent}
              rest={t.dark ? '#ffffff26' : '#0000001f'}
              onChange={(v) => setDrag(v)}
              onCommit={(v) => { audio.seek(v); setDrag(null); }}
            />
          </View>
          <Text style={{ color: t.textDim, fontSize: 11.5, width: 52, fontVariant: ['tabular-nums'] }}>
            {rec && dur > 0 ? formatMs(dur) : '–:––'}
          </Text>
        </View>
        {audio.error && rec ? (
          <Text style={{ position: 'absolute', bottom: -14, color: t.danger, fontSize: 11 }}>{audio.error}</Text>
        ) : null}
      </View>

      {/* ---------- right: speed, queue, volume, full player ---------- */}
      <View style={{ flex: 1, flexBasis: 0, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
        <div ref={speedAnchor.ref}>
          <Tip label="Playback speed (Shift+← / →)">
            <Hover
              onPress={showSpeed}
              disabled={!rec}
              accessibilityLabel="Playback speed"
              style={({ hovered }) => ({
                height: 30, minWidth: 48, paddingHorizontal: 8, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: audio.speed !== 1 ? accent : t.border,
                backgroundColor: hovered ? t.hover : 'transparent', opacity: rec ? 1 : 0.4,
              } as any)}
            >
              <Text style={{ color: audio.speed !== 1 ? t.ink(accent) : t.textSub, fontSize: 12.5, fontWeight: '800' }}>
                {audio.speed}×
              </Text>
            </Hover>
          </Tip>
        </div>
        <div ref={queueAnchor.ref}>
          <IconButton icon="list" label={hasQueue ? `Queue (${audio.queueLength})` : 'Queue — play a chapter in sequence from Verses'} onPress={showQueue} disabled={!hasQueue} active={hasQueue} />
        </div>
        <IconButton
          icon={audio.muted || audio.volume === 0 ? 'volume-mute' : audio.volume < 0.5 ? 'volume-low' : 'volume-high'}
          label={audio.muted ? 'Unmute' : 'Mute'}
          onPress={audio.toggleMute}
        />
        <View style={{ width: 96 }}>
          <Range
            label="Volume"
            value={audio.muted ? 0 : audio.volume}
            max={1}
            step={0.01}
            color={t.dark ? '#d8dcf0' : t.textSub}
            rest={t.dark ? '#ffffff26' : '#0000001f'}
            onChange={(v) => audio.setVolume(v)}
          />
        </View>
        <IconButton icon="open-outline" label="Open full player (Ctrl+L)" onPress={openLecture} disabled={!rec} />
      </View>
    </View>
  );
}
