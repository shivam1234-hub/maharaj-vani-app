'use strict';

const {
  app, BrowserWindow, Menu, Notification, dialog, ipcMain, nativeTheme, screen, shell, session,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');

const { startServer } = require('./lib/server');
const { DownloadManager } = require('./lib/downloads');
const { fetchForRenderer } = require('./lib/net');

const APP_NAME = 'Vaishnava Vani';

// The Expo web export. `npm run build` writes it here; see README.md.
const WEB_DIR = path.join(__dirname, 'web');

// Everything the app talks to. Requests to anything else are refused, so a
// compromised page can't quietly phone somewhere new.
const ALLOWED_HOSTS = [
  'audio.iskcondesiretree.com',
  'www.youtube.com',
  'youtube.com',
  'm.youtube.com',
  'www.youtube-nocookie.com',
  'i.ytimg.com',
  's.ytimg.com',
  'yt3.ggpht.com',
  'jnn-pa.googleapis.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];
const ALLOWED_HOST_SUFFIXES = ['.googlevideo.com', '.ytimg.com', '.ggpht.com'];

// Local-testing escape hatches, OFF in the shipped build: the office network
// re-signs TLS, which Chromium rejects. Never set these for a release.
const INSECURE_TLS = process.env.VV_INSECURE_TLS === '1' && !app.isPackaged;
if (INSECURE_TLS) {
  app.commandLine.appendSwitch('ignore-certificate-errors');
  // The same TLS-inspecting proxy drops Chromium's post-quantum ClientHello.
  app.commandLine.appendSwitch('disable-features', 'PostQuantumKyber,UseMLKEM,EnableTLS13KyberPQ');
  // The downloader uses node:https, which the Chromium switch doesn't reach.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}
// Screenshot automation for development (see scripts/shots.js).
const SHOTS_PLAN = !app.isPackaged ? process.env.VV_SHOTS : undefined;

app.setName(APP_NAME);
if (process.platform === 'win32') app.setAppUserModelId('com.maharajvani.desktop');

let mainWindow = null;
let popoutWindow = null;
let downloads = null;
let server = null;
let origin = '';

const userData = app.getPath('userData');
const AUDIO_DIR = path.join(userData, 'audio');
const REGISTRY_PATH = path.join(userData, 'downloads.json');
const WINDOW_STATE_PATH = path.join(userData, 'window-state.json');

// ---------------------------------------------------------------------------
// Window

const DEFAULT_SIZE = { width: 1360, height: 860 };
const MIN_SIZE = { width: 1000, height: 640 };

function loadWindowState() {
  try {
    const s = JSON.parse(fs.readFileSync(WINDOW_STATE_PATH, 'utf8'));
    if (typeof s.width === 'number' && typeof s.height === 'number') {
      // A window saved on a monitor that is no longer attached would open
      // off-screen; keep the size but let the OS place it.
      const visible = screen.getAllDisplays().some((d) => {
        const a = d.workArea;
        return s.x != null && s.x < a.x + a.width - 80 && s.x + s.width > a.x + 80 &&
          s.y != null && s.y >= a.y - 20 && s.y < a.y + a.height - 80;
      });
      return visible ? s : { width: s.width, height: s.height, maximized: s.maximized };
    }
  } catch {}
  return { ...DEFAULT_SIZE };
}

function saveWindowState(win) {
  if (!win || win.isDestroyed() || SHOTS_PLAN) return;
  const state = { ...win.getNormalBounds(), maximized: win.isMaximized() };
  try { fs.writeFileSync(WINDOW_STATE_PATH, JSON.stringify(state), 'utf8'); } catch {}
}

function isOwnUrl(url) {
  return url === origin || url.startsWith(`${origin}/`);
}

function createWindow() {
  const state = SHOTS_PLAN ? { ...DEFAULT_SIZE } : loadWindowState();

  mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: Math.max(state.width, MIN_SIZE.width),
    height: Math.max(state.height, MIN_SIZE.height),
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    title: APP_NAME,
    // Matches the app's own background so the window doesn't flash white
    // while the bundle parses.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#090c18' : '#f6f4ef',
    show: false,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload needs require(); the renderer stays isolated by contextIsolation
      spellcheck: false,
      // Chromium pauses timers and media in occluded windows, which would
      // stall playback the moment the app is minimised behind another window.
      backgroundThrottling: false,
    },
  });

  if (state.maximized) mainWindow.maximize();
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Keep in-app navigation inside the app; send real links to the browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url) && !isOwnUrl(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isOwnUrl(url)) {
      event.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });

  let saveTimer = null;
  const queueSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveWindowState(mainWindow), 400);
  };
  mainWindow.on('resize', queueSave);
  mainWindow.on('move', queueSave);
  mainWindow.on('close', () => {
    clearTimeout(saveTimer);
    saveWindowState(mainWindow);
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (popoutWindow && !popoutWindow.isDestroyed()) popoutWindow.close();
  });

  mainWindow.loadURL(`${origin}/`);
  if (SHOTS_PLAN) runShots(mainWindow, SHOTS_PLAN).catch((e) => {
    console.error('[shots]', e);
    app.exit(1);
  });
}

// ---------------------------------------------------------------------------
// Pop-out video: the desktop stand-in for Android picture-in-picture. A small
// frameless always-on-top window keeps the lecture visible while you work in
// another app.

function openVideoPopout(videoId, startSec, title) {
  if (typeof videoId !== 'string' || !/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) return false;
  const t = Math.max(0, Math.floor(Number(startSec) || 0));
  const url = `${origin}/__player?v=${videoId}&t=${t}`;
  if (popoutWindow && !popoutWindow.isDestroyed()) {
    popoutWindow.loadURL(url);
    popoutWindow.setTitle(String(title || APP_NAME));
    popoutWindow.show();
    return true;
  }
  const area = screen.getPrimaryDisplay().workArea;
  const width = 480;
  const height = 270;
  popoutWindow = new BrowserWindow({
    width,
    height,
    x: area.x + area.width - width - 24,
    y: area.y + area.height - height - 24,
    minWidth: 320,
    minHeight: 180,
    alwaysOnTop: true,
    frame: false,
    resizable: true,
    fullscreenable: true,
    backgroundColor: '#000000',
    title: String(title || APP_NAME),
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  popoutWindow.setAspectRatio(16 / 9);
  popoutWindow.setAlwaysOnTop(true, 'floating');
  popoutWindow.webContents.setWindowOpenHandler(({ url: u }) => {
    if (/^https?:/.test(u)) shell.openExternal(u);
    return { action: 'deny' };
  });
  popoutWindow.webContents.on('will-navigate', (e, u) => {
    if (!isOwnUrl(u)) {
      e.preventDefault();
      if (/^https?:/.test(u)) shell.openExternal(u);
    }
  });
  popoutWindow.on('closed', () => {
    popoutWindow = null;
    mainWindow?.webContents.send('video:popoutClosed');
  });
  popoutWindow.loadURL(url);
  return true;
}

// ---------------------------------------------------------------------------
// Network policy

function configureSession() {
  const ses = session.defaultSession;

  ses.webRequest.onBeforeRequest((details, callback) => {
    const { url } = details;
    if (isOwnUrl(url) || url.startsWith('devtools:') || url.startsWith('blob:') || url.startsWith('data:')) {
      callback({});
      return;
    }
    let host;
    try {
      host = new URL(url).hostname;
    } catch {
      callback({ cancel: true });
      return;
    }
    const ok = ALLOWED_HOSTS.includes(host) || ALLOWED_HOST_SUFFIXES.some((s) => host.endsWith(s));
    callback({ cancel: !ok });
  });

  // Nothing here needs a camera, a microphone or your location. Fullscreen is
  // the one permission the YouTube player legitimately asks for.
  ses.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'fullscreen'));
}

// ---------------------------------------------------------------------------
// Menu

function buildMenu() {
  const send = (command) => () => mainWindow?.webContents.send('app:command', command);
  const go = (route) => () => mainWindow?.webContents.send('app:navigate', route);
  const dev = !app.isPackaged;

  const template = [
    {
      label: '&File',
      submenu: [
        { label: 'Search Everything', accelerator: 'CommandOrControl+K', click: send('focusSearch') },
        { type: 'separator' },
        { label: 'Open Downloads Folder', click: () => openAudioFolder() },
        { type: 'separator' },
        { role: 'quit', label: 'Exit' },
      ],
    },
    {
      label: '&Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: '&Go',
      submenu: [
        { label: 'Home', accelerator: 'CommandOrControl+1', click: go('/') },
        { label: 'Browse', accelerator: 'CommandOrControl+2', click: go('/browse') },
        { label: 'Verses', accelerator: 'CommandOrControl+3', click: go('/verses') },
        { label: 'YouTube', accelerator: 'CommandOrControl+4', click: go('/youtube') },
        { label: 'Downloads', accelerator: 'CommandOrControl+5', click: go('/downloads') },
        { label: 'History', accelerator: 'CommandOrControl+6', click: go('/history') },
        { type: 'separator' },
        { label: 'Back', accelerator: 'Alt+Left', click: send('back') },
        { label: 'Now Playing', accelerator: 'CommandOrControl+L', click: send('openNowPlaying') },
      ],
    },
    {
      // Every accelerator here is modifier-based on purpose. A menu
      // accelerator outranks the page, so binding bare Space or the arrow keys
      // would make them untypeable in the search box. The renderer binds those
      // bare keys itself (contexts/AudioContext.web.tsx), guarded on focus.
      label: '&Playback',
      submenu: [
        { label: 'Play / Pause\tSpace', accelerator: 'CommandOrControl+P', click: send('playPause') },
        { label: 'Back 15 Seconds\tLeft', accelerator: 'CommandOrControl+Left', click: send('back15') },
        { label: 'Forward 15 Seconds\tRight', accelerator: 'CommandOrControl+Right', click: send('forward15') },
        { label: 'Previous Lecture', accelerator: 'CommandOrControl+Shift+Up', click: send('previous') },
        { label: 'Next Lecture', accelerator: 'CommandOrControl+Shift+Down', click: send('next') },
        { type: 'separator' },
        { label: 'Speed Up', accelerator: 'CommandOrControl+Shift+Right', click: send('speedUp') },
        { label: 'Slow Down', accelerator: 'CommandOrControl+Shift+Left', click: send('speedDown') },
        { label: 'Normal Speed', accelerator: 'CommandOrControl+0', click: send('speedReset') },
        { type: 'separator' },
        { label: 'Stop', accelerator: 'CommandOrControl+.', click: send('stop') },
      ],
    },
    {
      label: '&View',
      submenu: [
        ...(dev ? [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }] : []),
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: '&Help',
      submenu: [
        { label: 'ISKCON Desire Tree Audio', click: () => shell.openExternal('https://audio.iskcondesiretree.com') },
        { label: 'Keyboard Shortcuts', click: send('shortcuts') },
        { type: 'separator' },
        {
          label: `About ${APP_NAME}`,
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: `About ${APP_NAME}`,
              message: APP_NAME,
              detail:
                `Version ${app.getVersion()}\n\n` +
                'Lectures of Radhanath Swami, Lokanath Swami, Bhakti Ashraya Vaishnava Swami,\n' +
                'Gour Govinda Swami and five Prabhujis — verse by verse through BG, SB and CC.\n\n' +
                'Audio courtesy of audio.iskcondesiretree.com.',
              buttons: ['OK'],
            });
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function openAudioFolder() {
  await fsp.mkdir(AUDIO_DIR, { recursive: true }).catch(() => {});
  shell.openPath(AUDIO_DIR);
}

// ---------------------------------------------------------------------------
// IPC

function registerIpc() {
  ipcMain.on('desktop:version', (event) => { event.returnValue = app.getVersion(); });

  ipcMain.handle('downloads:getState', () => downloads.publicState());
  ipcMain.handle('downloads:download', (_e, req) => downloads.downloadRecording(req));
  ipcMain.handle('downloads:batch', (_e, items) => downloads.downloadBatch(items));
  ipcMain.handle('downloads:cancel', (_e, id) => downloads.cancelDownload(id));
  ipcMain.handle('downloads:delete', (_e, id) => downloads.deleteDownload(id));
  ipcMain.handle('downloads:deleteAll', () => downloads.deleteAll());
  ipcMain.handle('downloads:openFolder', () => openAudioFolder());

  ipcMain.handle('net:fetch', (_e, req) => fetchForRenderer(req));

  ipcMain.handle('video:popout', (_e, videoId, startSec, title) => openVideoPopout(videoId, startSec, title));
  ipcMain.handle('video:closePopout', () => {
    if (popoutWindow && !popoutWindow.isDestroyed()) popoutWindow.close();
  });

  ipcMain.handle('app:openExternal', (_e, url) => {
    if (typeof url === 'string' && /^https:\/\//.test(url)) shell.openExternal(url);
  });

  // Theme toggle in the sidebar: keeps the native title bar/menus in step
  // with the page ('system' follows Windows).
  ipcMain.handle('theme:set', (_e, mode) => {
    nativeTheme.themeSource = mode === 'light' || mode === 'dark' ? mode : 'system';
  });

  // Windows toast — used for "download finished" when the window is not
  // focused (the desktop stand-in for the Android download notification).
  ipcMain.handle('notify', (_e, opts = {}) => {
    if (!Notification.isSupported() || mainWindow?.isFocused()) return;
    const n = new Notification({
      title: String(opts.title || APP_NAME).slice(0, 120),
      body: String(opts.body || '').slice(0, 240),
      icon: path.join(__dirname, 'build', 'icon.png'),
      silent: true,
    });
    n.on('click', () => {
      if (!mainWindow) return;
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      if (typeof opts.route === 'string') mainWindow.webContents.send('app:navigate', opts.route);
    });
    n.show();
  });

  // Backs the Alert.alert polyfill in utils/webAlert.web.ts. Returns the index
  // of the button pressed so the polyfill can call that button's onPress.
  ipcMain.handle('dialog:show', async (_e, opts = {}) => {
    const buttons = Array.isArray(opts.buttons) && opts.buttons.length > 0
      ? opts.buttons.map(String)
      : ['OK'];
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: opts.destructive ? 'warning' : (buttons.length > 1 ? 'question' : 'info'),
      title: opts.title || APP_NAME,
      message: opts.title || opts.message || '',
      detail: opts.title ? (opts.message ?? '') : '',
      buttons,
      defaultId: clampIndex(opts.defaultId, buttons.length, 0),
      cancelId: clampIndex(opts.cancelId, buttons.length, buttons.length - 1),
      noLink: true,
    });
    return response;
  });
}

function clampIndex(value, length, fallback) {
  return Number.isInteger(value) && value >= 0 && value < length ? value : fallback;
}

// ---------------------------------------------------------------------------
// Screenshot automation (development only; VV_SHOTS=<plan.json>)

async function runShots(win, planPath) {
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  const outDir = plan.outDir;
  fs.mkdirSync(outDir, { recursive: true });
  const log = fs.createWriteStream(path.join(outDir, 'console.log'), { flags: 'w' });
  win.webContents.on('console-message', (e) => {
    const { level, message, sourceId, lineNumber } = e;
    log.write(`[${level}] ${message} (${sourceId}:${lineNumber})\n`);
  });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await new Promise((r) => win.webContents.once('did-finish-load', r));
  await wait(plan.bootMs ?? 4000);

  for (const step of plan.steps) {
    if (step.width && step.height) {
      win.setContentSize(step.width, step.height);
    }
    if (step.theme) nativeTheme.themeSource = step.theme;
    if (step.route) {
      await win.webContents.executeJavaScript(`window.__vvNavigate && window.__vvNavigate(${JSON.stringify(step.route)})`);
    }
    if (step.js) {
      try {
        const r = await win.webContents.executeJavaScript(step.js);
        if (r !== undefined) log.write(`[js:${step.file || ''}] ${JSON.stringify(r)}\n`);
      } catch (e) {
        log.write(`[js-error] ${e}\n`);
      }
    }
    await wait(step.waitMs ?? 1500);
    if (step.file) {
      const img = await win.webContents.capturePage();
      fs.writeFileSync(path.join(outDir, step.file), img.toPNG());
      log.write(`[shot] ${step.file}\n`);
    }
  }
  log.end();
  await wait(300);
  app.exit(0);
}

// ---------------------------------------------------------------------------
// Boot

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    if (!fs.existsSync(path.join(WEB_DIR, 'index.html'))) {
      dialog.showErrorBox(
        'Web bundle missing',
        `No Expo web export found at:\n${WEB_DIR}\n\n` +
          'Run "npm run build" in the desktop folder to produce it, then start the app again.',
      );
      app.quit();
      return;
    }

    ({ server, origin } = await startServer({ webDir: WEB_DIR, audioDir: AUDIO_DIR }));

    downloads = new DownloadManager({ audioDir: AUDIO_DIR, registryPath: REGISTRY_PATH });
    downloads.audioBaseUrl = origin;
    downloads.on('registry', (registry) => mainWindow?.webContents.send('downloads:registry', registry));
    downloads.on('progress', (p) => mainWindow?.webContents.send('downloads:progress', p));
    await downloads.load();

    // An unpackaged `electron .` run on macOS has no .app icon of its own.
    if (process.platform === 'darwin' && app.dock) {
      app.dock.setIcon(path.join(__dirname, 'build', 'icon.png'));
    }

    configureSession();
    registerIpc();
    buildMenu();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    server?.close();
    app.quit();
  });
}
