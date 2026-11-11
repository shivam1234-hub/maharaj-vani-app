/**
 * Page parsing and metadata derivation shared by the scrapers:
 * scripts/scrape-audio.js (per-speaker catalogues) and
 * scripts/build-verse-index.js (every verse class on the site).
 */

const HOST = 'https://audio.iskcondesiretree.com';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// Audio only — the tree also holds .flv/.mp4 festival footage, which this
// audio app has no player for.
const AUDIO_EXT = /\.(mp3|m4a|wma|ogg|wav|aac)$/i;

const folderUrl = (p) => `${HOST}/index.php?q=f&f=${encodeURIComponent(p)}`;
const searchUrl = (t) => `${HOST}/index.php?q=s&sm=ff&s=${encodeURIComponent(t)}`;
const fileUrl = (p) => `${HOST}${p.split('/').map(encodeURIComponent).join('/')}`;

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

/** Audio files listed directly in a folder page (or a search results page). */
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
        : titleFromFileName(filePath.split('/').pop()),
      sizeBytes,
      format,
    });
  }
  return out;
}

const titleFromFileName = (name) => decodeEntities(name.replace(AUDIO_EXT, '').replace(/_/g, ' '));

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
  'NVCC', 'Punjabi Bagh', 'Dwarka', 'Noida', 'Gurgaon', 'Kanpur', 'Vapi', 'Nigdi',
  'Mira Road', 'Belgaum', 'Kolhapur', 'Salem', 'Madurai', 'Bhopal', 'Whitefield',
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

const TODAY = new Date().toISOString().slice(0, 10);
const THIS_YEAR = +TODAY.slice(0, 4);

/** A real calendar date that is not in the future, else null. */
const iso = (y, m, d) => {
  if (!(y >= 1965 && y <= THIS_YEAR && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const s = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return s <= TODAY ? s : null;
};

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
 *
 * `context` is the folder breadcrumb. It settles the one truly ambiguous
 * grammar, bare "NN-NN-NN": ISKCON Chowpatty names its files YY-MM-DD
 * ("04-12-26" in folder "2004" is 26 Dec 2004), most others DD-MM-YY. Read
 * blindly as DD-MM-YY, "11-11-26" became 11 Nov 2026 — a date in the future,
 * which floated those classes to the top of every newest-first list.
 */
function parseDate(text, context = '') {
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

  // Bare NN-NN-NN, the loosest form — only trusted last, and the one form
  // where the folder's year decides between DD-MM-YY and YY-MM-DD.
  if ((m = s.match(/(?:^|[^\d])(\d{1,2})[-.](\d{1,2})[-.](\d{2})(?!\d)/))) {
    const dmy = iso(expandYear(+m[3]), +m[2], +m[1]);
    const ymd = iso(expandYear(+m[1]), +m[2], +m[3]);
    const ctxYears = new Set((context.match(/(?:19[6-9]\d|20[0-3]\d)/g) || []).map(Number));
    if (ymd && ctxYears.has(+ymd.slice(0, 4))) return ymd;
    if (dmy && ctxYears.has(+dmy.slice(0, 4))) return dmy;
    return dmy ?? ymd;
  }

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

/**
 * "BG-2_47", "SB-07_15_68" -> "BG 2.47". This is the catalogue's legacy
 * `scripture` field, which utils/matchArchive.ts compares against; the
 * verse-wise index uses utils/verseRef.ts instead.
 */
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

/** FNV-1a over a string, base 36. */
function fnv(s, seed = 0x811c9dc5) {
  let h = seed;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
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
  const rel = root && filePath.startsWith(root) ? filePath.slice(root.length) : filePath;
  const slug = rel
    .replace(AUDIO_EXT, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `${idPrefix}-${slug.slice(0, 80)}-${fnv(filePath)}`;
}

/** Readable breadcrumb segments for a path below `root` (or the site root). */
function breadcrumbOf(filePath, root) {
  const inRoot = root && filePath.startsWith(root + '/');
  const rel = inRoot ? filePath.slice(root.length + 1) : filePath.slice(1);
  const segs = rel.split('/');
  return {
    breadcrumb: segs
      .slice(0, -1)
      .map((s) => s.replace(/_/g, ' ').replace(/^\d+\s*-\s*/, '').trim())
      .filter(Boolean),
    fileName: segs[segs.length - 1],
  };
}

module.exports = {
  HOST, UA, AUDIO_EXT,
  folderUrl, searchUrl, fileUrl, get,
  decodeEntities, parseSubfolders, parseFiles, parseAudioHrefs, titleFromFileName,
  parseDate, parseYear, parseLocation, parseScripture, classify,
  fnv, makeId, breadcrumbOf,
};
