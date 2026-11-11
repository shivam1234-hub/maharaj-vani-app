/**
 * Desktop (web/Electron) root layout. Same providers as app/_layout.tsx, but
 * the screens render inside the desktop Shell — sidebar, top bar, persistent
 * now-playing bar — instead of a phone stack with a floating mini-player.
 */
import { Stack } from 'expo-router';
import { useEffect, useRef } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AudioProvider, useAudio } from '../contexts/AudioContext';
import { DownloadProvider } from '../contexts/DownloadContext';
import { LibraryProvider } from '../contexts/LibraryContext';
import { SettingsProvider } from '../contexts/SettingsContext';
import { HistoryProvider, useHistory } from '../contexts/HistoryContext';
import { MaharajProvider } from '../contexts/MaharajContext';
import { DesktopThemeProvider, useTheme } from '../components/desktop/theme';
import { MenuHost } from '../components/desktop/kit';
import Shell from '../components/desktop/Shell';

export const unstable_settings = { initialRouteName: '(tabs)' };

/** Persists playback position so every lecture can be resumed where it stopped. */
function PositionTracker() {
  const audio = useAudio();
  const { updatePosition } = useHistory();
  const audioRef = useRef(audio);
  audioRef.current = audio;
  const updateRef = useRef(updatePosition);
  updateRef.current = updatePosition;

  useEffect(() => {
    const saveNow = () => {
      const { recording, positionMs, durationMs } = audioRef.current;
      if (recording && positionMs > 5000) updateRef.current(recording.id, positionMs, durationMs);
    };
    const interval = setInterval(() => {
      if (audioRef.current.isPlaying) saveNow();
    }, 5000);
    // Closing the window never gets another interval tick.
    window.addEventListener('beforeunload', saveNow);
    document.addEventListener('visibilitychange', saveNow);
    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', saveNow);
      document.removeEventListener('visibilitychange', saveNow);
    };
  }, []);
  return null;
}

function Routed() {
  const t = useTheme();
  return (
    <MenuHost>
      <Shell>
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'none',
            contentStyle: { backgroundColor: t.bg },
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="global-search" />
          <Stack.Screen name="lecture/[id]" />
          <Stack.Screen name="category/[slug]" />
          <Stack.Screen name="shastra/[book]" />
          <Stack.Screen name="shastra/chapter" />
          <Stack.Screen name="shastra/verse" />
          <Stack.Screen name="video/[id]" />
        </Stack>
      </Shell>
    </MenuHost>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <MaharajProvider>
          <DesktopThemeProvider>
            <LibraryProvider>
              <HistoryProvider>
                <DownloadProvider>
                  <AudioProvider>
                    <PositionTracker />
                    <Routed />
                  </AudioProvider>
                </DownloadProvider>
              </HistoryProvider>
            </LibraryProvider>
          </DesktopThemeProvider>
        </MaharajProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
