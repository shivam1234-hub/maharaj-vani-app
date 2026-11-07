import React, {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';

const REGISTRY_KEY = 'dl_registry_v1';
const AUDIO_DIR = FileSystem.documentDirectory + 'audio/';
const MAX_CONCURRENT = 3;

export interface DownloadEntry {
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

/** What the queue needs to fetch one recording. */
export interface DownloadRequest {
  id: string;
  url: string;
  title?: string;
  maharaj?: string;
  /** From the catalogue, so progress can show a total before headers arrive. */
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

/**
 * One file per recording. The catalogue exposes a direct mp3 URL for every
 * entry, so unlike a wiki-backed source there is no per-part splitting and no
 * metadata round-trip before the bytes start.
 */
const localUriFor = (id: string) => `${AUDIO_DIR}${id}.mp3`;

export function DownloadProvider({ children }: { children: React.ReactNode }) {
  const [registry, setRegistry] = useState<Record<string, DownloadEntry>>({});
  const [progress, setProgress] = useState<Record<string, DownloadProgress>>({});

  const cancelledRef = useRef<Set<string>>(new Set());
  const activeCountRef = useRef(0);
  const queueRef = useRef<DownloadRequest[]>([]);
  const processingRef = useRef(false);
  const [queuedCount, setQueuedCount] = useState(0);

  // Reconcile the saved registry against the filesystem on boot: files can
  // outlive cleared app data (reinstall), and registry rows can outlive files
  // the OS reclaimed. Whatever is actually on disk wins.
  useEffect(() => {
    async function loadRegistry() {
      let saved: Record<string, DownloadEntry> = {};
      try {
        const raw = await AsyncStorage.getItem(REGISTRY_KEY);
        if (raw) saved = JSON.parse(raw) ?? {};
      } catch {}

      try {
        const dirInfo = await FileSystem.getInfoAsync(AUDIO_DIR);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(AUDIO_DIR, { intermediates: true }).catch(() => {});
          if (Object.keys(saved).length) setRegistry({});
          await AsyncStorage.setItem(REGISTRY_KEY, JSON.stringify({})).catch(() => {});
          return;
        }

        const files = await FileSystem.readDirectoryAsync(AUDIO_DIR);
        const merged: Record<string, DownloadEntry> = {};
        for (const file of files) {
          if (!file.endsWith('.mp3')) continue;
          const id = file.slice(0, -4);
          const uri = `${AUDIO_DIR}${file}`;
          const info = await FileSystem.getInfoAsync(uri);
          if (!info.exists) continue;
          const size = 'size' in info ? info.size ?? 0 : 0;
          merged[id] = {
            ...(saved[id] ?? { downloadedAt: new Date().toISOString() }),
            localUri: uri,
            totalBytes: size,
          };
        }
        setRegistry(merged);
        await AsyncStorage.setItem(REGISTRY_KEY, JSON.stringify(merged));
      } catch {
        if (Object.keys(saved).length) setRegistry(saved);
      }
    }
    loadRegistry();
  }, []);

  const clearProgress = useCallback((id: string) => {
    setProgress((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const downloadRecording = useCallback(async (req: DownloadRequest) => {
    const { id, url } = req;
    cancelledRef.current.delete(id);

    setProgress((prev) => ({
      ...prev,
      [id]: { status: 'downloading', bytesWritten: 0, bytesTotal: req.sizeBytes ?? 0 },
    }));

    await FileSystem.makeDirectoryAsync(AUDIO_DIR, { intermediates: true }).catch(() => {});
    const dest = localUriFor(id);

    for (let attempt = 0; attempt < 3; attempt++) {
      if (cancelledRef.current.has(id)) {
        clearProgress(id);
        return;
      }
      try {
        // Clear any partial file from a previous attempt so a resumed
        // download can't append onto a truncated body.
        const existing = await FileSystem.getInfoAsync(dest);
        if (existing.exists) await FileSystem.deleteAsync(dest, { idempotent: true });

        const dl = FileSystem.createDownloadResumable(url, dest, {}, (dp) => {
          setProgress((prev) => ({
            ...prev,
            [id]: {
              status: 'downloading',
              bytesWritten: dp.totalBytesWritten,
              bytesTotal: dp.totalBytesExpectedToWrite > 0
                ? dp.totalBytesExpectedToWrite
                : req.sizeBytes ?? 0,
            },
          }));
        });

        const result = await dl.downloadAsync();
        if (!result) throw new Error('no result');
        if (cancelledRef.current.has(id)) {
          await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => {});
          clearProgress(id);
          return;
        }

        const info = await FileSystem.getInfoAsync(dest);
        const size = info.exists && 'size' in info ? info.size ?? 0 : 0;
        // A 0-byte or HTML error page saved as .mp3 would look downloaded but
        // fail at playback, so treat a suspiciously small file as a failure.
        if (size < 1024) throw new Error('file too small');

        setRegistry((prev) => {
          const next = {
            ...prev,
            [id]: {
              localUri: dest,
              totalBytes: size,
              downloadedAt: new Date().toISOString(),
              title: req.title,
              maharaj: req.maharaj,
            },
          };
          AsyncStorage.setItem(REGISTRY_KEY, JSON.stringify(next)).catch(() => {});
          return next;
        });
        clearProgress(id);
        return;
      } catch {
        await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => {});
        if (attempt < 2) await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      }
    }

    setProgress((prev) => ({
      ...prev,
      [id]: { status: 'error', bytesWritten: 0, bytesTotal: 0 },
    }));
  }, [clearProgress]);

  const processQueue = useCallback(() => {
    if (processingRef.current) return;
    processingRef.current = true;

    const tick = () => {
      while (activeCountRef.current < MAX_CONCURRENT && queueRef.current.length > 0) {
        const item = queueRef.current.shift()!;
        setQueuedCount(queueRef.current.length);
        if (cancelledRef.current.has(item.id)) continue;
        activeCountRef.current += 1;
        downloadRecording(item).finally(() => {
          activeCountRef.current -= 1;
          tick();
        });
      }
      if (queueRef.current.length === 0 && activeCountRef.current === 0) {
        processingRef.current = false;
        setQueuedCount(0);
      }
    };

    tick();
  }, [downloadRecording]);

  const downloadBatch = useCallback((items: DownloadRequest[]) => {
    for (const item of items) {
      cancelledRef.current.delete(item.id); // allow re-queuing a failed item
      if (!queueRef.current.some((q) => q.id === item.id)) {
        queueRef.current.push(item);
        setProgress((prev) =>
          prev[item.id]
            ? prev
            : { ...prev, [item.id]: { status: 'queued', bytesWritten: 0, bytesTotal: item.sizeBytes ?? 0 } },
        );
      }
    }
    setQueuedCount(queueRef.current.length);
    processQueue();
  }, [processQueue]);

  const cancelDownload = useCallback((id: string) => {
    cancelledRef.current.add(id);
    queueRef.current = queueRef.current.filter((q) => q.id !== id);
    setQueuedCount(queueRef.current.length);
    clearProgress(id);
  }, [clearProgress]);

  const deleteDownload = useCallback(async (id: string) => {
    await FileSystem.deleteAsync(localUriFor(id), { idempotent: true }).catch(() => {});
    setRegistry((prev) => {
      const next = { ...prev };
      delete next[id];
      AsyncStorage.setItem(REGISTRY_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const deleteAll = useCallback(async () => {
    const info = await FileSystem.getInfoAsync(AUDIO_DIR);
    if (info.exists) await FileSystem.deleteAsync(AUDIO_DIR, { idempotent: true });
    await FileSystem.makeDirectoryAsync(AUDIO_DIR, { intermediates: true }).catch(() => {});
    setRegistry({});
    await AsyncStorage.setItem(REGISTRY_KEY, JSON.stringify({})).catch(() => {});
  }, []);

  const isDownloaded = useCallback((id: string) => id in registry, [registry]);
  const getLocalUri = useCallback((id: string) => registry[id]?.localUri ?? null, [registry]);

  const totalBytes = Object.values(registry).reduce((s, e) => s + e.totalBytes, 0);
  const totalCount = Object.keys(registry).length;

  return (
    <DownloadContext.Provider value={{
      registry, progress,
      downloadRecording, downloadBatch, cancelDownload,
      deleteDownload, deleteAll,
      isDownloaded, getLocalUri,
      totalBytes, totalCount, queuedCount,
    }}>
      {children}
    </DownloadContext.Provider>
  );
}

export function useDownload(): DownloadContextValue {
  const ctx = useContext(DownloadContext);
  if (!ctx) throw new Error('useDownload must be used within DownloadProvider');
  return ctx;
}
