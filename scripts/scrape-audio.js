#!/usr/bin/env node
/**
 * Builds data/catalog-<speaker>.json — every recording of each speaker on
 * audio.iskcondesiretree.com, wherever on the site it lives.
 *
 * Two phases, because their recordings are not all in one place:
 *
 *   Phase 1 — walk the speaker's OWN folder tree recursively. Authoritative
 *   and complete for that subtree: every file there is theirs regardless of
 *   what it is named. (Some speakers have no folder of their own; for them
 *   only phase 2 applies.)
 *
 *   Phase 2 — the rest of the site. A large share of their classes sit in
 *   shared collections (ISKCON Chowpatty yatras/seminars/monthly archives,
 *   ISKCON Mayapur, NVCC Pune, Bhaktivedanta Manor, …) alongside other
 *   speakers'. Only files whose NAME identifies the speaker are attributed —
 *   a folder like `96_-_Yatra` holds many speakers and must not be taken
 *   wholesale.
 *
 *   Phase 2 reads scripts/.cache/site-crawl.jsonl (written by
 *   scripts/crawl-site.js) when it exists: that is every file on the site, so
 *   nothing depends on the site search finding it. Without the cache it falls
 *   back to the site search, which matches filenames.
 *
 * Why a recursive folder walk and not the site's playlist endpoint:
 * `index.php?q=p&p=<folder>` returns every mp3 under a folder in one request
 * but silently truncates at exactly 5000 lines, which dropped 10 of
 * Radhanath Swami's 13 subfolders with no error. Folder pages have no cap and
 * additionally carry the display title and file size.
 *
 *   node scripts/scrape-audio.js                 # every speaker, both phases
 *   node scripts/scrape-audio.js --only lokanath
 *   node scripts/scrape-audio.js --skip-search   # phase 1 only (fast)
 *   node scripts/scrape-audio.js --concurrency 8
 *   node scripts/scrape-audio.js --remeta        # no network: re-derive date,
 *                                                # year, place, category of
 *                                                # the existing catalogues
 */

const fs = require('fs');
const path = require('path');
const {
  folderUrl, searchUrl, fileUrl, get,
  parseSubfolders, parseFiles, parseAudioHrefs, titleFromFileName,
  parseDate, parseYear, parseLocation, parseScripture, classify,
  makeId, breadcrumbOf,
} = require('./lib/metadata');

const ROOT = path.join(__dirname, '..');
const CRAWL_CACHE = path.join(__dirname, '.cache', 'site-crawl.jsonl');

const argOf = (flag, dflt) => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : dflt;
};
const ONLY = argOf('--only', null);
const CONCURRENCY = Number(argOf('--concurrency', 6));
const SKIP_SEARCH = process.argv.includes('--skip-search');
const REMETA = process.argv.includes('--remeta');

/** Another speaker's own folder: a Vyasa-puja offering *to* someone there is not theirs. */
const OTHERS_OWN_FOLDER = /^\/0[234]_-_ISKCON_(Swamis|Prabhujis|Matajis)\/[^/]+\/H(is|er)_(Holiness|Grace)_/;

const SOURCES = [
  {
    key: 'radhanath',
    idPrefix: 'rns',
    name: 'His Holiness Radhanath Swami',
    // The swami's root, not just /Lectures — the root also holds Bhajans.
    root: '/02_-_ISKCON_Swamis/ISKCON_Swamis_-_R_to_Y/His_Holiness_Radhanath_Swami',
    searchTerms: ['Radhanath', 'Radhanatha', 'RNS'],
    // Attribution for files found outside the root. Delimiter-bounded so
    // "RNS" matches the "RNS SB 03-24-40" naming but not a chance substring.
    namePattern: /(^|[^A-Za-z])(radhanath[a]?|rns)([^A-Za-z]|$)/i,
  },
  {
    key: 'gourgovinda',
    idPrefix: 'ggs',
    name: 'His Holiness Gour Govinda Swami',
    // His root, not the English_Lectures subfolder alone: the root also holds
    // Bhajans plus Hindi and Oriya lectures.
    root: '/02_-_ISKCON_Swamis/ISKCON_Swamis_-_D_to_P/His_Holiness_Gour_Govinda_Swami',
    searchTerms: ['Gour_Govinda', 'Gour Govinda', 'Gaura Govinda', 'GGS'],
    namePattern: /(^|[^A-Za-z])(gour[a]?[-_ ]?govinda|ggs)([^A-Za-z]|$)/i,
  },
  {
    key: 'lokanath',
    idPrefix: 'lns',
    name: 'His Holiness Lokanath Swami',
    root: '/02_-_ISKCON_Swamis/ISKCON_Swamis_-_D_to_P/His_Holiness_Lokanath_Swami',
    searchTerms: ['Lokanath', 'Lokanatha', 'LNS'],
    // "Lokanath" alone also names Srila Lokanatha Gosvami (disappearance-day
    // classes by other speakers), so outside his tree the name must be
    // followed by Swami/Maharaj, or be his "LNS" file prefix.
    namePattern: /(^|[^A-Za-z])(lokanatha?[-_ ]+(swami|sw|maharaja?)|lns)([^A-Za-z]|$)/i,
    excludePath: OTHERS_OWN_FOLDER,
  },
  {
    key: 'bhaktiashraya',
    idPrefix: 'bavs',
    name: 'His Holiness Bhakti Ashraya Vaishnava Swami',
    root: '/02_-_ISKCON_Swamis/ISKCON_Swamis_-_A_to_C/His_Holiness_Bhakti_Ashraya_Vaishnava_Swami',
    searchTerms: ['Ashraya Vaishnava', 'BAVS'],
    namePattern: /(^|[^A-Za-z])(bhakti[-_ ]+ashraya[-_ ]+vaishnava|bavs)([^A-Za-z]|$)/i,
    excludePath: OTHERS_OWN_FOLDER,
  },
  {
    key: 'amarendra',
    idPrefix: 'amp',
    name: 'His Grace Amarendra Prabhu',
    // No folder of his own on the site: every recording sits in a shared
    // collection (ISKCON Chowpatty, Bhakti Sanga, GEV, …), so only phase 2.
    root: null,
    searchTerms: ['Amarendra'],
    // Not "Amrendra Hari Prabhu" (ISKCON Punjabi Bagh) — a different devotee.
    namePattern: /(^|[^A-Za-z])amarendra(?![-_ ]*(hari|gaura))([^A-Za-z]|$)/i,
    excludePath: OTHERS_OWN_FOLDER,
  },
  {
    key: 'radheshyam',
    idPrefix: 'rsp',
    name: 'His Grace Radheshyam Prabhu',
    root: '/03_-_ISKCON_Prabhujis/ISKCON_Prabhujis_-_K_to_R/His_Grace_Radhe_Shyam_Prabhu',
    searchTerms: ['Radheshyam', 'Radhe Shyam'],
    // "Radhe Shyam" is also a common bhajan title, so outside his folder the
    // name has to be followed by Prabhu/Pr/Das, or preceded by HG.
    namePattern:
      /(^|[^A-Za-z])((hg[-_ ]+)radhe[-_ ]?shyama?|radhe[-_ ]?shyama?[-_ ]+(prabhu(ji)?|pr|das[a]?))([^A-Za-z]|$)/i,
    excludePath: OTHERS_OWN_FOLDER,
  },
  {
    key: 'vidvangauranga',
    idPrefix: 'vgp',
    name: 'His Grace Vidvan Gauranga Prabhu',
    root: '/03_-_ISKCON_Prabhujis/ISKCON_Prabhujis_-_S_to_Y/His_Grace_Vidvan_Gauranga_Prabhu',
    searchTerms: ['Vidvan'],
    // "Gauranga Prabhu" alone is HG Gauranga Das (Chowpatty/GEV), a different
    // devotee — "Vidvan" must be there.
    namePattern: /(^|[^A-Za-z])vidvan[-_ ]*gauranga([^A-Za-z]|$)/i,
    excludePath: OTHERS_OWN_FOLDER,
  },
  {
    key: 'vamsivadan',
    idPrefix: 'vvp',
    name: 'His Grace Vamsi Vadan Prabhu',
    // No folder of his own; his classes are in ISKCON NVCC Pune, Mayapur,
    // Vrindavan and Juhu collections.
    root: null,
    searchTerms: ['Vamsi Vadan', 'Vamsivadan', 'Vamshi Vadan'],
    // Must be followed by Pr/Prabhu/Das: "Vamsivadana Thakura" is the
    // associate of Lord Caitanya whose appearance day is lectured on yearly.
    namePattern:
      /(^|[^A-Za-z])vam[s]?h?i[-_ ]?vadana?[-_ ]+(pr|prabhu(ji)?|das[a]?)([^A-Za-z]|$)/i,
    excludePath: OTHERS_OWN_FOLDER,
  },
  {
    key: 'kartikeya',
    idPrefix: 'kdp',
    name: 'His Grace Kartikeya Prabhu',
    // HG Kartikeya Das, ISKCON Whitefield (Bangalore).
    root: '/03_-_ISKCON_Prabhujis/ISKCON_Prabhujis_-_K_to_R/His_Grace_Kartikeya_Prabhu',
    searchTerms: ['Kartikeya'],
    // Pr/Prabhu/Das required: "Kartikeya" alone is also Lord Siva's son,
    // the subject of other speakers' classes (SB 4.7).
    namePattern: /(^|[^A-Za-z])kartikeya[-_ ]+(pr|prabhu(ji)?|das[a]?)([^A-Za-z]|$)/i,
    excludePath: OTHERS_OWN_FOLDER,
  },
];

/**
 * Speakers no longer catalogued, kept only for attribution: a guest class
 * filed inside a catalogued speaker's yatra folder but named for one of
 * these must not be listed under the host.
 */
const ATTRIBUTION_ONLY = [
  { key: 'jayapataka', namePattern: /(^|[^A-Za-z])(jaya?pataka|jps)([^A-Za-z]|$)/i },
];

/** Run `fn` over `items` with a fixed worker pool, reporting progress. */
async function pool(items, fn, onTick) {
  let i = 0;
  let done = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      try {
        await fn(item);
      } catch (e) {
        console.error(`\n  ! ${item} — ${e.message}`);
      }
      done++;
      if (onTick) onTick(done);
    }
  });
  await Promise.all(workers);
}

/** Derived fields only — what --remeta recomputes without the network. */
function deriveMeta(breadcrumb, fileName, title) {
  // Folder names carry the year/series ("Devotional Nectar - 1989"), so date
  // and location searches read the whole path, not just the file name.
  const crumbs = breadcrumb.join(' ');
  const date = parseDate(fileName, crumbs) ?? parseDate(crumbs);
  return {
    category: classify(breadcrumb, title),
    date,
    year: parseYear(`${crumbs} ${fileName}`, date),
    location: parseLocation(`${title} ${crumbs}`),
    scripture: parseScripture(`${title} ${fileName}`),
  };
}

/** Turn a raw folder-page file entry into a catalogue record. */
function toRecord(src, f, { external }) {
  const { breadcrumb, fileName } = breadcrumbOf(f.path, src.root);
  return {
    id: makeId(src.idPrefix, f.path, src.root),
    maharaj: src.key,
    title: f.title,
    fullTitle: [...breadcrumb, f.title].join(' / '),
    url: fileUrl(f.path),
    path: f.path,
    folder: breadcrumb[breadcrumb.length - 1] ?? '',
    breadcrumb,
    ...deriveMeta(breadcrumb, fileName, f.title),
    sizeBytes: f.sizeBytes,
    format: f.format,
    sourceUrl: folderUrl(f.path.split('/').slice(0, -1).join('/')),
    // True for recordings found in shared site collections rather than the
    // speaker's own folder — surfaced in the app as their origin collection.
    external: external || undefined,
    collection: external ? breadcrumb.slice(0, 2).join(' › ') : undefined,
  };
}

// --------------------------------------------------------------- phase 1

/** Recursive walk of the speaker's own subtree. */
async function walkOwnTree(src) {
  if (!src.root) {
    console.log('  [1/2] no own folder on the site — shared collections only');
    return [];
  }
  const seen = new Set([src.root]);
  let frontier = [src.root];
  const files = [];
  let pages = 0;

  while (frontier.length) {
    const next = [];
    await pool(frontier, async (dir) => {
      const html = await get(folderUrl(dir));
      pages++;
      for (const sub of parseSubfolders(html, dir)) {
        if (!seen.has(sub)) {
          seen.add(sub);
          next.push(sub);
        }
      }
      for (const f of parseFiles(html)) files.push(f);
      process.stdout.write(`\r  [1/2] own tree: ${pages} folders, ${files.length} files      `);
    });
    frontier = next;
  }
  process.stdout.write('\n');
  return files;
}

// --------------------------------------------------------------- phase 2

let crawlCache = null;

/** Every file on the site, from the crawl cache — loaded once for all speakers. */
function crawledFiles() {
  if (crawlCache) return crawlCache;
  crawlCache = [];
  for (const line of fs.readFileSync(CRAWL_CACHE, 'utf8').split('\n')) {
    if (!line) continue;
    try {
      const { f } = JSON.parse(line);
      for (const [p, title, sizeBytes] of f) {
        crawlCache.push({
          path: p,
          title: title || titleFromFileName(p.slice(p.lastIndexOf('/') + 1)),
          sizeBytes,
          format: (p.split('.').pop() || '').toUpperCase(),
        });
      }
    } catch {
      // a line cut short by an interrupted crawl
    }
  }
  return crawlCache;
}

/** Shared-collection files named for this speaker, from the crawl cache. */
function sweepFromCache(src) {
  const files = crawledFiles().filter((f) => {
    if (src.root && f.path.startsWith(src.root + '/')) return false;
    if (src.excludePath?.test(f.path)) return false;
    return src.namePattern.test(f.path.slice(f.path.lastIndexOf('/') + 1));
  });
  console.log(`  [2/2] crawl cache: ${files.length} files in shared collections`);
  return files;
}

/**
 * Find this speaker's recordings elsewhere on the site via the site search,
 * which matches filenames; their folders are then fetched to recover proper
 * titles and sizes. Only name-matching files are kept, since these folders
 * are shared with other speakers.
 */
async function sweepViaSearch(src) {
  const candidates = new Set();
  for (const term of src.searchTerms) {
    try {
      const html = await get(searchUrl(term));
      for (const p of parseAudioHrefs(html)) {
        if (src.root && p.startsWith(src.root + '/')) continue;
        if (src.excludePath?.test(p)) continue;
        candidates.add(p);
      }
      process.stdout.write(`\r  [2/2] search "${term}": ${candidates.size} candidates outside own tree      `);
    } catch (e) {
      console.error(`\n  ! search "${term}" — ${e.message}`);
    }
  }
  process.stdout.write('\n');

  const folders = [...new Set([...candidates].map((p) => p.slice(0, p.lastIndexOf('/'))))];
  const files = [];

  await pool(folders, async (dir) => {
    const html = await get(folderUrl(dir));
    for (const f of parseFiles(html)) {
      const fileName = f.path.slice(f.path.lastIndexOf('/') + 1);
      if (src.namePattern.test(fileName)) files.push(f);
    }
  }, (done) => {
    process.stdout.write(`\r  [2/2] sweeping shared folders: ${done}/${folders.length}, ${files.length} files      `);
  });

  process.stdout.write('\n');
  return files;
}

// --------------------------------------------------------------- per source

async function scrapeSource(src) {
  console.log(`\n${src.name}`);

  const own = await walkOwnTree(src);
  let outside = [];
  if (!SKIP_SEARCH) outside = fs.existsSync(CRAWL_CACHE) ? sweepFromCache(src) : await sweepViaSearch(src);

  // Two folders occasionally link the same file, and a search hit can also
  // sit inside the own tree — dedupe on path, preferring the own-tree entry.
  const byPath = new Map();
  for (const f of own) {
    // A speaker's own tree is not exclusively theirs: yatra and festival
    // folders carry guest speakers' classes filed under the host's
    // collection. Where the filename names a DIFFERENT speaker we track, it
    // belongs to them — their own phase 2 finds it. Without this, a
    // Jayapataka Swami class recorded on a Radhanath Swami yatra was listed
    // under Radhanath Swami.
    const fileName = f.path.slice(f.path.lastIndexOf('/') + 1);
    if (!src.namePattern.test(fileName)) {
      const other = [...SOURCES, ...ATTRIBUTION_ONLY].find(
        (o) => o.key !== src.key && o.namePattern.test(fileName),
      );
      if (other) continue;
    }
    if (!byPath.has(f.path)) byPath.set(f.path, { f, external: false });
  }
  for (const f of outside) if (!byPath.has(f.path)) byPath.set(f.path, { f, external: true });

  const records = [];
  for (const { f, external } of byPath.values()) records.push(toRecord(src, f, { external }));

  records.sort(
    (a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.title.localeCompare(b.title),
  );

  console.log(
    `  => ${records.length} recordings ` +
    `(${records.filter((r) => !r.external).length} own tree, ` +
    `${records.filter((r) => r.external).length} shared collections)`,
  );
  return records;
}

/** --remeta: recompute derived fields of an existing catalogue in place. */
function remeta(src, records) {
  let changed = 0;
  for (const r of records) {
    const fileName = r.path.slice(r.path.lastIndexOf('/') + 1);
    const next = deriveMeta(r.breadcrumb, fileName, r.title);
    if (next.date !== r.date || next.year !== r.year) changed++;
    Object.assign(r, next);
  }
  records.sort(
    (a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.title.localeCompare(b.title),
  );
  console.log(`${src.key}: ${changed} of ${records.length} records re-dated`);
  return records;
}

// --------------------------------------------------------------- main

(async () => {
  const sources = ONLY ? SOURCES.filter((s) => s.key === ONLY) : SOURCES;
  if (!sources.length) {
    console.error(`Unknown --only "${ONLY}". Use: ${SOURCES.map((s) => s.key).join(', ')}`);
    process.exit(1);
  }

  const dataDir = path.join(ROOT, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const fileOf = (k) => path.join(dataDir, `catalog-${k}.json`);

  const out = {};
  for (const src of sources) {
    if (REMETA) {
      if (fs.existsSync(fileOf(src.key)))
        out[src.key] = remeta(src, JSON.parse(fs.readFileSync(fileOf(src.key), 'utf8')));
    } else {
      out[src.key] = await scrapeSource(src);
    }
  }

  // One file per speaker rather than one combined blob: the app lazily parses
  // only the catalogue being browsed, which keeps ~10 MB of JSON off the
  // startup path. A partial run (--only) rewrites only its own file.
  for (const [k, recs] of Object.entries(out)) fs.writeFileSync(fileOf(k), JSON.stringify(recs));

  const merged = {};
  for (const src of SOURCES) {
    if (fs.existsSync(fileOf(src.key))) merged[src.key] = JSON.parse(fs.readFileSync(fileOf(src.key), 'utf8'));
  }

  fs.writeFileSync(
    path.join(dataDir, 'catalog-index.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        counts: Object.fromEntries(Object.entries(merged).map(([k, v]) => [k, v.length])),
      },
      null,
      2,
    ),
  );

  console.log('\n--- summary ---');
  for (const [k, recs] of Object.entries(merged)) {
    const dated = recs.filter((r) => r.date).length;
    const located = recs.filter((r) => r.location).length;
    const ext = recs.filter((r) => r.external).length;
    const bytes = recs.reduce((s, r) => s + r.sizeBytes, 0);
    console.log(
      `${k}: ${recs.length} recordings · ${dated} dated · ${located} located · ` +
      `${ext} from shared collections · ${(bytes / 1024 ** 3).toFixed(1)} GB`,
    );
    const cats = {};
    for (const r of recs) cats[r.category] = (cats[r.category] ?? 0) + 1;
    console.log(
      '  ' + Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}:${n}`).join('  '),
    );
  }
  for (const k of Object.keys(out)) {
    console.log(`wrote data/catalog-${k}.json (${(fs.statSync(fileOf(k)).size / 1024 ** 2).toFixed(1)} MB)`);
  }
})();
