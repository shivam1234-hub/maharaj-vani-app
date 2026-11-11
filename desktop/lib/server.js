'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Serve the Expo web export (and downloaded audio) over http://127.0.0.1.
 *
 * Loading the bundle from file:// would be simpler, but the export references
 * its JS with an absolute `/_expo/...` path, an opaque file:// origin breaks
 * expo-router's use of the History API, and YouTube refuses to play an embed
 * whose frame has no real origin or referrer — which is exactly what
 * VideoSlidesView needs. A loopback origin makes the renderer behave like the
 * ordinary web app the code was written for, so none of the shared UI needs to
 * know it is running inside Electron.
 */
function startServer({ webDir, audioDir }) {
  const server = http.createServer(async (req, res) => {
    try {
      await handle(req, res, { webDir, audioDir });
    } catch {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    // Port 0 = let the OS pick a free one; 127.0.0.1 keeps it off the network.
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, port, origin: `http://127.0.0.1:${port}` });
    });
  });
}

async function handle(req, res, { webDir, audioDir }) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end();
    return;
  }

  const url = new URL(req.url, 'http://127.0.0.1');
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }

  // The pop-out video window (main.js openVideoPopout) — a bare page holding
  // just the YouTube embed, so the always-on-top window doesn't have to boot
  // the whole app bundle. Served from this origin because the embed refuses
  // a frame with no real origin/referrer ("Video player configuration error").
  if (pathname === '/__player') {
    const v = url.searchParams.get('v') ?? '';
    const t = Math.max(0, Math.floor(Number(url.searchParams.get('t')) || 0));
    if (!/^[A-Za-z0-9_-]{6,20}$/.test(v)) { res.writeHead(400); res.end(); return; }
    const body = playerPage(v, t);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : body);
    return;
  }

  // Downloaded lectures live outside the bundle, under their own prefix.
  if (pathname.startsWith('/__audio/')) {
    const file = safeJoin(audioDir, pathname.slice('/__audio/'.length));
    if (!file) { res.writeHead(403); res.end(); return; }
    await sendFile(req, res, file);
    return;
  }

  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = safeJoin(webDir, rel);
  if (!file) { res.writeHead(403); res.end(); return; }

  if (await isFile(file)) {
    await sendFile(req, res, file);
    return;
  }

  // Single-page app: any unknown path is an expo-router route, not a 404.
  // Hashed bundle assets are excluded so a genuinely missing chunk fails loudly
  // instead of being served an HTML page the browser then tries to run as JS.
  if (!rel.startsWith('_expo/') && !path.extname(rel)) {
    await sendFile(req, res, path.join(webDir, 'index.html'));
    return;
  }

  res.writeHead(404);
  res.end();
}

function playerPage(videoId, startSec) {
  const src =
    `https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0&modestbranding=1&fs=1` +
    (startSec > 0 ? `&start=${startSec}` : '');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Vaishnava Vani</title>
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}
iframe{border:0;width:100%;height:100%;display:block}
.bar{position:fixed;top:0;left:0;right:0;height:22px;-webkit-app-region:drag;opacity:0;transition:opacity .2s;background:linear-gradient(#000a,#0000)}
body:hover .bar{opacity:1}</style></head>
<body><div class="bar"></div><iframe src="${src.replace(/&/g, '&amp;')}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></body></html>`;
}

/** Resolve `rel` under `root`, refusing anything that escapes it. */
function safeJoin(root, rel) {
  const resolved = path.resolve(root, rel.replace(/^([/\\])+/, ''));
  const base = path.resolve(root);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) return null;
  return resolved;
}

async function isFile(p) {
  try {
    return (await fsp.stat(p)).isFile();
  } catch {
    return false;
  }
}

/**
 * Send a file, honouring Range requests.
 *
 * Range matters for more than politeness: Chromium will not let you seek in an
 * <audio> element whose source came back as a plain 200, so without this the
 * scrub bar and the transcript's tap-to-jump would be dead on downloaded
 * lectures.
 */
async function sendFile(req, res, file) {
  let stat;
  try {
    stat = await fsp.stat(file);
  } catch {
    res.writeHead(404);
    res.end();
    return;
  }

  const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  const range = req.headers.range;
  const isBundleAsset = /[.-][0-9a-f]{8,}\./.test(path.basename(file));
  const cache = isBundleAsset ? 'public, max-age=31536000, immutable' : 'no-cache';

  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (m) {
      let start = m[1] === '' ? null : Number(m[1]);
      let end = m[2] === '' ? null : Number(m[2]);

      if (start === null && end !== null) {
        // Suffix range: "bytes=-500" means the last 500 bytes.
        start = Math.max(0, stat.size - end);
        end = stat.size - 1;
      } else {
        if (start === null) start = 0;
        if (end === null) end = stat.size - 1;
      }
      end = Math.min(end, stat.size - 1);

      if (start > end || start >= stat.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
        res.end();
        return;
      }

      res.writeHead(206, {
        'Content-Type': type,
        'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': cache,
      });
      if (req.method === 'HEAD') { res.end(); return; }
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
  }

  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Accept-Ranges': 'bytes',
    'Cache-Control': cache,
  });
  if (req.method === 'HEAD') { res.end(); return; }
  fs.createReadStream(file).pipe(res);
}

module.exports = { startServer };
