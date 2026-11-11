'use strict';

/**
 * Build the Windows icons from the Android launcher art.
 *
 *   npx electron scripts/make-icons.js
 *
 * The adaptive launcher icon is a foreground layer (the lotus + wordmark on a
 * cream square) over a flat #FEF6DF background. Here the art is cropped to the
 * part a launcher actually shows, put on a rounded tile, and written as:
 *
 *   build/icon.png        256 px, used for the window and the macOS dev dock
 *   build/icon.ico        16/24/32/48/64/128/256, PNG-compressed entries
 *   ../assets/desktop-logo.png  the same tile at 128 px for the sidebar header
 *
 * Runs inside Electron only so it can use Chromium's canvas — no image
 * library to install, and the output is reproducible on any machine.
 */

const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.webp');
const OUT = path.resolve(__dirname, '..', 'build');
const SIZES = [16, 24, 32, 48, 64, 128, 256];

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL('about:blank');
  const dataUrl = `data:image/webp;base64,${fs.readFileSync(SRC).toString('base64')}`;

  const pngs = await win.webContents.executeJavaScript(`
    (async () => {
      const img = new Image();
      img.src = ${JSON.stringify(dataUrl)};
      await img.decode();
      // The art sits inside the adaptive-icon safe zone; this crop is what a
      // launcher mask leaves visible, so the wordmark stays legible.
      const crop = Math.round(img.width * 0.80);
      const off = Math.round((img.width - crop) / 2);
      const out = {};
      for (const size of ${JSON.stringify(SIZES.concat([128]))}) {
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const g = c.getContext('2d');
        const r = size * 0.2;
        g.beginPath();
        g.moveTo(r, 0);
        g.arcTo(size, 0, size, size, r);
        g.arcTo(size, size, 0, size, r);
        g.arcTo(0, size, 0, 0, r);
        g.arcTo(0, 0, size, 0, r);
        g.closePath();
        g.fillStyle = '#FEF6DF';
        g.fill();
        g.save();
        g.clip();
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, off, off, crop, crop, 0, 0, size, size);
        g.restore();
        out[size] = c.toDataURL('image/png').split(',')[1];
      }
      return out;
    })()
  `);

  fs.mkdirSync(OUT, { recursive: true });
  const buf = (s) => Buffer.from(pngs[s], 'base64');
  fs.writeFileSync(path.join(OUT, 'icon.png'), buf(256));
  fs.writeFileSync(path.join(ROOT, 'assets', 'desktop-logo.png'), buf(128));

  // ICO with PNG payloads (supported since Vista; electron-builder and NSIS
  // both accept it).
  const entries = SIZES.map((s) => ({ s, data: buf(s) }));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  const dir = Buffer.alloc(16 * entries.length);
  let offset = 6 + dir.length;
  entries.forEach(({ s, data }, i) => {
    const o = i * 16;
    dir.writeUInt8(s >= 256 ? 0 : s, o);
    dir.writeUInt8(s >= 256 ? 0 : s, o + 1);
    dir.writeUInt8(0, o + 2);
    dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(data.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  fs.writeFileSync(path.join(OUT, 'icon.ico'), Buffer.concat([header, dir, ...entries.map((e) => e.data)]));
  console.log('icons written to', OUT);
  app.quit();
});
