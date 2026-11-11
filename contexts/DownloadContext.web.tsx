import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { desktop } from '../utils/desktopBridge';

/**
 * Desktop/web build of the download store.
 *
 * `DownloadContext.tsx` drives expo-file-system from the renderer, which a
 * browser cannot do. On Windows the engine lives in the Electron main process
 * (desktop/lib/downloads.js) and this file mirrors its state over IPC. The
 * exported shape is identical to the native file's, so every screen that
 * calls useDownload() works unmodified.
 *
 * In a plain browser (no `window.desktop`) it is an empty, inert store.
 */

export interface DownloadEntry {
  /** A playable http://127.0.0.1 URL served by the desktop shell. */
  localUri: string;
  totalBytes: number;
  downloadedAt: string;
  title?: string;
  maharaj?: string;
}

export interface DownloadProgress {
  status: 'queued' | 'downloading' | 'error';
  bytesWritten: number;
  bytesTotal: number;
}

export interface DownloadRequest {
  id: string;
  url: string;
  title?: string;
  maharaj?: string;
  sizeBytes?: number;
}

export interface DownloadContextValue {
  registry: Record<string, DownloadEntry>;
  progress: Record<string, DownloadProgress>;
  downloadRecording: (req: DownloadRequest) => Promise<void>;
  downloadBatch: (items: DownloadRequest[]) => void;
  cancelDownload: (id: string) => void;
  deleteDownload: (id: string) => Promise<void>;
  deleteAll: () => Promise<void>;
  isDownloaded: (id: string) => boolean;
  getLocalUri: (id: string) => string | null;
  totalBytes: number;
  totalCount: number;
  queuedCount: number;
}

const DownloadContext = createContext<DownloadContextValue | null>(null);

const plain = (r: DownloadRequest): DownloadRequest => ({
  id: r.id, url: r.url, title: r.title, maharaj: r.maharaj, sizeBytes: r.sizeBytes,
});

export function DownloadProvider({ children }: { children: React.ReactNode }) {
  const [registry, setRegistry] = useState<Record<string, DownloadEntry>>({});
  const [progress, setProgress] = useState<Record<string, DownloadProgress>>({});
  const [queuedCount, setQueuedCount] = useState(0);
  const registryRef = useRef(registry);
  registryRef.current = registry;

  useEffect(() => {
    const api = desktop()?.downloads;
    if (!api) return;
    let cancelled = false;

    api.getState().then((s: any) => {
      if (cancelled) return;
      setRegistry(s.registry ?? {});
      setProgress(s.progress ?? {});
      setQueuedCount(s.queued ?? 0);
    }).catch(() => {});

    const offRegistry = api.onRegistry((next: Record<string, DownloadEntry>) => {
      // A Windows toast for each newly finished download, when the window is
      // in the background (main.js suppresses it while focused).
      const before = registryRef.current;
      const added = Object.keys(next ?? {}).filter((id) => !(id in before));
      if (added.length === 1 && Object.keys(before).length > 0) {
        const e = next[added[0]];
        desktop()?.notify({ title: 'Download complete', body: e.title ?? added[0], route: '/downloads' });
      } else if (added.length > 1) {
        desktop()?.notify({ title: 'Downloads complete', body: `${added.length} recordings saved`, route: '/downloads' });
      }
      setRegistry(next ?? {});
    });
    const offProgress = api.onProgress((p: any) => {
      setProgress(p?.progress ?? {});
      setQueuedCount(p?.queued ?? 0);
    });
    return () => {
      cancelled = true;
      offRegistry();
      offProgress();
    };
  }, []);

  const downloadRecording = useCallback(async (req: DownloadRequest) => {
    await desktop()?.downloads.download(plain(req));
  }, []);
  const downloadBatch = useCallback((items: DownloadRequest[]) => {
    desktop()?.downloads.batch(items.map(plain));
  }, []);
  const cancelDownload = useCallback((id: string) => {
    desktop()?.downloads.cancel(id);
  }, []);
  const deleteDownload = useCallback(async (id: string) => {
    await desktop()?.downloads.remove(id);
  }, []);
  const deleteAll = useCallback(async () => {
    await desktop()?.downloads.removeAll();
  }, []);

  const isDownloaded = useCallback((id: string) => id in registry, [registry]);
  const getLocalUri = useCallback((id: string) => registry[id]?.localUri ?? null, [registry]);

  const value = useMemo<DownloadContextValue>(() => ({
    registry, progress,
    downloadRecording, downloadBatch, cancelDownload, deleteDownload, deleteAll,
    isDownloaded, getLocalUri,
    totalBytes: Object.values(registry).reduce((s, e) => s + (e.totalBytes || 0), 0),
    totalCount: Object.keys(registry).length,
    queuedCount,
  }), [
    registry, progress, queuedCount,
    downloadRecording, downloadBatch, cancelDownload, deleteDownload, deleteAll,
    isDownloaded, getLocalUri,
  ]);

  return <DownloadContext.Provider value={value}>{children}</DownloadContext.Provider>;
}

export function useDownload(): DownloadContextValue {
  const ctx = useContext(DownloadContext);
  if (!ctx) throw new Error('useDownload must be used within DownloadProvider');
  return ctx;
}

/** Reveal the downloaded-audio folder in Explorer. No-op outside the desktop build. */
export function openDownloadsFolder(): void {
  desktop()?.downloads.openFolder();
}
