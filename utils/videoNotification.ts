import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

/**
 * Notification controls for background YouTube playback.
 *
 * This is a plain notification carrying action buttons, NOT an Android media
 * notification: the video plays inside a WebView, which owns no MediaSession,
 * so there is nothing for the system's media UI to bind to. The practical
 * differences are that it appears among ordinary notifications rather than in
 * the Media section, has no seek bar or artwork, and shows on the lock screen
 * only as a normal notification.
 *
 * A real media widget would need a native foreground service holding a
 * MediaSessionCompat and forwarding its transport controls back into the
 * WebView.
 */
export const VIDEO_CATEGORY = 'maharajvani.video';
export const ACTION_PAUSE = 'pause';
export const ACTION_RESUME = 'resume';

const CHANNEL_ID = 'video-playback';

let categoryReady = false;

/** Android needs an explicit channel, and the actions need registering once. */
export async function prepareVideoNotifications(): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Video playback',
        importance: Notifications.AndroidImportance.LOW, // silent: no sound for a transport control
        sound: null,
        vibrationPattern: null,
        enableVibrate: false,
        showBadge: false,
      });
    }

    // Android 13+ refuses to post anything without this.
    const { status } = await Notifications.getPermissionsAsync();
    let granted = status === 'granted';
    if (!granted) {
      const req = await Notifications.requestPermissionsAsync();
      granted = req.status === 'granted';
    }
    if (!granted) return false;

    if (!categoryReady) {
      await Notifications.setNotificationCategoryAsync(VIDEO_CATEGORY, [
        {
          identifier: ACTION_PAUSE,
          buttonTitle: 'Pause',
          // Must not haul the app to the front — the point is to control
          // playback without leaving whatever the user is doing.
          options: { opensAppToForeground: false },
        },
        {
          identifier: ACTION_RESUME,
          buttonTitle: 'Play',
          options: { opensAppToForeground: false },
        },
      ]);
      categoryReady = true;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Post (or replace) the transport notification. Returns its id so it can be
 * dismissed later; re-posting with the same content replaces it in place.
 */
export async function showVideoNotification(
  title: string,
  playing: boolean,
): Promise<string | null> {
  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: playing ? 'Playing in background' : 'Paused',
        body: title,
        categoryIdentifier: VIDEO_CATEGORY,
        // Ongoing, so it cannot be swiped away while audio is still running.
        sticky: true,
        autoDismiss: false,
        // Silence comes from the LOW-importance channel; the content-level
        // field only takes a sound name or a boolean.
        sound: false,
      },
      // channelId belongs on the TRIGGER, not the content: passing it in
      // `content` silently does nothing and the notification lands on
      // expo's fallback channel at IMPORTANCE_HIGH, which buzzes every
      // time it is re-posted. A 1s delay is the cost of targeting our own
      // LOW-importance channel, and is imperceptible when backgrounding.
      trigger:
        Platform.OS === 'android'
          ? ({
              type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
              seconds: 1,
              repeats: false,
              channelId: CHANNEL_ID,
            } as Notifications.TimeIntervalTriggerInput)
          : null,
    });
  } catch {
    return null;
  }
}

export async function clearVideoNotification(id?: string | null): Promise<void> {
  try {
    if (id) await Notifications.dismissNotificationAsync(id);
    else await Notifications.dismissAllNotificationsAsync();
  } catch {}
}

/**
 * Removes "Playing in background" notifications left by a previous run.
 *
 * The notification is sticky, so when Android killed the app mid-video it
 * stayed behind with no player attached. Tapping it opened an app with
 * nothing playing. Only this app's video notifications are touched: the
 * audio player's media notification belongs to its foreground service.
 */
export async function clearStaleVideoNotifications(): Promise<void> {
  try {
    const shown = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(
      shown
        .filter((n) => n.request.content.categoryIdentifier === VIDEO_CATEGORY)
        .map((n) => Notifications.dismissNotificationAsync(n.request.identifier)),
    );
  } catch {}
}
