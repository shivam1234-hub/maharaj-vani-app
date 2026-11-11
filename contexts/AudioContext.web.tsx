import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { Recording } from '../data/types';
import { speakerName } from '../data/maharajas';
import { audioEvents } from '../utils/audioEvents';
import { setNowPlayingId } from '../utils/nowPlaying';
import { getRecordingById } from '../hooks/useLectures';
import { desktop } from '../utils/desktopBridge';

/**
 * Web/desktop audio.
 *
 * react-native-track-player's web shim throws at require-time in the
 * installed alpha (its enums import the native module unconditionally), so on
 * web a plain <audio> element plays the catalogue's direct MP3 URL — or the
 * downloaded copy served by the desktop shell. Metro picks this file over
 * AudioContext.tsx via the `.web` extension; the exported shape matches the
 * native one so every screen works unmodified, plus a few desktop extras
 * (volume, the queue itself, mute) used by the desktop now-playing bar.
 *
 * Lock-screen controls become the Media Session API, which Chromium hands to
 * the Windows media overlay and the hardware media keys.
 */

export interface AudioState {
  recording: Recording | null;
  isPlaying: boolean;
  isLoading: boolean;
  positionMs: number;
  durationMs: number;
  speed: number;
  error: string | null;
  /** True when playing bytes from disk rather than the network. */
  offline: boolean;
}

export interface QueueItem {
  recording: Recording;
  localUri?: string | null;
}

export interface AudioActions {
  play: (recording: Recording, localUri?: string | null, startAtMs?: number) => Promise<void>;
  playQueue: (items: QueueItem[], startIndex?: number) => Promise<void>;
  queueLength: number;
  queueIndex: number;
  skipToNext: () => Promise<void>;
  skipToPrevious: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  seek: (ms: number) => Promise<void>;
  stop: () => Promise<void>;
  setSpeed: (speed: number) => Promise<void>;
  skipForward: () => Promise<void>;
  skipBackward: () => Promise<void>;
}

/** Desktop-only extras (not on the native context). */
export interface DesktopAudioExtras {
  queue: QueueItem[];
  volume: number;
  muted: boolean;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  playAt: (index: number) => Promise<void>;
}

const SPEEDS = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
export { SPEEDS };

type Meta = Omit<AudioState, 'positionMs' | 'durationMs'> & AudioActions & DesktopAudioExtras;
interface Position { positionMs: number; durationMs: number }

const MetaContext = createContext<Meta | null>(null);
const PositionContext = createContext<Position>({ positionMs: 0, durationMs: 0 });

const LAST_KEY = 'vv_desktop_last_track_v1';
const VOLUME_KEY = 'vv_desktop_volume_v1';
const SPEED_KEY = 'vv_desktop_speed_v1';

function readLS(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function writeLS(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch {}
}

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const elRef = useRef<HTMLAudioElement | null>(null);
  if (!elRef.current && typeof Audio !== 'undefined') {
    elRef.current = new Audio();
    elRef.current.preload = 'auto';
  }

  const [recording, setRecording] = useState<Recording | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [speed, setSpeedState] = useState(() => {
    const s = Number(readLS(SPEED_KEY));
    return SPEEDS.includes(s) ? s : 1.0;
  });
  const [volume, setVolumeState] = useState(() => {
    const v = Number(readLS(VOLUME_KEY));
    return Number.isFinite(v) && v > 0 && v <= 1 ? v : 1;
  });
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  const queueRef = useRef<QueueItem[]>([]);
  queueRef.current = queue;
  const indexRef = useRef(0);
  indexRef.current = queueIndex;
  const speedRef = useRef(speed);
  speedRef.current = speed;
  /** A restored-but-not-loaded track: resume() loads it and seeks here. */
  const pendingRef = useRef<{ rec: Recording; startMs: number } | null>(null);

  const el = elRef.current;

  useEffect(() => {
    if (!el) return;
    el.volume = volume;
    el.muted = muted;
  }, [el, volume, muted]);

  // ------------------------------------------------------------ core loader

  const load = useCallback(async (item: QueueItem, startAtMs: number, autoplay: boolean) => {
    const a = elRef.current;
    if (!a) return;
    const rec = item.recording;
    pendingRef.current = null;
    setRecording(rec);
    setNowPlayingId(rec.id);
    setOffline(Boolean(item.localUri));
    setError(null);
    setPositionMs(startAtMs);
    setDurationMs(0);
    setIsLoading(true);
    a.src = item.localUri ?? rec.url;
    a.playbackRate = speedRef.current;
    if (startAtMs > 5000) {
      const seekTo = startAtMs / 1000;
      const onMeta = () => {
        try { a.currentTime = seekTo; } catch {}
      };
      a.addEventListener('loadedmetadata', onMeta, { once: true });
    }
    writeLS(LAST_KEY, JSON.stringify({ id: rec.id, positionMs: startAtMs }));
    if (!autoplay) return;
    try {
      await a.play();
      audioEvents.emitPlay({ id: rec.id, title: rec.title, type: rec.category, positionMs: 0, durationMs: 0 });
    } catch (e: any) {
      // An interrupted play() (a newer track was chosen) is not an error.
      if (e?.name !== 'AbortError') setError('Could not load this recording');
      setIsLoading(false);
    }
  }, []);

  // ------------------------------------------------------------ element events

  useEffect(() => {
    const a = elRef.current;
    if (!a) return;
    let lastSaved = 0;
    const onTime = () => {
      const ms = Math.round(a.currentTime * 1000);
      setPositionMs(ms);
      const rec = queueRef.current[indexRef.current]?.recording;
      if (rec && Math.abs(ms - lastSaved) > 5000) {
        lastSaved = ms;
        writeLS(LAST_KEY, JSON.stringify({ id: rec.id, positionMs: ms }));
      }
    };
    const onDuration = () =>
      setDurationMs(Number.isFinite(a.duration) ? Math.round(a.duration * 1000) : 0);
    const onPlay = () => { setIsPlaying(true); setError(null); };
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => setIsLoading(true);
    const onReady = () => setIsLoading(false);
    const onEnded = () => {
      const next = indexRef.current + 1;
      if (next < queueRef.current.length) {
        setQueueIndex(next);
        load(queueRef.current[next], 0, true);
      } else {
        setIsPlaying(false);
      }
    };
    const onError = () => {
      if (!a.getAttribute('src')) return;
      setIsLoading(false);
      setError('Could not load this recording');
    };
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('durationchange', onDuration);
    a.addEventListener('loadedmetadata', onDuration);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('waiting', onWaiting);
    a.addEventListener('canplay', onReady);
    a.addEventListener('playing', onReady);
    a.addEventListener('ended', onEnded);
    a.addEventListener('error', onError);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('durationchange', onDuration);
      a.removeEventListener('loadedmetadata', onDuration);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('waiting', onWaiting);
      a.removeEventListener('canplay', onReady);
      a.removeEventListener('playing', onReady);
      a.removeEventListener('ended', onEnded);
      a.removeEventListener('error', onError);
    };
  }, [load]);

  // Bring back the last lecture, paused, so the now-playing bar and "resume"
  // are there after a restart (the phone gets this from its media service).
  useEffect(() => {
    const raw = readLS(LAST_KEY);
    if (!raw) return;
    try {
      const { id, positionMs: pos } = JSON.parse(raw);
      const rec = typeof id === 'string' ? getRecordingById(id) : undefined;
      if (!rec) return;
      pendingRef.current = { rec, startMs: Number(pos) || 0 };
      setRecording(rec);
      setQueue([{ recording: rec }]);
      setQueueIndex(0);
      setPositionMs(Number(pos) || 0);
      setNowPlayingId(rec.id);
    } catch {}
  }, []);

  // ------------------------------------------------------------ actions

  const play = useCallback(async (rec: Recording, localUri?: string | null, startAtMs = 0) => {
    const item = { recording: rec, localUri: localUri ?? null };
    setQueue([item]);
    setQueueIndex(0);
    queueRef.current = [item];
    indexRef.current = 0;
    await load(item, startAtMs, true);
  }, [load]);

  const playQueue = useCallback(async (items: QueueItem[], startIndex = 0) => {
    if (!items.length) return;
    const i = Math.min(Math.max(0, startIndex), items.length - 1);
    setQueue(items);
    setQueueIndex(i);
    queueRef.current = items;
    indexRef.current = i;
    await load(items[i], 0, true);
  }, [load]);

  const playAt = useCallback(async (index: number) => {
    const items = queueRef.current;
    if (!items[index]) return;
    setQueueIndex(index);
    indexRef.current = index;
    await load(items[index], 0, true);
  }, [load]);

  const skipToNext = useCallback(async () => {
    const i = indexRef.current + 1;
    if (i < queueRef.current.length) await playAt(i);
  }, [playAt]);

  const skipToPrevious = useCallback(async () => {
    const a = elRef.current;
    // Like any media player: "previous" restarts the track unless you are
    // right at its start.
    if (a && a.currentTime > 5) { a.currentTime = 0; return; }
    const i = indexRef.current - 1;
    if (i >= 0) await playAt(i);
    else if (a) a.currentTime = 0;
  }, [playAt]);

  const pause = useCallback(async () => { elRef.current?.pause(); }, []);

  const resume = useCallback(async () => {
    const pending = pendingRef.current;
    if (pending) {
      await load({ recording: pending.rec }, pending.startMs, true);
      return;
    }
    await elRef.current?.play().catch(() => {});
  }, [load]);

  const seek = useCallback(async (ms: number) => {
    const a = elRef.current;
    const pending = pendingRef.current;
    if (pending) {
      await load({ recording: pending.rec }, ms, true);
      return;
    }
    if (a) a.currentTime = Math.max(0, ms / 1000);
    setPositionMs(Math.max(0, ms));
  }, [load]);

  const stop = useCallback(async () => {
    const a = elRef.current;
    pendingRef.current = null;
    if (a) {
      a.pause();
      a.removeAttribute('src');
      a.load();
    }
    setRecording(null);
    setQueue([]);
    setQueueIndex(0);
    setNowPlayingId(null);
    setError(null);
    setOffline(false);
    setPositionMs(0);
    setDurationMs(0);
    try { window.localStorage.removeItem(LAST_KEY); } catch {}
  }, []);

  const setSpeed = useCallback(async (s: number) => {
    setSpeedState(s);
    speedRef.current = s;
    if (elRef.current) elRef.current.playbackRate = s;
    writeLS(SPEED_KEY, String(s));
  }, []);

  const skipForward = useCallback(async () => {
    const a = elRef.current;
    if (a && a.getAttribute('src')) a.currentTime = Math.min(a.duration || Infinity, a.currentTime + 15);
  }, []);
  const skipBackward = useCallback(async () => {
    const a = elRef.current;
    if (a && a.getAttribute('src')) a.currentTime = Math.max(0, a.currentTime - 15);
  }, []);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolumeState(clamped);
    setMuted(clamped === 0);
    if (clamped > 0) writeLS(VOLUME_KEY, String(clamped));
  }, []);
  const toggleMute = useCallback(() => setMuted((m) => !m), []);

  // ------------------------------------------------------------ desktop integration

  const actionsRef = useRef({ pause, resume, seek, stop, setSpeed, skipForward, skipBackward, skipToNext, skipToPrevious });
  actionsRef.current = { pause, resume, seek, stop, setSpeed, skipForward, skipBackward, skipToNext, skipToPrevious };
  const stateRef = useRef({ isPlaying, speed, hasTrack: false });
  stateRef.current = { isPlaying, speed, hasTrack: Boolean(recording) };

  // Media Session → Windows media overlay + hardware media keys.
  useEffect(() => {
    const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
    if (!ms) return;
    const set = (action: MediaSessionAction, handler: ((d?: any) => void) | null) => {
      try { ms.setActionHandler(action, handler as any); } catch {}
    };
    set('play', () => actionsRef.current.resume());
    set('pause', () => actionsRef.current.pause());
    set('stop', () => actionsRef.current.stop());
    set('seekbackward', () => actionsRef.current.skipBackward());
    set('seekforward', () => actionsRef.current.skipForward());
    set('seekto', (d: any) => {
      if (typeof d?.seekTime === 'number') actionsRef.current.seek(d.seekTime * 1000);
    });
    set('previoustrack', () => actionsRef.current.skipToPrevious());
    set('nexttrack', () => actionsRef.current.skipToNext());
    return () => {
      for (const a of ['play', 'pause', 'stop', 'seekbackward', 'seekforward', 'seekto', 'previoustrack', 'nexttrack'] as MediaSessionAction[]) set(a, null);
    };
  }, []);

  useEffect(() => {
    const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
    if (!ms) return;
    if (!recording) {
      ms.metadata = null;
      return;
    }
    try {
      const art: any = require('../assets/icon.png');
      const src = typeof art === 'string' ? art : art?.uri ?? art?.default;
      ms.metadata = new MediaMetadata({
        title: recording.title,
        artist: speakerName(recording),
        album: queue.length > 1 ? `Lecture ${queueIndex + 1} of ${queue.length}` : 'Vaishnava Vani',
        artwork: src ? [{ src, sizes: '1024x1024', type: 'image/png' }] : [],
      });
    } catch {}
  }, [recording, queue.length, queueIndex]);

  useEffect(() => {
    const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
    if (!ms) return;
    ms.playbackState = recording ? (isPlaying ? 'playing' : 'paused') : 'none';
  }, [isPlaying, recording]);

  useEffect(() => {
    const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
    if (!ms?.setPositionState || durationMs <= 0) return;
    try {
      ms.setPositionState({
        duration: durationMs / 1000,
        playbackRate: speed,
        position: Math.min(positionMs, durationMs) / 1000,
      });
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationMs, speed, Math.floor(positionMs / 1000)]);

  const runCommand = useCallback((command: string) => {
    const a = actionsRef.current;
    const { isPlaying: playing, speed: current, hasTrack } = stateRef.current;
    if (!hasTrack) return;
    switch (command) {
      case 'playPause': playing ? a.pause() : a.resume(); break;
      case 'back15': a.skipBackward(); break;
      case 'forward15': a.skipForward(); break;
      case 'previous': a.skipToPrevious(); break;
      case 'next': a.skipToNext(); break;
      case 'speedUp': a.setSpeed(stepSpeed(current, 1)); break;
      case 'speedDown': a.setSpeed(stepSpeed(current, -1)); break;
      case 'speedReset': a.setSpeed(1.0); break;
      case 'stop': a.stop(); break;
    }
  }, []);

  // Menu commands (desktop/main.js).
  useEffect(() => desktop()?.onCommand(runCommand), [runCommand]);

  // Bare-key shortcuts, bound here rather than as menu accelerators so they
  // stay out of the way while a text field has focus.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const isTyping = () => {
      const t = document.activeElement as HTMLElement | null;
      if (!t) return false;
      if (t.isContentEditable) return true;
      return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTyping()) return;
      if (!stateRef.current.hasTrack) return;
      let command: string | null = null;
      if (e.code === 'Space') command = 'playPause';
      else if (e.key === 'ArrowLeft') command = e.shiftKey ? 'speedDown' : 'back15';
      else if (e.key === 'ArrowRight') command = e.shiftKey ? 'speedUp' : 'forward15';
      if (!command) return;
      e.preventDefault();
      runCommand(command);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [runCommand]);

  const meta = useMemo<Meta>(() => ({
    recording, isPlaying, isLoading, speed, error, offline,
    queue, queueLength: queue.length, queueIndex,
    volume, muted,
    play, playQueue, playAt, skipToNext, skipToPrevious,
    pause, resume, seek, stop, setSpeed, skipForward, skipBackward,
    setVolume, toggleMute,
  }), [
    recording, isPlaying, isLoading, speed, error, offline, queue, queueIndex, volume, muted,
    play, playQueue, playAt, skipToNext, skipToPrevious, pause, resume, seek, stop, setSpeed,
    skipForward, skipBackward, setVolume, toggleMute,
  ]);
  const pos = useMemo<Position>(() => ({ positionMs, durationMs }), [positionMs, durationMs]);

  return (
    <MetaContext.Provider value={meta}>
      <PositionContext.Provider value={pos}>{children}</PositionContext.Provider>
    </MetaContext.Provider>
  );
}

/** Same shape as the native hook (re-renders on every position tick). */
export function useAudio(): AudioState & AudioActions & DesktopAudioExtras {
  const meta = useContext(MetaContext);
  if (!meta) throw new Error('useAudio must be used within AudioProvider');
  const pos = useContext(PositionContext);
  return { ...meta, positionMs: pos.positionMs, durationMs: pos.durationMs };
}

/** Everything except the ticking position — for lists that only need "is this playing". */
export function useAudioMeta(): Meta {
  const meta = useContext(MetaContext);
  if (!meta) throw new Error('useAudioMeta must be used within AudioProvider');
  return meta;
}

export function useAudioPosition(): Position {
  return useContext(PositionContext);
}

function stepSpeed(current: number, direction: 1 | -1): number {
  const idx = SPEEDS.indexOf(current);
  const from = idx >= 0 ? idx : SPEEDS.indexOf(1.0);
  return SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, from + direction))];
}
