/**
 * Desktop has no notification-shade transport for the YouTube embed: the
 * video keeps playing in its own window (or the pop-out window) and the
 * Windows media overlay handles audio. These are no-ops so shared code can
 * call them unconditionally.
 */
export const VIDEO_CATEGORY = 'maharajvani.video';
export const ACTION_PAUSE = 'pause';
export const ACTION_RESUME = 'resume';

export async function prepareVideoNotifications(): Promise<boolean> {
  return false;
}
export async function showVideoNotification(_title: string, _playing: boolean): Promise<string | null> {
  return null;
}
export async function clearVideoNotification(_id?: string | null): Promise<void> {}
export async function clearStaleVideoNotifications(): Promise<void> {}
