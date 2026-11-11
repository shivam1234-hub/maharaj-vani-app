import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, Switch, Text, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { a, useTheme } from '../../components/desktop/theme';
import { Button, Card, Hover, Kicker, Spinner } from '../../components/desktop/kit';
import { videoHref } from '../../components/desktop/recordings';
import { useAudioMeta } from '../../contexts/AudioContext.web';
import { useSettings } from '../../contexts/SettingsContext';
import { YT_PREFIX, useHistory } from '../../contexts/HistoryContext';
import { useDownload } from '../../contexts/DownloadContext';
import { useMaharaj } from '../../contexts/MaharajContext';
import { useYouTube } from '../../hooks/useYouTube';
import { findArchiveCandidates } from '../../utils/matchArchive';
import { embedUrl, watchUrl } from '../../utils/youtube';
import { desktop, openExternal } from '../../utils/desktopBridge';
import { MAHARAJAS, MAHARAJ_ORDER, honoured } from '../../data/maharajas';
import { MaharajKey, Recording, formatDuration } from '../../data/types';

/**
 * Desktop watch page: a large YouTube player with the details beneath it, and
 * on the right the archive audio of the same class (when one matches) and
 * more videos by the speaker.
 *
 * The embed is a plain <iframe> — inside Electron the page has a real
 * http://127.0.0.1 origin, which is all YouTube's embed needs (the phone's
 * WebView wrapper exists to supply one). Player state and position come back
 * over the IFrame API's postMessage channel, for history and resume.
 *
 * Android picture-in-picture becomes "Pop out": a small always-on-top window
 * (desktop/main.js openVideoPopout).
 */
export default function VideoScreen() {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const { id, title, start, channel, thumb } = useLocalSearchParams<{
    id: string; title?: string; start?: string; channel?: string; thumb?: string;
  }>();
  const videoId = String(id ?? '');
  const heading = title ? String(title) : 'Video';
  const audio = useAudioMeta();
  const { backgroundVideoAudio, setBackgroundVideoAudio } = useSettings();
  const { recordVideoPlay, updatePosition, historyMap } = useHistory();
  const { getLocalUri } = useDownload();
  const { active } = useMaharaj();
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [poppedOut, setPoppedOut] = useState(false);
  const timeRef = useRef(0);
  const durRef = useRef(0);
  const savedRef = useRef(0);

  // Resume where this video was left, unless ?start= says otherwise.
  const startSec = useMemo(() => {
    const explicit = Number(start);
    if (!Number.isNaN(explicit) && explicit > 0) return Math.floor(explicit);
    const prev = historyMap.get(YT_PREFIX + videoId);
    const secs = prev ? Math.floor(prev.positionMs / 1000) : 0;
    if (prev && prev.durationMs > 0 && secs > prev.durationMs / 1000 - 15) return 0;
    return secs;
    // Only per video — re-deriving on every history write would reload the player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  const src = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${embedUrl(videoId)}&autoplay=1&origin=${encodeURIComponent(origin)}${startSec > 0 ? `&start=${startSec}` : ''}`;
  }, [videoId, startSec]);

  const videoMaharaj: MaharajKey = useMemo(() => {
    const hay = `${heading} ${channel ?? ''}`;
    return (
      MAHARAJ_ORDER.find((k) => MAHARAJAS[k].youtube.match.test(hay)) ??
      MAHARAJ_ORDER.find((k) => MAHARAJAS[k].youtube.channels.some((c) => c.name === String(channel ?? ''))) ??
      active
    );
  }, [heading, channel, active]);

  const candidates = useMemo(
    () => (heading !== 'Video' ? findArchiveCandidates(heading, videoMaharaj, 4) : []),
    [heading, videoMaharaj],
  );
  const archiveMatch = candidates[0]?.confident ? candidates[0] : null;
  const suggestions = archiveMatch ? [] : candidates;

  // ---------------------------------------------------------------- player API

  const command = useCallback((func: string, args: unknown[] = []) => {
    try {
      frameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args, id: 1, channel: 'widget' }), '*');
    } catch {}
  }, []);

  useEffect(() => {
    setReady(false);
    setFailed(false);
    setPoppedOut(false);
    timeRef.current = startSec;
    durRef.current = 0;
    savedRef.current = 0;
  }, [videoId, startSec]);

  // Two audio streams at once is never wanted.
  useEffect(() => {
    if (audio.isPlaying) audio.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!/^https:\/\/www\.youtube(-nocookie)?\.com$/.test(e.origin)) return;
      if (e.source !== frameRef.current?.contentWindow) return;
      let d: any;
      try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
      if (d?.event === 'onReady' || d?.event === 'initialDelivery') {
        if (!ready) {
          setReady(true);
          recordVideoPlay({ videoId, title: heading, channel: channel ? String(channel) : undefined, thumbnail: thumb ? String(thumb) : undefined });
        }
      }
      const info = d?.info;
      if (!info) return;
      if (typeof info.playerState === 'number') {
        if (info.playerState === 1) setPlaying(true);
        if (info.playerState === 2 || info.playerState === 0) setPlaying(false);
      }
      if (typeof info.duration === 'number' && info.duration > 0) durRef.current = info.duration;
      if (typeof info.currentTime === 'number') {
        timeRef.current = info.currentTime;
        if (Math.abs(info.currentTime - savedRef.current) >= 5) {
          savedRef.current = info.currentTime;
          updatePosition(YT_PREFIX + videoId, info.currentTime * 1000, durRef.current * 1000);
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [videoId, heading, channel, thumb, ready, recordVideoPlay, updatePosition]);

  const onFrameLoad = () => {
    // The IFrame API only reports state to a parent that says it is listening.
    const listen = () => {
      try {
        frameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*');
      } catch {}
    };
    listen();
    setTimeout(listen, 500);
    setTimeout(listen, 1500);
    setTimeout(() => {
      // Some embeds never send onReady; a loaded frame is good enough to record.
      setReady((r) => {
        if (!r) recordVideoPlay({ videoId, title: heading, channel: channel ? String(channel) : undefined, thumbnail: thumb ? String(thumb) : undefined });
        return true;
      });
    }, 2500);
  };

  // A player that never loads (offline, YouTube hanging) gets an escape hatch.
  useEffect(() => {
    if (ready) return;
    const tm = setTimeout(() => setFailed(true), 15000);
    return () => clearTimeout(tm);
  }, [ready, videoId]);

  // Save the position on the way out.
  useEffect(() => () => {
    if (timeRef.current > 0) updatePosition(YT_PREFIX + videoId, timeRef.current * 1000, durRef.current * 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  // "Keep playing in background" off: pause when the window is minimised.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden' && !backgroundVideoAudio) command('pauseVideo');
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [backgroundVideoAudio, command]);

  useEffect(() => desktop()?.video.onPopoutClosed(() => setPoppedOut(false)), []);

  const popOut = () => {
    const d = desktop();
    if (!d) return;
    command('pauseVideo');
    d.video.popout(videoId, Math.floor(timeRef.current), heading).then((ok) => ok && setPoppedOut(true));
  };

  const listenAsAudio = (rec: Recording) => {
    command('pauseVideo');
    audio.play(rec, getLocalUri(rec.id), timeRef.current * 1000);
    router.push(`/lecture/${rec.id}` as any);
  };

  // ---------------------------------------------------------------- layout

  const sideW = width >= 1500 ? 400 : 340;
  const more = useYouTube(MAHARAJAS[videoMaharaj].youtube.query, '');
  const moreVideos = more.videos.filter((v) => v.videoId !== videoId).slice(0, 18);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ padding: 28 }}>
      <View style={{ flexDirection: 'row', gap: 28, alignItems: 'flex-start', maxWidth: 1700, width: '100%', alignSelf: 'center' } as any}>
        {/* ---------------- player + details ---------------- */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 14, overflow: 'hidden', backgroundColor: '#000' } as any}>
            {poppedOut ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <Ionicons name="albums-outline" size={34} color="#ffffff88" />
                <Text style={{ color: '#ffffffcc', fontSize: 14 }}>Playing in the pop-out window</Text>
                <Button label="Bring it back here" icon="return-down-back" onPress={() => { desktop()?.video.closePopout(); setPoppedOut(false); }} />
              </View>
            ) : (
              <iframe
                key={videoId}
                ref={frameRef}
                title={heading}
                src={src}
                onLoad={onFrameLoad}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
              />
            )}
            {!ready && !failed && !poppedOut ? (
              <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' } as any}>
                <ActivityIndicator color={t.youtube} />
              </View>
            ) : null}
          </View>

          {failed && !ready ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, padding: 12, borderRadius: 10, backgroundColor: a(t.danger, 0.1) }}>
              <Ionicons name="cloud-offline-outline" size={18} color={t.danger} />
              <Text style={{ flex: 1, color: t.textSub, fontSize: 13 }}>
                The player is taking a long time. Check your connection, or watch it on YouTube.
              </Text>
              <Button size="sm" icon="logo-youtube" label="Open in YouTube" onPress={() => openExternal(watchUrl(videoId))} />
            </View>
          ) : null}

          <Text style={{ color: t.text, fontSize: 21, fontWeight: '800', lineHeight: 28, marginTop: 18 }}>{heading}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
            {channel ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="logo-youtube" size={15} color={t.youtube} />
                <Text style={{ color: t.textSub, fontSize: 13.5, fontWeight: '600' }}>{String(channel)}</Text>
              </View>
            ) : null}
            <Text style={{ color: t.textFaint }}>·</Text>
            <Text style={{ color: t.textDim, fontSize: 13 }}>{honoured(MAHARAJAS[videoMaharaj].short)}</Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
            <Button
              variant="primary"
              color={t.youtube}
              icon={playing ? 'pause' : 'play'}
              label={playing ? 'Pause' : 'Play'}
              onPress={() => { command(playing ? 'pauseVideo' : 'playVideo'); setPlaying(!playing); }}
              disabled={poppedOut}
            />
            {desktop() ? (
              <Button icon="albums-outline" label="Pop out" tooltip="Keep watching in a small always-on-top window" onPress={popOut} disabled={poppedOut} />
            ) : null}
            <Button icon="logo-youtube" label="Open in YouTube" onPress={() => openExternal(watchUrl(videoId))} />
            <Button icon="copy-outline" label="Copy link" onPress={() => navigator.clipboard?.writeText(watchUrl(videoId)).catch(() => {})} />
          </View>

          <Card style={{ marginTop: 20, flexDirection: 'row', alignItems: 'center', gap: 14 }} padding={16}>
            <Ionicons name="moon-outline" size={18} color={t.textSub} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontSize: 13.5, fontWeight: '700' }}>Keep playing in background</Text>
              <Text style={{ color: t.textDim, fontSize: 12, marginTop: 2 }}>
                {backgroundVideoAudio
                  ? 'The video keeps playing when you minimise the window.'
                  : 'The video pauses when you minimise the window.'}
              </Text>
            </View>
            <Switch
              value={backgroundVideoAudio}
              onValueChange={setBackgroundVideoAudio}
              trackColor={{ false: t.borderHi, true: a(t.youtube, 0.55) }}
              thumbColor={backgroundVideoAudio ? t.youtube : t.textDim}
              {...({ activeThumbColor: t.youtube } as any)}
            />
          </Card>
        </View>

        {/* ---------------- side: archive audio + more ---------------- */}
        <View style={{ width: sideW, gap: 16 }}>
          {archiveMatch ? (
            <Card padding={16} style={{ borderColor: a(t.success, 0.45), backgroundColor: a(t.success, t.dark ? 0.07 : 0.05) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="headset" size={16} color={t.success} />
                <Kicker text="Also in the audio archive" color={t.success} />
              </View>
              <Text style={{ color: t.text, fontSize: 14, fontWeight: '700', marginTop: 8 }} numberOfLines={3}>{archiveMatch.recording.title}</Text>
              {archiveMatch.reason ? <Text style={{ color: t.textDim, fontSize: 12, marginTop: 4 }}>Matched on {archiveMatch.reason}</Text> : null}
              <Button
                variant="primary"
                color={t.success}
                icon="play"
                label="Listen as audio"
                onPress={() => listenAsAudio(archiveMatch.recording)}
                style={{ marginTop: 12, alignSelf: 'flex-start' }}
              />
              <Text style={{ color: t.textDim, fontSize: 11.5, marginTop: 10, lineHeight: 16 }}>
                Plays from where you are in the video, with media keys and the Windows media overlay, and can be downloaded for offline listening.
              </Text>
            </Card>
          ) : null}
          {suggestions.length > 0 ? (
            <Card padding={14}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Ionicons name="headset-outline" size={16} color={t.success} />
                <Kicker text="Possible archive audio" color={t.success} />
              </View>
              <Text style={{ color: t.textDim, fontSize: 11.5, lineHeight: 16, marginBottom: 6 }}>
                Not certain these are the same class — pick the right one to play it as audio.
              </Text>
              {suggestions.map((c) => (
                <Hover
                  key={c.recording.id}
                  onPress={() => listenAsAudio(c.recording)}
                  accessibilityLabel={c.recording.title}
                  style={({ hovered }) => ({ flexDirection: 'row', gap: 10, padding: 8, borderRadius: 8, backgroundColor: hovered ? t.hover : 'transparent' })}
                >
                  <Ionicons name="play-circle-outline" size={19} color={t.success} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.text, fontSize: 12.5, fontWeight: '600' }} numberOfLines={2}>{c.recording.title}</Text>
                    {c.reason ? <Text style={{ color: t.textDim, fontSize: 11, marginTop: 2 }}>{c.reason}</Text> : null}
                  </View>
                </Hover>
              ))}
            </Card>
          ) : null}

          <View>
            <Text style={{ color: t.text, fontSize: 15, fontWeight: '800', marginBottom: 10 }}>
              More from {honoured(MAHARAJAS[videoMaharaj].short)}
            </Text>
            {more.loading && !moreVideos.length ? <Spinner /> : null}
            {moreVideos.map((v) => (
              <Hover
                key={v.videoId}
                onPress={() => router.replace(videoHref(v) as any)}
                accessibilityLabel={v.title}
                style={({ hovered }) => ({ flexDirection: 'row', gap: 10, padding: 6, marginHorizontal: -6, borderRadius: 10, backgroundColor: hovered ? t.hover : 'transparent' })}
              >
                <View style={{ width: 150, height: 84, borderRadius: 8, overflow: 'hidden', backgroundColor: t.surfaceHi }}>
                  {v.thumbnail ? <Image source={{ uri: v.thumbnail }} style={{ width: '100%', height: '100%' } as any} /> : null}
                  {v.durationSec != null ? (
                    <View style={{ position: 'absolute', right: 4, bottom: 4, backgroundColor: '#000000cc', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 }}>
                      <Text style={{ color: '#fff', fontSize: 10.5, fontWeight: '700' }}>{formatDuration(v.durationSec)}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: t.text, fontSize: 12.5, fontWeight: '700', lineHeight: 17 }} numberOfLines={3}>{v.title}</Text>
                  <Text style={{ color: t.textDim, fontSize: 11.5, marginTop: 4 }} numberOfLines={1}>{v.channel}</Text>
                  <Text style={{ color: t.textFaint, fontSize: 11, marginTop: 1 }} numberOfLines={1}>{[v.viewsText, v.publishedText].filter(Boolean).join(' · ')}</Text>
                </View>
              </Hover>
            ))}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
