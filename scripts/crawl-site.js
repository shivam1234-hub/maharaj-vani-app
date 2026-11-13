#!/usr/bin/env node
/**
 * Crawls the whole folder tree of audio.iskcondesiretree.com (minus Srila
 * Prabhupada's root and pure bhajan/kirtan folders) into a local cache:
 *
 *   scripts/.cache/site-crawl.jsonl   one line per folder:
 *                                     {"d": dir, "s": [subdirs], "f": [[path, title, sizeBytes]]}
 *
 * This feeds scripts/build-verse-index.js, which picks out every recording
 * whose name or folder names a Bhagavad-gita, Srimad-Bhagavatam or
 * Caitanya-caritamrta verse — from any speaker.
 *
 * Why a crawl and not the site search: the search matches filenames, but a
 * query broad enough to catch every Bhagavatam class ("SB") is too big for
 * the server and comes back empty, and narrower ones miss the many naming
 * styles ("SB_01-02-06", "SB-1.2.6", "Canto-01/…"). Folder pages have no cap.
 *
 * Resumable: folders already in the cache are not fetched again, and their
 * unvisited subfolders are queued from the cached line. Ctrl-C and re-run.
 *
 *   node scripts/crawl-site.js
 *   node scripts/crawl-site.js --concurrency 10
 *   node scripts/crawl-site.js --fresh          # discard the cache first
 *   node scripts/crawl-site.js --roots /01_-_Srila_Prabhupada/01_-_Lectures   # add a folder
 */

const fs = require('fs');
const path = require('path');

const HOST = 'https://audio.iskcondesiretree.com';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const argOf = (flag, dflt) => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : dflt;
};
const CONCURRENCY = Number(argOf('--concurrency', 8));
const CACHE_DIR = path.join(__dirname, '.cache');
const CACHE = path.join(CACHE_DIR, 'site-crawl.jsonl');

/**
 * `--roots /01_-_Srila_Prabhupada/01_-_Lectures` crawls other folders into the
 * same cache — Srila Prabhupada's lectures hold his purports to the songs
 * that the Prayers & Songs index (build-song-index.js) files.
 */
const ROOTS = argOf('--roots', null)?.split(',') ?? [
  '/02_-_ISKCON_Swamis',
  '/03_-_ISKCON_Prabhujis',
  '/04_-_ISKCON_Matajis',
  '/05_-_ISKCON_Chowpatty',
  '/06_-_More',
];

/**
 * Subtrees that can hold no verse class: music, drama soundtracks, and the
 * Prabhupada copies that sit under 06_-_More. Skipping them saves thousands
 * of page fetches.
 */
const SKIP_DIR = new RegExp(
  [
    'Bhajans?_and_Kirtans?', '/\\d+_-_Bhajans?$', '/Bhajans?$', '/Kirtans?$', 'Kirtan_Fest',
    'Drama_Sound_Track', 'Gopals_Studio', 'Golden_Avatar_Production',
    'Abhay_Charan_Movie', 'Hare_Krishna_in_USSR_Riga', '/06_-_More/Srila_Prabhupada',
    'Complete_Valmiki_Ramayana',
  ].join('|'),
  'i',
);

const AUDIO_EXT = /\.(mp3|m4a|wma|ogg|wav|aac)$/i;

async function get(url, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer()).toString('latin1');
    } catch (e) {
      if (i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 3000 * (i + 1)));
    }
  }
}

const folderUrl = (p) => `${HOST}/index.php?q=f&f=${encodeURIComponent(p)}`;

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&#183;/g, '·')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseSubfolders(html, dir) {
  const out = new Set();
  for (const m of html.matchAll(/index\.php\?q=f&f=([^"'&>\s]+)/g)) {
    let p;
    try {
      p = decodeURIComponent(m[1].replace(/\+/g, ' '));
    } catch {
      continue;
    }
    if (!p.startsWith(dir + '/')) continue;
    const rest = p.slice(dir.length + 1);
    if (!rest || rest.includes('/')) continue;
    out.add(p);
  }
  return [...out];
}

function parseFiles(html) {
  const out = [];
  const chunks = html.split('<input type=checkbox name="f[]" value="');
  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];
    const href = chunk.match(/<a href="(\/[^"]+)"/);
    if (!href) continue;
    let filePath;
    try {
      filePath = decodeURIComponent(href[1]);
    } catch {
      filePath = href[1];
    }
    if (!AUDIO_EXT.test(filePath)) continue;
    const titleM = chunk.match(/<font size="2">([^<]*)<\/font>/);
    const sizeM = chunk.match(/<font size="1" color="aaaaaa">([^<]*)<\/font>/);
    let sizeBytes = 0;
    if (sizeM) {
      const num = decodeEntities(sizeM[1]).match(/([\d.]+)\s*(KB|MB|GB)/i);
      if (num) {
        const v = parseFloat(num[1]);
        const unit = num[2].toUpperCase();
        sizeBytes = Math.round(v * (unit === 'GB' ? 1024 ** 3 : unit === 'MB' ? 1024 ** 2 : 1024));
      }
    }
    out.push([filePath, titleM ? decodeEntities(titleM[1]) : '', sizeBytes]);
  }
  return out;
}

(async () => {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  if (process.argv.includes('--fresh') && fs.existsSync(CACHE)) fs.unlinkSync(CACHE);

  // Rebuild the frontier from whatever is already cached.
  const done = new Map();
  if (fs.existsSync(CACHE)) {
    for (const line of fs.readFileSync(CACHE, 'utf8').split('\n')) {
      if (!line) continue;
      try {
        const rec = JSON.parse(line);
        done.set(rec.d, rec.s);
      } catch {
        // A line cut short by Ctrl-C — that folder is simply fetched again.
      }
    }
  }
  const queued = new Set(done.keys());
  const queue = [];
  const enqueue = (d) => {
    if (queued.has(d) || SKIP_DIR.test(d)) return;
    queued.add(d);
    queue.push(d);
  };
  for (const r of ROOTS) if (!done.has(r)) enqueue(r);
  for (const subs of done.values()) for (const s of subs) enqueue(s);

  const out = fs.createWriteStream(CACHE, { flags: 'a' });
  let fetched = 0;
  let files = 0;
  let failed = 0;
  const started = Date.now();

  const tick = () => {
    const mins = ((Date.now() - started) / 60000).toFixed(1);
    process.stdout.write(
      `\r  ${done.size + fetched} folders (${fetched} this run, ${queue.length} queued, ` +
        `${failed} failed) · ${files} audio files · ${mins} min      `,
    );
  };

  // A simple shared-queue pool: workers pull until the queue is drained AND
  // no other worker is still fetching (which could add more).
  let inFlight = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (;;) {
        const dir = queue.shift();
        if (!dir) {
          if (inFlight === 0) return;
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }
        inFlight++;
        try {
          const html = await get(folderUrl(dir));
          const subs = parseSubfolders(html, dir);
          const f = parseFiles(html);
          out.write(JSON.stringify({ d: dir, s: subs, f }) + '\n');
          fetched++;
          files += f.length;
          for (const s of subs) enqueue(s);
        } catch (e) {
          failed++;
          console.error(`\n  ! ${dir} — ${e.message}`);
        } finally {
          inFlight--;
        }
        tick();
      }
    }),
  );

  out.end();
  tick();
  console.log(`\nDone. Cache: ${path.relative(process.cwd(), CACHE)}`);
  if (failed) console.log(`${failed} folders failed — re-run to retry them.`);
})();
