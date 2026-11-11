'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const { getStream } = require('./http');

const MAX_CONCURRENT = 3;

/** Only the archive host is ever downloaded from — the renderer cannot point this elsewhere. */
const ALLOWED_DOWNLOAD_HOSTS = new Set(['audio.iskcondesiretree.com']);
const ID_RE = /^[A-Za-z0-9._-]+$/;

/**
 * Desktop port of contexts/DownloadContext.tsx.
 *
 * The mobile build keeps the engine in the renderer because expo-file-system
 * gives React Native direct disk access. A browser has no such thing, so on
 * Windows the engine lives here in the main process and the renderer
 * (contexts/DownloadContext.web.tsx) mirrors this state over IPC.
 *
 * Semantics follow the mobile file deliberately: one MP3 per recording,
 * fetched straight from its catalogue URL, 3 attempts with back-off, a
 * 3-at-a-time batch queue, cancellation, a "too small = failed" guard against
 * saving an HTML error page as .mp3, and a registry reconciled against what is
 * actually on disk at startup so downloads survive a reinstall.
 */
class DownloadManager extends EventEmitter {
  constructor({ audioDir, registryPath }) {
    super();
    this.audioDir = audioDir;
    this.registryPath = registryPath;
    this.registry = {};
    this.progress = {};
    this.cancelled = new Set();
    this.controllers = new Map();
    this.queue = [];
    this.activeCount = 0;
    /** Set by main.js once the local server has a port. */
    this.audioBaseUrl = '';
  }

  fileFor(id) {
    return path.join(this.audioDir, `${id}.mp3`);
  }

  /** Played by an <audio> element, so it must be a URL — served by lib/server.js. */
  toUrl(id) {
    return `${this.audioBaseUrl}/__audio/${encodeURIComponent(id)}.mp3`;
  }

  publicRegistry() {
    const out = {};
    for (const [id, entry] of Object.entries(this.registry)) {
      out[id] = { ...entry, localUri: this.toUrl(id) };
    }
    return out;
  }

  publicState() {
    return { registry: this.publicRegistry(), progress: this.progress, queued: this.queue.length };
  }

  emitRegistry() {
    this.emit('registry', this.publicRegistry());
  }

  emitProgress() {
    this.emit('progress', { progress: this.progress, queued: this.queue.length });
  }

  setProgress(id, next) {
    this.progress = { ...this.progress, [id]: next };
    this.emitProgress();
  }

  clearProgress(id) {
    if (!(id in this.progress)) return;
    const next = { ...this.progress };
    delete next[id];
    this.progress = next;
    this.emitProgress();
  }

  async persist() {
    await fsp.writeFile(this.registryPath, JSON.stringify(this.registry), 'utf8').catch(() => {});
  }

  /** Saved registry, reconciled against the files actually on disk. */
  async load() {
    let saved = {};
    try {
      saved = JSON.parse(await fsp.readFile(this.registryPath, 'utf8')) ?? {};
    } catch {
      saved = {};
    }
    await fsp.mkdir(this.audioDir, { recursive: true }).catch(() => {});

    const merged = {};
    let files = [];
    try {
      files = await fsp.readdir(this.audioDir);
    } catch {
      files = [];
    }
    for (const file of files) {
      if (!file.endsWith('.mp3')) continue;
      const id = file.slice(0, -4);
      try {
        const { size } = await fsp.stat(path.join(this.audioDir, file));
        merged[id] = { ...(saved[id] ?? { downloadedAt: new Date().toISOString() }), totalBytes: size };
      } catch {}
    }
    this.registry = merged;
    await this.persist();
    this.emitRegistry();
  }

  validRequest(req) {
    if (!req || typeof req.id !== 'string' || !ID_RE.test(req.id)) return false;
    try {
      const u = new URL(req.url);
      return u.protocol === 'https:' && ALLOWED_DOWNLOAD_HOSTS.has(u.hostname);
    } catch {
      return false;
    }
  }

  async downloadRecording(req) {
    if (!this.validRequest(req)) return;
    const { id, url } = req;
    this.cancelled.delete(id);
    const hint = Number(req.sizeBytes) || 0;
    this.setProgress(id, { status: 'downloading', bytesWritten: 0, bytesTotal: hint });

    await fsp.mkdir(this.audioDir, { recursive: true }).catch(() => {});
    const dest = this.fileFor(id);
    const tmp = `${dest}.part`;

    for (let attempt = 0; attempt < 3; attempt++) {
      if (this.cancelled.has(id)) { this.clearProgress(id); return; }
      const controller = new AbortController();
      this.controllers.set(id, controller);
      try {
        await fsp.rm(tmp, { force: true });
        const { res } = await getStream(url, { signal: controller.signal });
        const total = Number(res.headers['content-length'] ?? 0) || hint;
        let written = 0;
        let last = 0;

        await new Promise((resolve, reject) => {
          const out = fs.createWriteStream(tmp);
          res.on('data', (chunk) => {
            written += chunk.length;
            const now = Date.now();
            // Coalesced: forwarding every chunk over IPC would spend more
            // time re-rendering the Downloads screen than downloading.
            if (now - last > 200 && !this.cancelled.has(id)) {
              last = now;
              this.setProgress(id, { status: 'downloading', bytesWritten: written, bytesTotal: total });
            }
          });
          res.on('error', reject);
          res.on('aborted', () => reject(new Error('aborted')));
          out.on('error', reject);
          out.on('finish', resolve);
          res.pipe(out);
        });

        if (this.cancelled.has(id)) {
          await fsp.rm(tmp, { force: true }).catch(() => {});
          this.clearProgress(id);
          return;
        }

        const { size } = await fsp.stat(tmp);
        // A 0-byte body or an HTML error page saved as .mp3 would look
        // downloaded but fail at playback.
        if (size < 1024) throw new Error('file too small');

        // Only become the real file once all bytes are down, so a crash
        // mid-download never leaves a truncated MP3 looking complete.
        await fsp.rename(tmp, dest);
        this.registry = {
          ...this.registry,
          [id]: {
            totalBytes: size,
            downloadedAt: new Date().toISOString(),
            title: typeof req.title === 'string' ? req.title : undefined,
            maharaj: typeof req.maharaj === 'string' ? req.maharaj : undefined,
          },
        };
        this.controllers.delete(id);
        await this.persist();
        this.emitRegistry();
        this.clearProgress(id);
        return;
      } catch {
        await fsp.rm(tmp, { force: true }).catch(() => {});
        if (this.cancelled.has(id)) { this.clearProgress(id); return; }
        if (attempt < 2) await delay(2000 * (attempt + 1));
      }
    }

    this.controllers.delete(id);
    this.setProgress(id, { status: 'error', bytesWritten: 0, bytesTotal: 0 });
  }

  tick() {
    while (this.activeCount < MAX_CONCURRENT && this.queue.length > 0) {
      const item = this.queue.shift();
      if (this.cancelled.has(item.id)) continue;
      this.activeCount += 1;
      this.downloadRecording(item).finally(() => {
        this.activeCount -= 1;
        this.tick();
      });
    }
    this.emitProgress();
  }

  downloadBatch(items) {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (!this.validRequest(item)) continue;
      this.cancelled.delete(item.id); // allow re-queuing a failed item
      if (this.registry[item.id] || this.queue.some((q) => q.id === item.id)) continue;
      this.queue.push(item);
      if (!this.progress[item.id] || this.progress[item.id].status === 'error') {
        this.progress = {
          ...this.progress,
          [item.id]: { status: 'queued', bytesWritten: 0, bytesTotal: Number(item.sizeBytes) || 0 },
        };
      }
    }
    this.tick();
  }

  cancelDownload(id) {
    this.cancelled.add(id);
    this.queue = this.queue.filter((q) => q.id !== id);
    this.controllers.get(id)?.abort();
    this.controllers.delete(id);
    this.clearProgress(id);
  }

  async deleteDownload(id) {
    if (typeof id !== 'string' || !ID_RE.test(id)) return;
    await fsp.rm(this.fileFor(id), { force: true }).catch(() => {});
    const next = { ...this.registry };
    delete next[id];
    this.registry = next;
    await this.persist();
    this.emitRegistry();
  }

  async deleteAll() {
    for (const id of Object.keys(this.registry)) {
      await fsp.rm(this.fileFor(id), { force: true }).catch(() => {});
    }
    this.registry = {};
    await this.persist();
    this.emitRegistry();
  }
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { DownloadManager, MAX_CONCURRENT };
