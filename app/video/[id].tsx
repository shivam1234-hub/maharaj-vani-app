import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, AppState, AppStateStatus, Linking, StyleSheet, Switch,
  Text, TouchableOpacity, View, useWindowDimensions,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useAudio } from '../../contexts/AudioContext';
import { useSettings } from '../../contexts/SettingsContext';
import { YT_PREFIX, useHistory } from '../../contexts/HistoryContext';
import { useDownload } from '../../contexts/DownloadContext';
import { useMaharaj } from '../../contexts/MaharajContext';
import { findArchiveCandidates } from '../../utils/matchArchive';
import {
  PipState, enterPip, isPipAllowed, isPipSupported, isPipWindow, onPipAction,
  onPipModeChanged, openPipSettings, setPipEnabled, setPipPlaying, getPipState } from '../../utils/pip';
import { MaharajKey, Recording } from '../../data/types';
import { MAHARAJAS, MAHARAJ_ORDER } from '../../data/maharajas';
import * as Notifications from 'expo-notifications';
import {
  PAUSE_SCRIPT, PLAY_SCRIPT, YOUTUBE_EMBED_ORIGIN, watchUrl, youtubeEmbedHtml,
} from '../../utils/youtube';
import {
  ACTION_PAUSE, ACTION_RESUME, clearVideoNotification,
  prepareVideoNotifications, showVideoNotification,
} from '../../utils/videoNotification';

/**
 * YouTube playback through the official embedded player.
 *
 * The embed is hosted in an iframe inside our own wrapper document rather than
 * loaded as the WebView's top-level page — see YOUTUBE_EMBED_ORIGIN in
 * utils/youtube.ts. Loading it directly is what produces YouTube's
 * "Video player configuration error".
 */
export default function VideoScreen() {
  const { id, title, start, channel, thumb } = useLocalSearchParams<{
    id: string; title?: string; start?: string; channel?: string; thumb?: string;
  }>();
  const navigation = useNavigation();
  const audio = useAudio();
  const { backgroundVideoAudio, setBackgroundVideoAudio } = useSettings();
  const { recordVideoPlay, updatePosition, historyMap } = useHistory();
  const { getLocalUri } = useDownload();
  const { active } = useMaharaj();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  // Mirrors playingRef for rendering. The ref stays the source of truth for
  // callbacks that must not re-subscribe on every state change.
  const [isPlaying, setIsPlaying] = useState(true);

  const webRef = useRef<WebView>(null);
  const pauseVideo = useCallback(() => {
    webRef.current?.injectJavaScript(PAUSE_SCRIPT);
  }, []);
  const playVideo = useCallback(() => {
    webRef.current?.injectJavaScript(PLAY_SCRIPT);
  }, []);

  // Reported by the wrapper page from the player's own state events, so the
  // notification button says Pause vs Play correctly.
  const playingRef = useRef(false);
  // Id of the posted notification, so it can be replaced and dismissed.
  const notifIdRef = useRef<string | null>(null);
  const titleRef = useRef('');
  const durationRef = useRef(0);
  const lastSavedRef = useRef(0);
  // Seconds into the video, reported by the player, so a handover to the
  // archive recording resumes where you were rather than restarting.
  const currentTimeRef = useRef(0);

  // Driven by the activity's own onPictureInPictureModeChanged; the size
  // check is only a fallback, since RN does not re-report window dimensions
  // for the PiP resize.
  const togglePlayback = useCallback(() => {
    const next = !playingRef.current;
    if (next) playVideo();
    else pauseVideo();
    playingRef.current = next;
    setIsPlaying(next);
    setPipPlaying(next);
  }, [playVideo, pauseVideo]);

  const [pip, setPip] = useState<PipState>({ inPip: false, width: 0, height: 0 });
  // Read from the AppState handler, which must decide on the way out whether
  // the video went into the floating window or was hidden outright.
  const inPipRef = useRef(false);
  useEffect(
    () =>
      onPipModeChanged((st) => {
        inPipRef.current = st.inPip;
        setPip(st);
      }),
    [],
  );
  // The event above can be missed, which left the floating window showing
  // the whole screen shrunk. Ask the activity directly as well, a few times
  // around each background/foreground switch (the window animates in).
  useEffect(() => {
    const check = () => {
      const st = getPipState();
      if (!st) return;
      if (st.inPip !== inPipRef.current || (st.inPip && st.width > 0)) {
        inPipRef.current = st.inPip;
        setPip((prev) =>
          prev.inPip === st.inPip && prev.width === st.width && prev.height === st.height ? prev : st,
        );
      }
    };
    const timers: ReturnType<typeof setTimeout>[] = [];
    const sub = AppState.addEventListener('change', () => {
      timers.forEach(clearTimeout);
      timers.length = 0;
      [0, 250, 700, 1500].forEach((ms) => timers.push(setTimeout(check, ms)));
    });
    return () => {
      sub.remove();
      timers.forEach(clearTimeout);
    };
  }, []);

  // The floating window's button is ours to service: it broadcasts back
  // here rather than controlling the player directly.
  useEffect(
    () =>
      onPipAction(() => {
        // The native side has already paused or resumed the WebView; only the
        // on-screen button state needs catching up here. Re-issuing the JS
        // command would be queued until the app resumes and could then undo
        // what the native toggle just did.
        const next = !playingRef.current;
        playingRef.current = next;
        setIsPlaying(next);
      }),
    [],
  );
  const inPip = pip.inPip || isPipWindow(width, height);
  const pipAvailable = useMemo(() => isPipSupported(), []);
  // Re-checked whenever the app comes back to the foreground, since the
  // usual way to fix it is a trip to system settings.
  const [pipAllowed, setPipAllowed] = useState(() => isPipAllowed());
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') setPipAllowed(isPipAllowed());
    });
    return () => sub.remove();
  }, []);

  const floatNow = useCallback(async () => {
    if (!isPipAllowed()) {
      Alert.alert(
        'Floating window is turned off',
        'Picture-in-picture is switched off for Vaishnava Vani in your phone settings. ' +
          'Turn it on to keep the video playing in a small window.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open settings', onPress: openPipSettings },
        ],
      );
      return;
    }
    const ok = await enterPip();
    if (!ok) {
      Alert.alert(
        'Could not open the floating window',
        'Your phone refused picture-in-picture just now (it is not available in split-screen, ' +
          'and some phones need it allowed in settings).',
        [
          { text: 'OK', style: 'cancel' },
          { text: 'Open settings', onPress: openPipSettings },
        ],
      );
    }
  }, []);

  const videoId = String(id ?? '');

  // Where to open the video. An explicit ?start= (tapping a history row) wins;
  // otherwise pick up wherever this video was last left. Computed once —
  // re-deriving it would reload the player mid-watch.
  const [startSec] = useState(() => {
    const explicit = Number(start);
    if (!Number.isNaN(explicit) && explicit > 0) return Math.floor(explicit);
    const prev = historyMap.get(YT_PREFIX + String(id ?? ''));
    const secs = prev ? Math.floor(prev.positionMs / 1000) : 0;
    // Right at the end means "watched"; start it over rather than at the credits.
    if (prev && prev.durationMs > 0 && secs > prev.durationMs / 1000 - 15) return 0;
    return secs;
  });
  const heading = title ? String(title) : 'Video';
  titleRef.current = heading;

  // The YouTube embed pauses itself whenever the page is hidden (its own
  // script hooks the Page Visibility API — that is how YouTube reserves
  // background playback for Premium), and it sits in a cross-origin iframe so
  // there is nothing we can override. The archive MP3 of the same lecture has
  // no such limit and plays through track-player, which owns a foreground
  // service and a real media notification. So offer that instead.
  // Match against the Maharaja the VIDEO is by, not whoever is selected in
  // the app: a Lokanath Swami video opened from global search or history was
  // being matched against Gour Govinda Swami's archive and offered his classes.
  const videoMaharaj: MaharajKey = useMemo(() => {
    const hay = `${heading} ${channel ?? ''}`;
    return (
      MAHARAJ_ORDER.find((k) => MAHARAJAS[k].youtube.match.test(hay)) ??
      MAHARAJ_ORDER.find((k) =>
        MAHARAJAS[k].youtube.channels.some((c) => c.name === String(channel ?? '')),
      ) ??
      active
    );
  }, [heading, channel, active]);
  const candidates = useMemo(
    () => (heading && heading !== 'Video' ? findArchiveCandidates(heading, videoMaharaj, 4) : []),
    [heading, videoMaharaj],
  );
  // Only a verse or exact-date hit is presented as "this lecture". Anything
  // weaker is offered as a short pick-one list rather than asserted.
  const archiveMatch = candidates[0]?.confident ? candidates[0] : null;
  const suggestions = archiveMatch ? [] : candidates;

  const listenInBackground = (rec: Recording) => {
    pauseVideo();
    audio.play(rec, getLocalUri(rec.id), 0);
    router.push(`/lecture/${rec.id}`);
  };

  useEffect(() => {
    navigation.setOptions({ title: 'Video', headerShown: !fullscreen && !inPip });
  }, [navigation, fullscreen, inPip]);

  // Two audio streams at once is never wanted: hand the ears to the video.
  useEffect(() => {
    if (audio.isPlaying) audio.pause();
    // Deliberately only on mount — the user may restart our own player later
    // from the mini player, and that should not be undone here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The activity is pinned to portrait in AndroidManifest.xml, so the player's
  // own expand button cannot rotate the phone by itself. A runtime lock
  // overrides the manifest, and only while the video is expanded.
  useEffect(() => {
    ScreenOrientation.lockAsync(
      fullscreen
        ? ScreenOrientation.OrientationLock.LANDSCAPE
        : ScreenOrientation.OrientationLock.PORTRAIT_UP,
    ).catch(() => {});
  }, [fullscreen]);

  // Always return the rest of the app to portrait, including on an unmount
  // that skips the back button.
  useEffect(() => () => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }, []);

  // Arm PiP for as long as the video screen is up, so pressing Home shrinks
  // the player into a floating window instead of hiding it. That is what keeps
  // the lecture playing: in PiP the page is still visible, so the embed's own
  // visibility-pause never fires. Disarmed on the way out so leaving any other
  // screen behaves normally.
  useEffect(() => {
    // Armed whenever background play is on, archive match or not. This used
    // to be disarmed for videos with an archive match, so pressing Home
    // silently swapped the video for archive audio and no floating window
    // ever appeared, which read as "floating video is not working". The
    // archive hand-over now happens only when the floating window can't
    // open (see the AppState handler below).
    setPipEnabled(backgroundVideoAudio);
    return () => setPipEnabled(false);
  }, [backgroundVideoAudio]);

  // Channel, action buttons and the Android 13+ notification permission are
  // set up here, on mount, while the app is in the FOREGROUND. Doing it at
  // the moment of backgrounding — as this first did — cannot work: Android
  // will not show a permission dialog to an app on its way out, so the
  // request never resolved and no notification was ever posted.
  useEffect(() => {
    if (backgroundVideoAudio) prepareVideoNotifications();
  }, [backgroundVideoAudio]);

  // An Android WebView keeps playing its media once the activity goes to the
  // background. That is what makes "listen with the phone locked" work, so
  // with backgroundVideoAudio on we leave playback alone and instead post a
  // notification carrying transport buttons — without one there would be no
  // way to stop the audio short of force-closing the app. With the setting
  // off, we simply pause on the way out.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state: AppStateStatus) => {
      const leaving = state === 'background' || state === 'inactive';

      // Entering the floating window ALSO reports the app as leaving, and the
      // PiP event can land a moment after. Give it that moment before deciding
      // whether the video was floated or hidden.
      if (leaving) {
        await new Promise((r) => setTimeout(r, 700));
        if (AppState.currentState === 'active') return;
      }
      const floating = inPipRef.current;

      if (!backgroundVideoAudio) {
        // A float the user asked for with the button keeps playing; only a
        // real exit pauses.
        if (leaving && !floating) pauseVideo();
        return;
      }

      if (leaving) {
        if (floating) {
          // Playing in the floating window. Post transport buttons so there
          // is a way to stop it from the notification shade too.
          notifIdRef.current = await showVideoNotification(
            titleRef.current,
            playingRef.current !== false,
          );
          return;
        }

        // Hand over to the archive recording when we have one. track-player
        // owns a foreground service and a real MediaSession, so the lecture
        // keeps going with the screen locked and gets proper lock-screen
        // controls — neither of which the YouTube embed can do, since it
        // pauses itself the moment its page is hidden.
        if (archiveMatch) {
          pauseVideo();
          const rec = archiveMatch.recording;
          audio.play(rec, getLocalUri(rec.id), currentTimeRef.current * 1000);
          return; // track-player posts its own media notification
        }

        // No floating window and no archive copy: post transport buttons so
        // whatever is still playing can be stopped.
        //
        // Deliberately NOT gated on a known-playing state: the player's state
        // handshake is best-effort, and when it stays quiet the notification
        // would never appear at all.
        notifIdRef.current = await showVideoNotification(
          titleRef.current,
          playingRef.current !== false,
        );
      } else if (state === 'active') {
        // Back in the app: the on-screen controls take over.
        await clearVideoNotification(notifIdRef.current);
        notifIdRef.current = null;
      }
    });
    return () => sub.remove();
  }, [pauseVideo, backgroundVideoAudio, archiveMatch, audio, getLocalUri]);

  // Notification buttons arrive here. `opensAppToForeground: false` means the
  // app stays where it is, so the WebView is still mounted and injectable.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(async (resp) => {
      const action = resp.actionIdentifier;
      if (action === ACTION_PAUSE) {
        pauseVideo();
        playingRef.current = false;
        notifIdRef.current = await showVideoNotification(titleRef.current, false);
      } else if (action === ACTION_RESUME) {
        playVideo();
        playingRef.current = true;
        notifIdRef.current = await showVideoNotification(titleRef.current, true);
      }
    });
    return () => sub.remove();
  }, [pauseVideo, playVideo]);

  // Never leave a stale transport notification behind.
  useEffect(() => () => {
    clearVideoNotification(notifIdRef.current);
    if (currentTimeRef.current > 0) {
      updatePosition(
        YT_PREFIX + videoId,
        currentTimeRef.current * 1000,
        durationRef.current * 1000,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Same for navigating away — switching tabs leaves this screen mounted, so
  // it would otherwise keep playing behind whatever you moved to.
  // Gated on the setting: this used to fire unconditionally, which paused the
  // video on the way out even with background audio switched ON — the setting
  // appeared to do nothing.
  useFocusEffect(
    useCallback(() => () => {
      if (!backgroundVideoAudio) pauseVideo();
    }, [pauseVideo, backgroundVideoAudio]),
  );

  // `onError` only covers the wrapper document, which always loads. If the
  // iframe never reports back — no connection, or YouTube hanging — fall
  // through to the "Open in YouTube" escape hatch instead of spinning forever.
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => {
      setLoading(false);
      setFailed(true);
    }, 15000);
    return () => clearTimeout(t);
  }, [loading, videoId]);

  const openExternally = () => {
    Linking.openURL(watchUrl(videoId)).catch(() => {});
  };

  // Letterbox a 16:9 stage so expanding gives a genuinely bigger picture
  // rather than a stretched one.

  // In PiP the stage must be sized by FLEX, not pixels. RN never re-reports
  // `useWindowDimensions` for the PiP resize, so a pixel-sized stage stays at
  // full-screen dimensions inside a ~228x128dp window and the visible corner
  // is just the player's black letterbox bar — which looks exactly like a
  // video that failed to load.
  // In PiP, size from the dimensions the activity reported. Neither pixels
  // from useWindowDimensions (still full-screen) nor flex (fills RN's
  // full-screen root) can work — both leave the window showing the player's
  // black letterbox corner.
  const stage = inPip
    ? { width: pip.width || width, height: pip.height || height }
    : fullscreen
      ? { width, height }
      : { width, height: width * (9 / 16) };

  return (
    <View style={[styles.screen, fullscreen && styles.screenFull]}>
      <View style={[styles.stageArea, stage]}>
        {failed ? (
          <View style={[styles.fallbackBox, stage]}>
            <Ionicons name="cloud-offline-outline" size={34} color="#555" />
            <Text style={styles.fallbackText}>
              Couldn’t load the video here. Check your connection, or watch it on YouTube.
            </Text>
            <TouchableOpacity style={styles.fallbackBtn} onPress={openExternally}>
              <Text style={styles.fallbackBtnText}>Open in YouTube</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <WebView
              ref={webRef}
              key={videoId}
              // Explicit pixel dimensions, NOT `flex: 1`. A flex-sized WebView
              // inside a centring parent collapsed to zero on Android, so all
              // that showed was the parent's black background in a correctly
              // sized 16:9 box — indistinguishable from a player that loaded
              // but rendered nothing.
              style={[styles.webview, stage]}
              // Not `{ uri: embedUrl }` — a top-level navigation sends no
              // Referer and YouTube fails the video with "Video player
              // configuration error". The wrapper gives the iframe both a
              // referrer and a third-party embedding origin.
              source={{
                html: youtubeEmbedHtml(videoId, startSec),
                baseUrl: YOUTUBE_EMBED_ORIGIN,
              }}
              originWhitelist={['https://*']}
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              allowsFullscreenVideo
              javaScriptEnabled
              domStorageEnabled
              setSupportMultipleWindows={false}
              // The wrapper loads instantly, so its load event says nothing
              // about the player. Wait for the iframe's own report.
              onMessage={({ nativeEvent }) => {
                const msg = nativeEvent.data;
                if (msg === 'ready') {
                  setLoading(false);
                  // Autoplay is on (mediaPlaybackRequiresUserAction={false}),
                  // so treat ready as playing until the player says otherwise.
                  playingRef.current = true;
                  // Create the history row now: updatePosition only touches an
                  // existing entry, so without this the watch position would
                  // have nothing to write to and silently go nowhere.
                  recordVideoPlay({
                    videoId,
                    title: heading,
                    channel: channel ? String(channel) : undefined,
                    thumbnail: thumb ? String(thumb) : undefined,
                  });
                }
                if (msg === 'error') {
                  setLoading(false);
                  setFailed(true);
                }
                if (msg === 'fullscreen:on') setFullscreen(true);
                if (msg === 'fullscreen:off') setFullscreen(false);

                // Player transport state, used to label the notification
                // button and to know whether backgrounding needs one at all.
                if (typeof msg === 'string' && msg.startsWith('dur:')) {
                  const d = Number(msg.slice(4));
                  if (!Number.isNaN(d)) durationRef.current = d;
                }
                if (typeof msg === 'string' && msg.startsWith('time:')) {
                  const t = Number(msg.slice(5));
                  if (!Number.isNaN(t)) {
                    currentTimeRef.current = t;
                    // Persist every 5s rather than on every tick: these
                    // arrive once a second and each write hits AsyncStorage.
                    if (Math.abs(t - lastSavedRef.current) >= 5) {
                      lastSavedRef.current = t;
                      updatePosition(
                        YT_PREFIX + videoId, t * 1000, durationRef.current * 1000,
                      );
                    }
                  }
                }
                if (msg === 'state:playing') {
                  playingRef.current = true;
                  setIsPlaying(true);
                  setPipPlaying(true);
                }
                if (msg === 'state:paused' || msg === 'state:ended') {
                  playingRef.current = false;
                  setIsPlaying(false);
                  setPipPlaying(false);
                  // Ended or paused from inside the player while backgrounded:
                  // the notification would otherwise still claim to be playing.
                  if (notifIdRef.current) {
                    showVideoNotification(titleRef.current, false).then((id) => {
                      notifIdRef.current = id;
                    });
                  }
                }
              }}
              onError={() => {
                setLoading(false);
                setFailed(true);
              }}
              onHttpError={({ nativeEvent }) => {
                // A 4xx on the embed document means the video is gone or
                // embedding is disabled; media sub-requests 4xx harmlessly.
                if (nativeEvent.url?.includes('/embed/')) {
                  setLoading(false);
                  setFailed(true);
                }
              }}
              // Keep the WebView on the player. Taps on the YouTube logo or
              // channel name would otherwise navigate this view into the full
              // YouTube site, which we don't want to host.
              onShouldStartLoadWithRequest={(req) => {
                if (req.url.includes('/embed/')) return true;
                if (
                  req.url === YOUTUBE_EMBED_ORIGIN ||
                  req.url === `${YOUTUBE_EMBED_ORIGIN}/` ||
                  req.url.startsWith('about:') ||
                  req.url.startsWith('data:')
                ) {
                  return true;
                }
                // Everything else is the user leaving for YouTube. This
                // deliberately does NOT test `navigationType === 'click'`:
                // that field is iOS-only and is always 'other' on Android, so
                // testing it silently blocks every one of these taps.
                Linking.openURL(req.url).catch(() => {});
                return false;
              }}
            />
            {loading && (
              <View style={styles.loadingOverlay} pointerEvents="none">
                <ActivityIndicator color="#E74C3C" />
              </View>
            )}
          </>
        )}
      </View>

      {!fullscreen && !inPip && (
        <View style={styles.body}>
          <Text style={styles.title}>{heading}</Text>

          <TouchableOpacity onPress={togglePlayback} style={styles.pauseBtn}>
            <Ionicons name={isPlaying ? 'pause' : 'play'} size={18} color="#0a0d1a" />
            <Text style={styles.pauseText}>{isPlaying ? 'Pause' : 'Play'}</Text>
          </TouchableOpacity>

          <View style={styles.btnRow}>
            {pipAvailable && (
              <TouchableOpacity onPress={floatNow} style={[styles.openBtn, styles.pipBtn]}>
                <Ionicons name="tablet-landscape-outline" size={17} color="#27AE60" />
                <Text style={[styles.openText, { color: '#27AE60' }]}>Float & keep playing</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={openExternally} style={[styles.openBtn, { flex: 1 }]}>
              <Ionicons name="logo-youtube" size={17} color="#E74C3C" />
              <Text style={styles.openText}>YouTube</Text>
            </TouchableOpacity>
          </View>

          {archiveMatch && (
            <View style={styles.archiveCard}>
              <View style={styles.archiveTop}>
                <Ionicons name="headset-outline" size={16} color="#27AE60" />
                <Text style={styles.archiveLabel}>Also in the audio archive</Text>
              </View>
              <Text style={styles.archiveTitle} numberOfLines={2}>
                {archiveMatch.recording.title}
              </Text>
              {archiveMatch.reason ? (
                <Text style={styles.archiveReason}>Matched on {archiveMatch.reason}</Text>
              ) : null}
              <TouchableOpacity
                onPress={() => listenInBackground(archiveMatch.recording)}
                style={styles.archiveBtn}
              >
                <Ionicons name="play" size={14} color="#fff" />
                <Text style={styles.archiveBtnText}>Listen with background play</Text>
              </TouchableOpacity>
              <Text style={styles.archiveHint}>
                Plays as audio with lock-screen controls, keeps playing when the app is closed,
                and can be downloaded for offline listening — none of which YouTube allows.
              </Text>
            </View>
          )}

          {suggestions.length > 0 && (
            <View style={styles.archiveCard}>
              <View style={styles.archiveTop}>
                <Ionicons name="headset-outline" size={16} color="#27AE60" />
                <Text style={styles.archiveLabel}>Possible archive audio</Text>
              </View>
              <Text style={styles.archiveHint}>
                Not certain these are the same class — pick the right one to play it as audio
                with background play and offline download.
              </Text>
              {suggestions.map((c) => (
                <TouchableOpacity
                  key={c.recording.id}
                  onPress={() => listenInBackground(c.recording)}
                  style={styles.suggestRow}
                >
                  <Ionicons name="play-circle-outline" size={18} color="#27AE60" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.suggestTitle} numberOfLines={2}>
                      {c.recording.title}
                    </Text>
                    {c.reason ? (
                      <Text style={styles.archiveReason}>{c.reason}</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {pipAvailable && !pipAllowed && (
            <TouchableOpacity onPress={openPipSettings} style={styles.pipWarn}>
              <Ionicons name="warning-outline" size={18} color="#F1C40F" />
              <View style={{ flex: 1 }}>
                <Text style={styles.pipWarnTitle}>Floating window is turned off</Text>
                <Text style={styles.pipWarnText}>
                  Picture-in-picture is off for this app in phone settings, so the video stops
                  when you leave. Tap to turn it on.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#F1C40F" />
            </TouchableOpacity>
          )}

          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingLabel}>Keep playing in background</Text>
              <Text style={styles.settingHint}>
                Keeps playing in a floating window when you leave the app
              </Text>
            </View>
            <Switch
              value={backgroundVideoAudio}
              onValueChange={setBackgroundVideoAudio}
              trackColor={{ false: '#2a3050', true: '#E74C3C88' }}
              thumbColor={backgroundVideoAudio ? '#E74C3C' : '#7b83ad'}
            />
          </View>

          <Text style={[styles.note, { marginBottom: insets.bottom + 12 }]}>
            {!backgroundVideoAudio
              ? 'Video streams from YouTube and is not saved for offline use.'
              : archiveMatch
                ? 'Leaving the app keeps the video in a floating window. YouTube stops whenever the screen is locked; for screen-off listening use "Listen with background play" above.'
                : 'Leaving the app keeps the video in a floating window. YouTube stops its own player whenever the screen is locked, which nothing in the app can override.'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0a0d1a' },
  pipWarn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginTop: 18, padding: 13, borderRadius: 12,
    backgroundColor: '#F1C40F14', borderWidth: 1, borderColor: '#F1C40F55',
  },
  pipWarnTitle: { color: '#F1C40F', fontSize: 13.5, fontWeight: '800' },
  pipWarnText: { color: '#c9cee8', fontSize: 12, marginTop: 3, lineHeight: 16 },
  screenFull: { backgroundColor: '#000' },
  // No alignItems/justifyContent here: centring made the flex-sized WebView
  // collapse. Children carry their own explicit size instead.
  stageArea: { backgroundColor: '#000' },
  // PiP only: fill whatever the native window actually is. A pixel-sized
  // stage cannot work there — RN never re-reports dimensions for the PiP
  // resize, so it stays at full-screen size and the window shows only the
  // player's black letterbox corner.
  stageFill: { flex: 1, width: '100%' as const, alignItems: 'stretch' as const },
  webview: { backgroundColor: '#000' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#000',
  },
  fallbackBox: {
    alignItems: 'center', justifyContent: 'center',
    gap: 13, paddingHorizontal: 34,
  },
  fallbackText: { color: '#888', fontSize: 13.5, lineHeight: 20, textAlign: 'center' },
  fallbackBtn: {
    borderWidth: 1, borderColor: '#E74C3C', borderRadius: 22,
    paddingVertical: 9, paddingHorizontal: 20,
  },
  fallbackBtnText: { color: '#E74C3C', fontSize: 13.5, fontWeight: '700' },
  body: { flex: 1 },
  title: {
    color: '#fff', fontSize: 16, fontWeight: '700',
    marginHorizontal: 16, marginTop: 16, lineHeight: 22,
  },
  pauseBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 16, minHeight: 46, borderRadius: 12,
    backgroundColor: '#E8EAF6',
  },
  pauseText: { color: '#0a0d1a', fontSize: 14.5, fontWeight: '800' },
  btnRow: { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 18 },
  pipBtn: { flex: 1.35, borderColor: '#27AE6044' },
  openBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 13, paddingHorizontal: 10,
    backgroundColor: '#121629', borderRadius: 12,
    borderWidth: 1, borderColor: '#E74C3C44',
  },
  openText: { color: '#E74C3C', fontSize: 14, fontWeight: '700' },
  archiveCard: {
    marginHorizontal: 16, marginTop: 18, padding: 14,
    backgroundColor: '#101c16', borderRadius: 12,
    borderWidth: 1, borderColor: '#27AE6055',
  },
  archiveTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  archiveLabel: {
    color: '#27AE60', fontSize: 11, fontWeight: '800',
    letterSpacing: 0.6, textTransform: 'uppercase',
  },
  archiveTitle: { color: '#eee', fontSize: 14, fontWeight: '600', marginTop: 8, lineHeight: 19 },
  archiveReason: { color: '#5f7a68', fontSize: 10.5, marginTop: 4 },
  archiveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    marginTop: 12, minHeight: 42, borderRadius: 10, backgroundColor: '#27AE60',
  },
  archiveBtnText: { color: '#fff', fontSize: 13.5, fontWeight: '700' },
  suggestRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginTop: 10, paddingVertical: 9, paddingHorizontal: 10,
    backgroundColor: '#0d1712', borderRadius: 10,
    borderWidth: 1, borderColor: '#27AE6033',
  },
  suggestTitle: { color: '#dfe3f5', fontSize: 12.5, fontWeight: '600', lineHeight: 17 },
  archiveHint: { color: '#4a5178', fontSize: 10.5, lineHeight: 15, marginTop: 9 },
  settingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginTop: 18, paddingVertical: 12, paddingHorizontal: 14,
    backgroundColor: '#101426', borderRadius: 12,
    borderWidth: 1, borderColor: '#1a2040',
  },
  settingLabel: { color: '#dfe3f5', fontSize: 13.5, fontWeight: '700' },
  settingHint: { color: '#5a6288', fontSize: 11, marginTop: 3, lineHeight: 15 },
  note: {
    color: '#4a5178', fontSize: 11.5, lineHeight: 17,
    marginHorizontal: 16, marginTop: 18,
  },
});
