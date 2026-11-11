// The TrackPlayer playback service is registered in index.js (the app entry
// point) so it also runs when Android relaunches only the headless media
// service after the app is killed — that's what keeps the notification
// play/pause controls working. Do NOT register it here: this module only
// evaluates when the UI mounts, so a headless restart would miss it.
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppState, AppStateStatus } from 'react-native';
import { useEffect, useRef } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AudioProvider, useAudio } from '../contexts/AudioContext';
import { DownloadProvider } from '../contexts/DownloadContext';
import { LibraryProvider } from '../contexts/LibraryContext';
import { SettingsProvider } from '../contexts/SettingsContext';
import { HistoryProvider, useHistory } from '../contexts/HistoryContext';
import { MaharajProvider } from '../contexts/MaharajContext';
import MiniPlayer from '../components/MiniPlayer';
import { clearStaleVideoNotifications } from '../utils/videoNotification';

// A deep link (e.g. a media-notification tap, see +native-intent.tsx) can open
// the app straight onto a lecture. Keep Home underneath it so Back works
// instead of closing the app.
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

    // Also save immediately on backgrounding — a force-close never gets
    // another interval tick, and losing the position is what users notice.
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'background' || state === 'inactive') saveNow();
    });

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, []);

  return null;
}

export default function RootLayout() {
  useEffect(() => {
    clearStaleVideoNotifications();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SettingsProvider>
          <MaharajProvider>
            <LibraryProvider>
              <HistoryProvider>
                <DownloadProvider>
                  <AudioProvider>
                    <StatusBar style="light" />
                    <PositionTracker />
                    <Stack
                      screenOptions={{
                        headerStyle: { backgroundColor: '#090c18' },
                        headerShadowVisible: false,
                        headerTintColor: '#fff',
                        headerTitleStyle: { fontSize: 17, fontWeight: '600' },
                        contentStyle: { backgroundColor: '#090c18' },
                      }}
                    >
                      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                      {/* Draws its own header and search field. */}
                      <Stack.Screen name="global-search" options={{ headerShown: false }} />
                      <Stack.Screen
                        name="lecture/[id]"
                        options={{ title: 'Lecture', headerBackTitle: 'Back' }}
                      />
                      <Stack.Screen name="category/[slug]" options={{ headerBackTitle: 'Back' }} />
                      <Stack.Screen name="shastra/[book]" options={{ headerBackTitle: 'Back' }} />
                      <Stack.Screen name="shastra/chapter" options={{ headerBackTitle: 'Back' }} />
                      <Stack.Screen name="shastra/verse" options={{ headerBackTitle: 'Back' }} />
                      <Stack.Screen
                        name="video/[id]"
                        options={{ title: 'Video', headerBackTitle: 'Back' }}
                      />
                    </Stack>
                    <MiniPlayer />
                  </AudioProvider>
                </DownloadProvider>
              </HistoryProvider>
            </LibraryProvider>
          </MaharajProvider>
        </SettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
