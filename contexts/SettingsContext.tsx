import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Single font-size control, scoped to the lecture reading page only (hero,
// tags, details, actions, audio player, and the transcript body itself —
// sloka/translation/transcription). Deliberately does NOT touch any other
// screen (Home, Search, Downloads, History, tab bar) — the control lives on
// the Home screen for easy access, but only the lecture page's own text
// scales when it's adjusted.
const READER_FONT_LEVEL_KEY = 'settings_reader_font_level_v1';

// When on, the YouTube player keeps playing after the app goes to the
// background, so a lecture continues with the phone locked. Off pauses the
// video the moment you leave the app.
//
// This only ever governs the WebView player. The audio archive has real
// background playback (react-native-track-player: foreground service plus
// lock-screen controls) and is unaffected by this setting.
const BACKGROUND_VIDEO_AUDIO_KEY = 'settings_background_video_audio_v1';
const DEFAULT_BACKGROUND_VIDEO_AUDIO = true;

const READER_FONT_SCALES = [0.85, 0.92, 1.0, 1.1, 1.22, 1.36, 1.5];
const DEFAULT_READER_FONT_LEVEL = 2; // index into READER_FONT_SCALES => 1.0

export const READER_FONT_LEVEL_MIN = 0;
export const READER_FONT_LEVEL_MAX = READER_FONT_SCALES.length - 1;

// Reference pt size (at scale 1.0) purely so the stepper UI can show a
// concrete-feeling number ("14pt").
const BASE_READER_FONT = 14;
export const DEFAULT_READER_FONT_SIZE = BASE_READER_FONT;
export const READER_FONT_SIZE_MIN = Math.round(BASE_READER_FONT * READER_FONT_SCALES[READER_FONT_LEVEL_MIN]);
export const READER_FONT_SIZE_MAX = Math.round(BASE_READER_FONT * READER_FONT_SCALES[READER_FONT_LEVEL_MAX]);

function clampReaderLevel(n: number): number {
  if (Number.isNaN(n)) return DEFAULT_READER_FONT_LEVEL;
  return Math.min(READER_FONT_LEVEL_MAX, Math.max(READER_FONT_LEVEL_MIN, Math.round(n)));
}

interface SettingsContextValue {
  /** Multiplier to apply to any base font size on the lecture page only. */
  readerFontScale: number;
  /** Same value expressed as a concrete pt size (for the stepper's "21pt" label). */
  readerFontSize: number;
  increaseReaderFontSize: () => void;
  decreaseReaderFontSize: () => void;
  resetReaderFontSize: () => void;

  /** Whether the YouTube player keeps playing once the app is backgrounded. */
  backgroundVideoAudio: boolean;
  setBackgroundVideoAudio: (on: boolean) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [readerFontLevel, setReaderFontLevel] = useState(DEFAULT_READER_FONT_LEVEL);
  const [backgroundVideoAudio, setBackgroundVideoAudioState] = useState(
    DEFAULT_BACKGROUND_VIDEO_AUDIO,
  );

  useEffect(() => {
    AsyncStorage.getItem(READER_FONT_LEVEL_KEY).then((raw) => {
      if (raw == null) return;
      const parsed = parseInt(raw, 10);
      if (!Number.isNaN(parsed)) setReaderFontLevel(clampReaderLevel(parsed));
    }).catch(() => {});

    AsyncStorage.getItem(BACKGROUND_VIDEO_AUDIO_KEY).then((raw) => {
      if (raw != null) setBackgroundVideoAudioState(raw === '1');
    }).catch(() => {});
  }, []);

  const setBackgroundVideoAudio = useCallback((on: boolean) => {
    setBackgroundVideoAudioState(on);
    AsyncStorage.setItem(BACKGROUND_VIDEO_AUDIO_KEY, on ? '1' : '0').catch(() => {});
  }, []);

  const persist = useCallback((level: number) => {
    AsyncStorage.setItem(READER_FONT_LEVEL_KEY, String(level)).catch(() => {});
  }, []);

  const increaseReaderFontSize = useCallback(() => {
    setReaderFontLevel((prev) => {
      const next = clampReaderLevel(prev + 1);
      persist(next);
      return next;
    });
  }, [persist]);

  const decreaseReaderFontSize = useCallback(() => {
    setReaderFontLevel((prev) => {
      const next = clampReaderLevel(prev - 1);
      persist(next);
      return next;
    });
  }, [persist]);

  const resetReaderFontSize = useCallback(() => {
    setReaderFontLevel(DEFAULT_READER_FONT_LEVEL);
    persist(DEFAULT_READER_FONT_LEVEL);
  }, [persist]);

  const readerFontScale = READER_FONT_SCALES[readerFontLevel];
  const readerFontSize = Math.round(BASE_READER_FONT * readerFontScale);

  const value: SettingsContextValue = useMemo(() => ({
    readerFontScale,
    readerFontSize,
    increaseReaderFontSize,
    decreaseReaderFontSize,
    resetReaderFontSize,
    backgroundVideoAudio,
    setBackgroundVideoAudio,
  }), [
    readerFontScale, readerFontSize,
    increaseReaderFontSize, decreaseReaderFontSize, resetReaderFontSize,
    backgroundVideoAudio, setBackgroundVideoAudio,
  ]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
