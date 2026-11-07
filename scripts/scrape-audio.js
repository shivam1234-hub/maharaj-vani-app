#!/usr/bin/env node
/**
 * Builds data/catalog-<maharaja>.json — every recording of each Maharaja on
 * audio.iskcondesiretree.com, wherever on the site it lives.
 *
 * Two phases, because their recordings are not all in one place:
 *
 *   Phase 1 — walk the Maharaja's OWN folder tree recursively. Authoritative
 *   and complete for that subtree: every file there is theirs regardless of
 *   what it is named.
 *
 *   Phase 2 — sweep the rest of the site. A large share of their classes sit
 *   in shared collections (ISKCON Chowpatty yatras/seminars/monthly archives,
 *   ISKCON Mayapur, Bhaktivedanta Manor, Los Angeles, …) alongside other
 *   speakers'. Those are found via the site's own search, which matches
 *   FILENAMES, so it surfaces exactly the files that name the speaker. Each
 *   containing folder is then fetched for real titles and sizes, and only
 *   files whose name identifies this Maharaja are attributed to them — a
 *   folder like `96_-_Yatra` holds many speakers and must not be taken wholesale.
 *
 * Why a recursive folder walk and not the site's playlist endpoint:
 * `index.php?q=p&p=<folder>` returns every mp3 under a folder in one request
 * but silently truncates at exactly 5000 lines, which dropped 10 of
 * Radhanath Swami's 13 subfolders with no error. Folder pages have no cap and
 * additionally carry the display title and file size.
 *
 *   node scripts/scrape-audio.js                 # both, both phases
 *   node scripts/scrape-audio.js --only lokanath
 *   node scripts/scrape-audio.js --skip-search   # phase 1 only (fast)
 *   node scripts/scrape-audio.js --concurrency 8
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HOST = 'https://audio.iskcondesiretree.com';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const argOf = (flag, dflt) => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : dflt;
};
const ONLY = argOf('--only', null);
const CONCURRENCY = Number(argOf('--concurrency', 6));
const SKIP_SEARCH = process.argv.includes('--skip-search');

// Audio only — the tree also holds .flv/.mp4 festival footage, which this
// audio app has no player for.
const AUDIO_EXT = /\.(mp3|m4a|wma|ogg|wav|aac)$/i;

const SOURCES = [
  {
    key: 'radhanath',
    idPrefix: 'rns',
    name: 'His Holiness Radhanath Swami',
    short: 'Radhanath Swami',
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
    short: 'Gour Govinda Swami',
    // His root, not the English_Lectures subfolder alone: the root also holds
    // Bhajans plus Hindi and Oriya lectures.
    root: '/02_-_ISKCON_Swamis/ISKCON_Swamis_-_D_to_P/His_Holiness_Gour_Govinda_Swami',
    searchTerms: ['Gour_Govinda', 'Gour Govinda', 'Gaura Govinda', 'GGS'],
    namePattern: /(^|[^A-Za-z])(gour[a]?[-_ ]?govinda|ggs)([^A-Za-z]|$)/i,
  },  {
    key: 'lokanath',
    idPrefix: 'lns',
    name: 'His Holiness Lokanath Swami',
    short: 'Lokanath Swami',
    root: '/02_-_ISKCON_Swamis/ISKCON_Swamis_-_D_to_P/His_Holiness_Lokanath_Swami',
    searchTerms: ['Lokanath', 'Lokanatha', 'LNS'],
    // "Lokanath" alone also names Srila Lokanatha Gosvami (disappearance-day
    // classes by other speakers), so outside his tree the name must be
    // followed by Swami/Maharaj, or be his "LNS" file prefix.
    namePattern: /(^|[^A-Za-z])(lokanatha?[-_ ]+(swami|sw|maharaja?)|lns)([^A-Za-z]|$)/i,
    // Other speakers' own folders hold Vyasa-puja offerings TO him — theirs, not his.
    excludePath: /^\/0[23]_-_ISKCON_(Swamis|Prabhujis)\/[^/]+\/His_(Holiness|Grace)_/,
  },
  {
    key: 'bhaktiashraya',
    idPrefix: 'bavs',
    name: 'His Holiness Bhakti Ashraya Vaishnava Swami',
    short: 'Bhakti Ashraya Vaishnava Swami',
    root: '/02_-_ISKCON_Swamis/ISKCON_Swamis_-_A_to_C/His_Holiness_Bhakti_Ashraya_Vaishnava_Swami',
    searchTerms: ['Ashraya Vaishnava', 'BAVS'],
    namePattern: /(^|[^A-Za-z])(bhakti[-_ ]+ashraya[-_ ]+vaishnava|bavs)([^A-Za-z]|$)/i,
    excludePath: /^\/0[23]_-_ISKCON_(Swamis|Prabhujis)\/[^/]+\/His_(Holiness|Grace)_/,
  },
];

/**
 * Speakers no longer catalogued, kept only for attribution: a guest class
 * filed inside a catalogued Maharaja's yatra folder but named for one of
 * these must not be listed under the host.
 */
const ATTRIBUTION_ONLY = [
  { key: 'jayapataka', namePattern: /(^|[^A-Za-z])(jaya?pataka|jps)([^A-Za-z]|$)/i },
];

// --------------------------------------------------------------- http

async function get(url, attempts = 4) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
        signal: AbortSignal.timeout(180_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Pages are declared iso-8859-1; decode as latin1 so the odd accented
      // title survives instead of turning into replacement characters.
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.toString('latin1');
    } catch (e) {
      if (i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
}

const folderUrl = (p) => `${HOST}/index.php?q=f&f=${encodeURIComponent(p)}`;
const searchUrl = (t) => `${HOST}/index.php?q=s&sm=ff&s=${encodeURIComponent(t)}`;

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

// --------------------------------------------------------------- parsing

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

/** Subfolders strictly one level below `dir` (skips breadcrumb ancestors). */
function parseSubfolders(html, dir) {
  const out = new Set();
  for (const m of html.matchAll(/index\.php\?q=f&f=([^"'&>\s]+)/g)) {
    let p;
    try {
      p = decodeURIComponent(m[1]);
    } catch {
      continue;
    }
    if (!p.startsWith(dir + '/')) continue;
    const rest = p.slice(dir.length + 1);
    if (!rest || rest.includes('/')) continue; // deeper links appear on their own page
    out.add(p);
  }
  return [...out];
}

/** Audio files listed directly in a folder page. */
function parseFiles(html) {
  const out = [];
  // Each file row begins with its checkbox; slicing on that keeps the href,
  // title and size of one file together and never straddles two rows.
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
    let format = (filePath.split('.').pop() || '').toUpperCase();
    if (sizeM) {
      const txt = decodeEntities(sizeM[1]);
      const num = txt.match(/([\d.]+)\s*(KB|MB|GB)/i);
      if (num) {
        const v = parseFloat(num[1]);
        const unit = num[2].toUpperCase();
        sizeBytes = Math.round(v * (unit === 'GB' ? 1024 ** 3 : unit === 'MB' ? 1024 ** 2 : 1024));
      }
      const fmt = txt.split('·').pop()?.trim();
      if (fmt && /^[A-Z0-9]{2,5}$/i.test(fmt)) format = fmt.toUpperCase();
    }

    out.push({
      path: filePath,
      title: titleM
        ? decodeEntities(titleM[1])
        : decodeEntities(filePath.split('/').pop().replace(AUDIO_EXT, '').replace(/_/g, ' ')),
      sizeBytes,
      format,
    });
  }
  return out;
}

/** Every audio path linked anywhere on a page (used for search results). */
function parseAudioHrefs(html) {
  const out = new Set();
  for (const m of html.matchAll(/href="(\/[^"]+)"/g)) {
    let p;
    try {
      p = decodeURIComponent(m[1]);
    } catch {
      continue;
    }
    if (AUDIO_EXT.test(p)) out.add(p);
  }
  return out;
}

// --------------------------------------------------------------- metadata

const LOCATIONS = [
  'Mumbai', 'Chowpatty', 'Juhu', 'Mayapur', 'Mayapura', 'Vrindavan', 'Vrindavana',
  'Radhadesh', 'Pune', 'Delhi', 'New Delhi', 'Kolkata', 'Calcutta', 'Chennai',
  'Bangalore', 'Ahmedabad', 'Hyderabad', 'Nagpur', 'Surat', 'Jaipur', 'Udupi',
  'Govardhan', 'Barsana', 'Puri', 'Tirupati', 'Rishikesh', 'Haridwar', 'Amravati',
  'London', 'Manor', 'Bhaktivedanta Manor', 'Birmingham', 'Leicester', 'Scotland',
  'Ireland', 'Dublin', 'Paris', 'Germany', 'Berlin', 'Zurich', 'Switzerland',
  'Italy', 'Rome', 'Spain', 'Sweden', 'Netherlands', 'Amsterdam', 'Belgium',
  'Russia', 'Moscow', 'Ukraine', 'Kiev', 'Poland', 'Hungary', 'Slovenia', 'Croatia',
  'New York', 'Los Angeles', 'Chicago', 'Dallas', 'Houston', 'Denver', 'Detroit',
  'Boston', 'Philadelphia', 'Washington', 'Atlanta', 'Miami', 'Seattle',
  'San Diego', 'San Francisco', 'Alachua', 'Gita Nagari', 'New Vrindaban',
  'Toronto', 'Vancouver', 'Montreal', 'Mexico', 'Brazil', 'Argentina', 'Chile',
  'Peru', 'Colombia', 'Australia', 'Sydney', 'Melbourne', 'Perth', 'Brisbane',
  'New Zealand', 'Auckland', 'South Africa', 'Durban', 'Johannesburg', 'Cape Town',
  'Mauritius', 'Kenya', 'Nairobi', 'Dubai', 'Bahrain', 'Kuwait', 'Singapore',
  'Malaysia', 'Kuala Lumpur', 'Indonesia', 'Bali', 'Thailand', 'Bangkok',
  'Philippines', 'Manila', 'Hong Kong', 'China', 'Japan', 'Tokyo', 'Sri Lanka',
  'Colombo', 'Nepal', 'Kathmandu', 'Bangladesh', 'Dhaka', 'Fiji', 'Trinidad',
  'Guyana', 'Ekachakra', 'Simhachalam', 'Villa Vrindavana', 'Goloka Dhama', 'GEV',
];

// Longest first so "New Vrindaban" wins over "Vrindavan", "New Delhi" over "Delhi".
const LOCATION_MATCHERS = LOCATIONS
  .slice()
  .sort((a, b) => b.length - a.length)
  .map((name) => ({
    name,
    re: new RegExp(
      `(?:^|[^A-Za-z])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[ _-]')}(?:[^A-Za-z]|$)`,
      'i',
    ),
  }));

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9,
  sept: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
};

const THIS_YEAR = new Date().getFullYear();

const iso = (y, m, d) =>
  y >= 1965 && y <= THIS_YEAR && m >= 1 && m <= 12 && d >= 1 && d <= 31
    ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    : null;

/** Two-digit years in this corpus are all 1970s-2000s recordings. */
const expandYear = (yy) => (yy <= THIS_YEAR % 100 ? 2000 + yy : 1900 + yy);

/**
 * Verse references are numerically indistinguishable from dates —
 * "JPS SB 01-05-35" would otherwise read as 1 May 2035 — so they are masked
 * out before any date pattern is tried.
 */
const SCRIPTURE_REF = /\b(?:BG|SB|CC|NOI|NOD|ISO|BS)\b[- ]*\d{1,3}(?:[.\- ]\d{1,3}){0,3}/gi;

const maskScripture = (s) => s.replace(SCRIPTURE_REF, (m) => ' '.repeat(m.length));

/**
 * Dates appear in several grammars across the trees, e.g.
 * "1989-01-13", "18-04-89", "22_Nov_2007", "Nov_22_2007", "20070122".
 */
function parseDate(text) {
  const s = maskScripture(text.replace(/_/g, ' '));
  let m;

  if ((m = s.match(/(19[6-9]\d|20[0-3]\d)[-. ](\d{1,2})[-. ](\d{1,2})(?!\d)/)))
    return iso(+m[1], +m[2], +m[3]);

  if ((m = s.match(/(\d{1,2})[-. ](\d{1,2})[-. ](19[6-9]\d|20[0-3]\d)(?!\d)/)))
    return iso(+m[3], +m[2], +m[1]);

  if ((m = s.match(/(\d{1,2})[-. ]([A-Za-z]{3,9})[-. ](19[6-9]\d|20[0-3]\d)(?!\d)/))) {
    const mo = MONTHS[m[2].toLowerCase()];
    if (mo) return iso(+m[3], mo, +m[1]);
  }

  if ((m = s.match(/([A-Za-z]{3,9})[-. ](\d{1,2})[,-. ]+(19[6-9]\d|20[0-3]\d)(?!\d)/))) {
    const mo = MONTHS[m[1].toLowerCase()];
    if (mo) return iso(+m[3], mo, +m[2]);
  }

  if ((m = s.match(/(\d{1,2})[-. ]([A-Za-z]{3,9})[-. ](\d{2})(?!\d)/))) {
    const mo = MONTHS[m[2].toLowerCase()];
    if (mo) return iso(expandYear(+m[3]), mo, +m[1]);
  }

  // Bare DD-MM-YY, the loosest form — only trusted last.
  if ((m = s.match(/(?:^|[^\d])(\d{1,2})[-.](\d{1,2})[-.](\d{2})(?!\d)/)))
    return iso(expandYear(+m[3]), +m[2], +m[1]);

  if ((m = s.match(/(?:^|[^\d])(19[6-9]\d|20[0-3]\d)(\d{2})(\d{2})(?!\d)/)))
    return iso(+m[1], +m[2], +m[3]);

  return null;
}

function parseYear(text, date) {
  if (date) return +date.slice(0, 4);
  const m = maskScripture(text.replace(/_/g, ' ')).match(/(?:^|[^\d])(19[6-9]\d|20[0-3]\d)(?!\d)/);
  return m && +m[1] <= THIS_YEAR ? +m[1] : null;
}

function parseLocation(text) {
  for (const { name, re } of LOCATION_MATCHERS) if (re.test(text)) return name;
  return null;
}

/** "BG-2_47", "SB-07_15_68", "CC Madhya 8.128" -> "BG 2.47" etc. */
function parseScripture(text) {
  const s = text.replace(/_/g, ' ');
  let m;
  if ((m = s.match(/\b(BG|SB|CC|NOI|NOD|ISO|BS)\b[- ]*((?:\d{1,3})(?:[.\- ]\d{1,3}){0,3})/i)) && m[2]) {
    const book = m[1].toUpperCase();
    const ref = m[2]
      .trim()
      .replace(/[- ]+/g, '.')
      .replace(/\.+/g, '.')
      .split('.')
      .map((p) => p.replace(/^0+(?=\d)/, ''))
      .join('.');
    return `${book} ${ref}`;
  }
  if (/\bBhagavad[- ]?gita\b/i.test(s)) return 'BG';
  if (/\bSrimad[- ]?Bhagavatam\b/i.test(s)) return 'SB';
  if (/\bCaitanya[- ]?caritamrta\b/i.test(s)) return 'CC';
  if (/\bRamayana\b/i.test(s)) return 'Ramayana';
  return null;
}

/**
 * Coarse bucket used by the category grid. Derived from where the file sits in
 * the tree first (the site's own curation), then from the title.
 */
function classify(breadcrumb, title) {
  const crumbs = breadcrumb.join(' / ');
  const all = `${crumbs} ${title}`;

  if (/Bhajan|Kirtan/i.test(all) && !/Lecture|Class/i.test(all)) return 'Kirtan';
  if (/Short[_ ]?Clip/i.test(crumbs)) return 'ShortClip';
  if (/Seminar/i.test(crumbs)) return 'Seminar';
  if (/Yatra/i.test(crumbs)) return 'Yatra';
  if (/Ramayana/i.test(all)) return 'Ramayana';
  if (/Journey[_ ]?Home|Audio[_ ]?Book/i.test(crumbs)) return 'AudioBook';
  if (/Brihad[_ ]?Bhagavatamrata/i.test(crumbs)) return 'Brihad';
  if (/Amrit[_ ]?Droplet/i.test(crumbs)) return 'Droplets';
  if (/Gaura[_ ]?Lila/i.test(crumbs)) return 'GauraLila';
  if (/Disciple/i.test(crumbs)) return 'Disciples';
  if (/Bengali/i.test(crumbs)) return 'Bengali';
  if (/Hindi/i.test(crumbs)) return 'Hindi';
  if (/Spanish|Italian|Tamil|Malayalam|Thai|Russian|Translation/i.test(crumbs)) return 'Translated';
  if (/Theme[_ ]?wise/i.test(crumbs)) return 'Theme';
  if (/Festival|Gaura[_ ]?Poornima|Janmastami|Rath[_ ]?Yatra/i.test(all)) return 'Festival';

  const sc = parseScripture(all);
  if (sc?.startsWith('BG')) return 'Bhagavad-gita';
  if (sc?.startsWith('SB')) return 'Srimad-Bhagavatam';
  if (sc?.startsWith('CC')) return 'CC';

  return 'General';
}

/**
 * Stable, filesystem-safe id — also the on-disk download folder name and the
 * key for history/favourites, so it must be unique and must never change
 * between scrapes for the same file.
 *
 * The readable slug alone is not unique: collapsing punctuation makes
 * "Rama's_Mercy" and "Rama_s_Mercy" the same string, and the tree does carry
 * such pairs. Every id therefore ends in a hash of the full path.
 */
function makeId(idPrefix, filePath, root) {
  const rel = filePath.startsWith(root) ? filePath.slice(root.length) : filePath;
  const slug = rel
    .replace(AUDIO_EXT, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  // FNV-1a over the full path — distinct files always get distinct suffixes.
  let h = 0x811c9dc5;
  for (let i = 0; i < filePath.length; i++) {
    h ^= filePath.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }

  return `${idPrefix}-${slug.slice(0, 80)}-${h.toString(36)}`;
}

/** Turn a raw folder-page file entry into a catalogue record. */
function toRecord(src, f, { external }) {
  const inRoot = f.path.startsWith(src.root + '/');
  const rel = inRoot ? f.path.slice(src.root.length + 1) : f.path.slice(1);
  const segs = rel.split('/');
  const breadcrumb = segs
    .slice(0, -1)
    .map((s) => s.replace(/_/g, ' ').replace(/^\d+\s*-\s*/, '').trim())
    .filter(Boolean);
  const fileName = segs[segs.length - 1];
  // Folder names carry the year/series ("Devotional Nectar - 1989"), so date
  // and location searches read the whole path, not just the file name.
  const haystack = `${breadcrumb.join(' ')} ${fileName}`;
  const date = parseDate(fileName) ?? parseDate(breadcrumb.join(' '));

  return {
    id: makeId(src.idPrefix, f.path, src.root),
    maharaj: src.key,
    title: f.title,
    fullTitle: [...breadcrumb, f.title].join(' / '),
    url: `${HOST}${f.path.split('/').map(encodeURIComponent).join('/')}`,
    path: f.path,
    folder: breadcrumb[breadcrumb.length - 1] ?? '',
    breadcrumb,
    category: classify(breadcrumb, f.title),
    date,
    year: parseYear(haystack, date),
    location: parseLocation(`${f.title} ${breadcrumb.join(' ')}`),
    scripture: parseScripture(`${f.title} ${fileName}`),
    sizeBytes: f.sizeBytes,
    format: f.format,
    sourceUrl: folderUrl(f.path.split('/').slice(0, -1).join('/')),
    // True for recordings found in shared site collections rather than the
    // Maharaja's own folder — surfaced in the app as their origin collection.
    external: external || undefined,
    collection: external ? breadcrumb.slice(0, 2).join(' › ') : undefined,
  };
}

// --------------------------------------------------------------- phase 1

/** Recursive walk of the Maharaja's own subtree. */
async function walkOwnTree(src) {
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

/**
 * Find this Maharaja's recordings elsewhere on the site.
 *
 * The site search matches filenames, so it points at the right files; their
 * folders are then fetched to recover proper titles and sizes. Only
 * name-matching files are kept, since these folders are shared with other
 * speakers.
 */
async function sweepRestOfSite(src) {
  const candidates = new Set();
  for (const term of src.searchTerms) {
    try {
      const html = await get(searchUrl(term));
      for (const p of parseAudioHrefs(html)) {
        if (p.startsWith(src.root + '/')) continue;
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
  let done = 0;

  await pool(folders, async (dir) => {
    const html = await get(folderUrl(dir));
    for (const f of parseFiles(html)) {
      // A shared folder holds many speakers; the filename is the only
      // reliable attribution outside the Maharaja's own tree.
      const fileName = f.path.slice(f.path.lastIndexOf('/') + 1);
      if (src.namePattern.test(fileName)) files.push(f);
    }
  }, (d) => {
    done = d;
    process.stdout.write(`\r  [2/2] sweeping shared folders: ${done}/${folders.length}, ${files.length} files      `);
  });

  process.stdout.write('\n');
  return files;
}

// --------------------------------------------------------------- per source

async function scrapeSource(src) {
  console.log(`\n${src.name}`);

  const own = await walkOwnTree(src);
  const outside = SKIP_SEARCH ? [] : await sweepRestOfSite(src);

  // Two folders occasionally link the same file, and a search hit can also
  // sit inside the own tree — dedupe on path, preferring the own-tree entry.
  const byPath = new Map();
  for (const f of own) {
    // A Maharaja's own tree is not exclusively his: yatra and festival folders
    // carry guest speakers' classes filed under the host's collection. Where
    // the filename names a DIFFERENT Maharaja we track, it belongs to them —
    // their own phase-2 sweep finds it, because the site search matches
    // filenames. Without this, a Jayapataka Swami class recorded on a
    // Radhanath Swami yatra was listed under Radhanath Swami.
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

// --------------------------------------------------------------- main

(async () => {
  const sources = ONLY ? SOURCES.filter((s) => s.key === ONLY) : SOURCES;
  if (!sources.length) {
    console.error(`Unknown --only "${ONLY}". Use: ${SOURCES.map((s) => s.key).join(', ')}`);
    process.exit(1);
  }

  const dataDir = path.join(ROOT, 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  const out = {};
  for (const src of sources) out[src.key] = await scrapeSource(src);

  // One file per Maharaja rather than one combined blob: the app lazily parses
  // only the catalogue being browsed, which keeps ~10 MB of JSON off the
  // startup path. A partial run (--only) rewrites only its own file.
  for (const [k, recs] of Object.entries(out)) {
    fs.writeFileSync(path.join(dataDir, `catalog-${k}.json`), JSON.stringify(recs));
  }

  const merged = {};
  for (const src of SOURCES) {
    const f = path.join(dataDir, `catalog-${src.key}.json`);
    if (fs.existsSync(f)) merged[src.key] = JSON.parse(fs.readFileSync(f, 'utf8'));
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
  for (const k of Object.keys(merged)) {
    const f = path.join(dataDir, `catalog-${k}.json`);
    console.log(`wrote data/catalog-${k}.json (${(fs.statSync(f).size / 1024 ** 2).toFixed(1)} MB)`);
  }
})();
