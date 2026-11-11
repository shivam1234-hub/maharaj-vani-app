import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';

/**
 * Picture-in-Picture, the one route that actually keeps a YouTube lecture
 * playing when you leave the app.
 *
 * The embed pauses itself whenever its page is hidden (its script hooks the
 * Page Visibility API — YouTube's way of reserving background playback for
 * Premium), and it sits in a cross-origin iframe so nothing can be patched
 * from our side. PiP does not fight that: in PiP the activity is still
 * visible, only small, so the page never goes hidden and the player never
 * pauses. Android also puts play/pause controls on the floating window.
 *
 * Android only — the module is absent on other platforms, so every call is
 * guarded rather than assuming it exists.
 */
const Pip = NativeModules.PipModule as
  | {
      setEnabled: (enabled: boolean) => void;
      enterPip: () => Promise<boolean>;
      isSupported: () => boolean;
      isAllowed: () => boolean;
      openSettings: () => void;
      setPlaying: (isPlaying: boolean) => void;
  getState?: () => { inPip: boolean; width: number; height: number };
    }
  | undefined;

/**
 * Arm or disarm PiP-on-Home. Only armed while the video screen is up:
 * otherwise leaving any screen would shrink the whole app into a window.
 */
export function setPipEnabled(enabled: boolean): void {
  if (Platform.OS !== 'android') return;
  try {
    Pip?.setEnabled(enabled);
  } catch {}
}

/**
 * Enter PiP now, for an explicit button rather than waiting for Home.
 * Resolves false when the system refused, so the caller can explain why.
 */
export async function enterPip(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    return Boolean(await Pip?.enterPip());
  } catch {
    return false;
  }
}

/**
 * False when picture-in-picture is switched off for this app in system
 * settings, which several Android skins do by default. Entering PiP then
 * fails silently, which looked like the floating video simply not working.
 */
export function isPipAllowed(): boolean {
  if (Platform.OS !== 'android') return false;
  try {
    return Pip?.isAllowed?.() ?? true;
  } catch {
    return true;
  }
}

/** Opens this app's picture-in-picture switch in system settings. */
export function openPipSettings(): void {
  if (Platform.OS !== 'android') return;
  try {
    Pip?.openSettings?.();
  } catch {}
}

/**
 * Keep the floating window's button matching the player. The PiP window
 * only ever shows the actions we hand it, so without this the icon would
 * stay on 'pause' even after playback stopped.
 */
export function setPipPlaying(isPlaying: boolean): void {
  if (Platform.OS !== 'android') return;
  try {
    Pip?.setPlaying(isPlaying);
  } catch {}
}

/** Taps on the floating window's play/pause button. */
export function onPipAction(cb: (control: string) => void): () => void {
  if (Platform.OS !== 'android') return () => {};
  const sub = DeviceEventEmitter.addListener('pipAction', (c: string) => cb(String(c)));
  return () => sub.remove();
}

/** False on old Android and on devices where the feature is absent. */
export function isPipSupported(): boolean {
  if (Platform.OS !== 'android') return false;
  try {
    return Pip?.isSupported() ?? false;
  } catch {
    return false;
  }
}

/**
 * Subscribe to PiP enter/leave, reported by the activity itself.
 *
 * The window-size heuristic below is kept only as a fallback: RN does not
 * re-report `useWindowDimensions` for the PiP resize, so on its own it left
 * the navigation header rendering inside a 128dp-tall window.
 */
export interface PipState {
  inPip: boolean;
  /** Actual PiP window size in dp — RN keeps reporting the full screen. */
  width: number;
  height: number;
}

export function onPipModeChanged(cb: (state: PipState) => void): () => void {
  if (Platform.OS !== 'android') return () => {};
  const sub = DeviceEventEmitter.addListener('pipModeChanged', (e: any) => {
    cb({
      inPip: !!e?.inPip,
      width: Number(e?.width) || 0,
      height: Number(e?.height) || 0,
    });
  });
  return () => sub.remove();
}

/** Asks the activity directly; see PipModule.getState. */
export function getPipState(): PipState | null {
  if (Platform.OS !== 'android') return null;
  try {
    const e = Pip?.getState?.();
    if (!e) return null;
    return { inPip: !!e.inPip, width: Number(e.width) || 0, height: Number(e.height) || 0 };
  } catch {
    return null;
  }
}

/**
 * Fallback detection from the window size.
 *
 * The PiP window is a few hundred dp at most, and React Native re-reports
 * dimensions when the activity is resized, so this needs no bridge event and
 * cannot fall out of sync with the actual layout.
 */
export function isPipWindow(width: number, height: number): boolean {
  return height <= 320 && width <= 520;
}
