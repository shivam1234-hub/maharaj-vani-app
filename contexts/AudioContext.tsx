import React, {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from 'react';
import TrackPlayer, {
  State, Capability, Event, usePlaybackState, useProgress, useTrackPlayerEvents,
} from 'react-native-track-player';
import { Recording } from '../data/types';
import { speakerName } from '../data/maharajas';
import { audioEvents } from '../utils/audioEvents';
import { setNowPlayingId } from '../utils/nowPlaying';
import { getRecordingById } from '../hooks/useLectures';

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
  /**
   * Play several recordings back to back — the Verses tab's "play this
   * chapter in sequence". The player advances on its own, also from the
   * notification's next/previous buttons and with the app closed.
   */
  playQueue: (items: QueueItem[], startIndex?: number) => Promise<void>;
  /** Tracks in the current queue (1 for a single lecture). */
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

function toTrack(rec: Recording, url: string) {
  return {
    id: rec.id,
    url,
    title: rec.title,
    artist: speakerName(rec),
    album: rec.scripture ?? (rec.breadcrumb.join(' / ') || undefined),
    artwork: require('../assets/icon.png'),
  };
}

const AudioContext = createContext<(AudioState & AudioActions) | null>(null);

const SPEEDS = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
export { SPEEDS };

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const playbackState = usePlaybackState();
  const { position, duration } = useProgress(250);

  const [recording, setRecording] = useState<Recording | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeedState] = useState(1.0);
  const [offline, setOffline] = useState(false);

  const speedRef = useRef(1.0);
  const setupDone = useRef(false);
  const [queueLength, setQueueLength] = useState(0);
  const [queueIndex, setQueueIndex] = useState(0);

  // A queue advances inside the native player — follow it here so the
  // mini-player, lecture screen, history and lock screen all show the track
  // actually playing.
  useTrackPlayerEvents([Event.PlaybackActiveTrackChanged], (e) => {
    const id = e.track?.id;
    if (typeof id !== 'string') return;
    if (e.index != null) setQueueIndex(e.index);
    const rec = getRecordingById(id);
    if (!rec) return;
    setRecording((cur) => {
      if (cur?.id === id) return cur;
      audioEvents.emitPlay({ id: rec.id, title: rec.title, type: rec.category, positionMs: 0, durationMs: 0 });
      return rec;
    });
    setNowPlayingId(id);
    setOffline(String(e.track?.url ?? '').startsWith('file:'));
  });

  useEffect(() => {
    if (setupDone.current) return;
    setupDone.current = true;
    // setupPlayer() rejects when the background service is already running
    // (UI killed, audio kept playing). That is not a failure: carry on, set
    // the options, and pick up the track the service is holding.
    TrackPlayer.setupPlayer()
      .catch(() => {})
      .then(() =>
        TrackPlayer.updateOptions({
          capabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.Stop,
            Capability.SeekTo,
            Capability.JumpForward,
            Capability.JumpBackward,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
          ],
          notificationCapabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.JumpBackward,
            Capability.JumpForward,
            Capability.SkipToNext,
          ],
          forwardJumpInterval: 15,
          backwardJumpInterval: 15,
        }),
      )
      .then(() => TrackPlayer.getActiveTrack())
      .then((track) => {
        // Without this the reopened app showed an empty player and no
        // mini-player while the lecture was still audibly playing.
        const rec = typeof track?.id === 'string' ? getRecordingById(track.id) : undefined;
        if (!rec) return;
        setRecording((cur) => cur ?? rec);
        setOffline(String(track?.url ?? '').startsWith('file:'));
        setNowPlayingId(rec.id);
      })
      .catch(() => {});
  }, []);

  const { state } = playbackState;
  const isPlaying = state === State.Playing;
  const isLoading = state === State.Loading || state === State.Buffering;
  const positionMs = Math.round(position * 1000);
  const durationMs = Math.round(duration * 1000);

  const play = useCallback(async (
    rec: Recording,
    localUri?: string | null,
    startAtMs = 0,
  ) => {
    // A downloaded copy is preferred whenever one exists — these lectures run
    // to hundreds of megabytes and the source host is slow.
    const url = localUri ?? rec.url;
    setRecording(rec);
    setNowPlayingId(rec.id);
    setOffline(Boolean(localUri));
    setError(null);
    try {
      await TrackPlayer.reset();
      await TrackPlayer.add(toTrack(rec, url));
      setQueueLength(1);
      setQueueIndex(0);
      if (speedRef.current !== 1.0) await TrackPlayer.setRate(speedRef.current);
      if (startAtMs > 5000) await TrackPlayer.seekTo(startAtMs / 1000);
      await TrackPlayer.play();
      audioEvents.emitPlay({
        id: rec.id,
        title: rec.title,
        type: rec.category,
        positionMs: 0,
        durationMs: 0,
      });
    } catch {
      setError('Could not load this recording');
    }
  }, []);

  const playQueue = useCallback(async (items: QueueItem[], startIndex = 0) => {
    if (!items.length) return;
    const first = items[startIndex] ?? items[0];
    setRecording(first.recording);
    setNowPlayingId(first.recording.id);
    setOffline(Boolean(first.localUri));
    setError(null);
    try {
      await TrackPlayer.reset();
      await TrackPlayer.add(items.map((it) => toTrack(it.recording, it.localUri ?? it.recording.url)));
      setQueueLength(items.length);
      setQueueIndex(startIndex);
      if (startIndex > 0) await TrackPlayer.skip(startIndex);
      if (speedRef.current !== 1.0) await TrackPlayer.setRate(speedRef.current);
      await TrackPlayer.play();
      audioEvents.emitPlay({
        id: first.recording.id,
        title: first.recording.title,
        type: first.recording.category,
        positionMs: 0,
        durationMs: 0,
      });
    } catch {
      setError('Could not load this recording');
    }
  }, []);
  const skipToNext = useCallback(() => TrackPlayer.skipToNext().catch(() => {}), []);
  const skipToPrevious = useCallback(() => TrackPlayer.skipToPrevious().catch(() => {}), []);

  const pause = useCallback(() => TrackPlayer.pause().catch(() => {}), []);
  const resume = useCallback(() => TrackPlayer.play().catch(() => {}), []);
  const seek = useCallback(async (ms: number) => {
    await TrackPlayer.seekTo(ms / 1000).catch(() => {});
  }, []);
  const stop = useCallback(async () => {
    await TrackPlayer.reset().catch(() => {});
    setRecording(null);
    setQueueLength(0);
    setNowPlayingId(null);
    setError(null);
    setOffline(false);
  }, []);
  const setSpeed = useCallback(async (s: number) => {
    speedRef.current = s;
    setSpeedState(s);
    await TrackPlayer.setRate(s).catch(() => {});
  }, []);
  const skipForward = useCallback(() => TrackPlayer.seekBy(15).catch(() => {}), []);
  const skipBackward = useCallback(() => TrackPlayer.seekBy(-15).catch(() => {}), []);

  const value: AudioState & AudioActions = {
    recording,
    isPlaying,
    isLoading,
    positionMs,
    durationMs,
    speed,
    error,
    offline,
    queueLength,
    queueIndex,
    play, playQueue, skipToNext, skipToPrevious,
    pause, resume, seek, stop, setSpeed, skipForward, skipBackward,
  };

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}

export function useAudio() {
  const ctx = useContext(AudioContext);
  if (!ctx) throw new Error('useAudio must be used within AudioProvider');
  return ctx;
}
