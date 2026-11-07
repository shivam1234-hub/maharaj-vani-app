import React, {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from 'react';
import TrackPlayer, {
  State, Capability, usePlaybackState, useProgress,
} from 'react-native-track-player';
import { Recording } from '../data/types';
import { MAHARAJAS } from '../data/maharajas';
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

export interface AudioActions {
  play: (recording: Recording, localUri?: string | null, startAtMs?: number) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  seek: (ms: number) => Promise<void>;
  stop: () => Promise<void>;
  setSpeed: (speed: number) => Promise<void>;
  skipForward: () => Promise<void>;
  skipBackward: () => Promise<void>;
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
          ],
          notificationCapabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.JumpBackward,
            Capability.JumpForward,
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
      await TrackPlayer.add({
        id: rec.id,
        url,
        title: rec.title,
        artist: MAHARAJAS[rec.maharaj]?.short ?? '',
        album: rec.breadcrumb.join(' / ') || undefined,
        artwork: require('../assets/icon.png'),
      });
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

  const pause = useCallback(() => TrackPlayer.pause().catch(() => {}), []);
  const resume = useCallback(() => TrackPlayer.play().catch(() => {}), []);
  const seek = useCallback(async (ms: number) => {
    await TrackPlayer.seekTo(ms / 1000).catch(() => {});
  }, []);
  const stop = useCallback(async () => {
    await TrackPlayer.reset().catch(() => {});
    setRecording(null);
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
    play, pause, resume, seek, stop, setSpeed, skipForward, skipBackward,
  };

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}

export function useAudio() {
  const ctx = useContext(AudioContext);
  if (!ctx) throw new Error('useAudio must be used within AudioProvider');
  return ctx;
}
