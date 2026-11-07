import TrackPlayer from 'react-native-track-player';

/**
 * The id of the recording loaded in the player, readable outside React.
 *
 * `app/+native-intent.tsx` runs before any screen mounts and cannot use
 * hooks, but it needs this id to turn a notification tap into "open the
 * lecture that is playing".
 */
let currentId: string | null = null;

export const setNowPlayingId = (id: string | null) => {
  currentId = id;
};

export const getNowPlayingId = () => currentId;

/**
 * The id of the track the background audio service holds, if any.
 *
 * After Android kills the UI the service keeps playing, so a fresh JS
 * context starts with no `currentId` even though audio is still going.
 * Bounded by a timeout so a cold start never stalls on a player that is
 * not running.
 */
export async function getServiceTrackId(timeoutMs = 1500): Promise<string | null> {
  try {
    const track = await Promise.race([
      TrackPlayer.getActiveTrack(),
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), timeoutMs)),
    ]);
    return typeof track?.id === 'string' ? track.id : null;
  } catch {
    return null;
  }
}
