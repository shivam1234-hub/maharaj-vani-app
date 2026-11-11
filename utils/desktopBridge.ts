/**
 * Typed access to the Electron preload bridge (desktop/preload.js).
 * Null on phones and in a plain browser, so callers degrade gracefully.
 */
export interface DesktopBridge {
  isDesktop: true;
  platform: string;
  version: string;
  downloads: any;
  net: any;
  video: {
    popout: (videoId: string, startSec: number, title: string) => Promise<boolean>;
    closePopout: () => Promise<void>;
    onPopoutClosed: (cb: () => void) => () => void;
  };
  dialog: any;
  notify: (opts: { title: string; body?: string; route?: string }) => Promise<void>;
  setTheme: (mode: 'system' | 'light' | 'dark') => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  onCommand: (cb: (command: string) => void) => () => void;
  onNavigate: (cb: (route: string) => void) => () => void;
}

export function desktop(): DesktopBridge | null {
  if (typeof window === 'undefined') return null;
  return ((window as any).desktop as DesktopBridge | undefined) ?? null;
}

/** Open a link in the system browser (desktop) or a new tab (browser). */
export function openExternal(url: string): void {
  const d = desktop();
  if (d) d.openExternal(url);
  else if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
}
