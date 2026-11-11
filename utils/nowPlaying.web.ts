/**
 * Web/desktop: there is no background service holding a track — the <audio>
 * element lives in the page (contexts/AudioContext.web.tsx) — so only the
 * in-memory id is needed. Importing react-native-track-player here would
 * throw at module load on web.
 */
let currentId: string | null = null;

export const setNowPlayingId = (id: string | null) => {
  currentId = id;
};

export const getNowPlayingId = () => currentId;

export async function getServiceTrackId(): Promise<string | null> {
  return currentId;
}
