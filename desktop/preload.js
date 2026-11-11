'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * The only bridge between the Expo bundle and Node.
 *
 * contextIsolation is on and nodeIntegration off, so the renderer can never
 * touch `fs` or `ipcRenderer` directly. Everything it may do with the machine
 * is on this object, and the shared code only reaches for it behind a
 * `window.desktop` check, so the same bundle still runs in a plain browser.
 */
const desktop = {
  isDesktop: true,
  platform: process.platform,
  version: ipcRenderer.sendSync('desktop:version'),

  downloads: {
    /** Full snapshot, used once on mount before the event streams take over. */
    getState: () => ipcRenderer.invoke('downloads:getState'),
    download: (req) => ipcRenderer.invoke('downloads:download', req),
    batch: (items) => ipcRenderer.invoke('downloads:batch', items),
    cancel: (id) => ipcRenderer.invoke('downloads:cancel', id),
    remove: (id) => ipcRenderer.invoke('downloads:delete', id),
    removeAll: () => ipcRenderer.invoke('downloads:deleteAll'),
    openFolder: () => ipcRenderer.invoke('downloads:openFolder'),
    onRegistry: (cb) => subscribe('downloads:registry', cb),
    onProgress: (cb) => subscribe('downloads:progress', cb),
  },

  /** CORS-free fetch for YouTube search (see desktop/lib/net.js). */
  net: {
    fetch: (req) => ipcRenderer.invoke('net:fetch', req),
  },

  video: {
    popout: (videoId, startSec, title) => ipcRenderer.invoke('video:popout', videoId, startSec, title),
    closePopout: () => ipcRenderer.invoke('video:closePopout'),
    onPopoutClosed: (cb) => subscribe('video:popoutClosed', cb),
  },

  /** Native Windows message boxes; resolves with the index of the button pressed. */
  dialog: {
    show: (opts) => ipcRenderer.invoke('dialog:show', opts),
  },

  notify: (opts) => ipcRenderer.invoke('notify', opts),
  setTheme: (mode) => ipcRenderer.invoke('theme:set', mode),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),

  /** Commands from the application menu and its shortcuts. */
  onCommand: (cb) => subscribe('app:command', cb),
  onNavigate: (cb) => subscribe('app:navigate', cb),
};

/** Never hand the renderer the IpcRendererEvent (its `sender` is a way out). */
function subscribe(channel, cb) {
  const listener = (_event, payload) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('desktop', desktop);
