import { getNowPlayingId, getServiceTrackId } from '../utils/nowPlaying';

/**
 * Rewrites URLs the OS opens the app with, before Expo Router matches them.
 *
 * Tapping react-native-track-player's media notification launches the app
 * with `trackplayer://notification.click`. Expo Router treated that as a
 * route, matched nothing and showed the "not found" screen. It now opens the
 * lecture that is playing, or Home if nothing is.
 */
export async function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (path.startsWith('trackplayer:') || path.includes('notification.click')) {
      const id = getNowPlayingId() ?? (await getServiceTrackId());
      return id ? `/lecture/${encodeURIComponent(id)}` : '/';
    }
    // Any other foreign scheme has no route here either; land on Home rather
    // than a dead end.
    if (/^[a-z][\w+.-]*:/i.test(path) && !path.startsWith('maharajvani:')) return '/';
    return path;
  } catch {
    return '/';
  }
}
