#!/usr/bin/env node
/**
 * Builds data/verse-index/{BG,SB-1..SB-12,CC}.json — for every BG / SB / CC verse, the lectures on
 * it: archive audio and YouTube, from the catalogued Maharajas and Prabhujis,
 * plus other speakers as a fallback.
 *
 * Inputs (all produced by other scripts, so this one is offline and fast):
 *   data/verse-table.json        every verse, chapter by chapter  (build-verse-table.js)
 *   data/catalog-<key>.json      catalogued speakers' recordings (scrape-audio.js)
 *   data/verse-youtube.json      catalogued speakers' verse videos (scrape-verse-youtube.js)
 *   scripts/.cache/verse-others-raw.json  other speakers' verse audio (build-verse-others.js)
 *
 * Output shape (arrays rather than objects — this ships in the app bundle):
 *   speakers: string[]   first CATALOGUED.length are catalogue keys, the rest
 *                        are display names of other speakers
 *   dirs:     string[]   folder paths, shared by the other-speaker rows
 *   tiers:    number[]     per speaker: 0 catalogued, 1 other Maharaja (Swami),
 *                          2 Srila Prabhupada, 3 other Prabhuji/Mataji
 *   audio:    [speaker, id, title, date, refs, dir?, file?, sizeKB?][]
 *             Other speakers have no catalogue to resolve an id against, so
 *             their rows carry dir/file instead and id is null — the app
 *             derives it from the path (utils/archiveId.js). Their title is
 *             null when it is just the file name, which the app rebuilds.
 *   video:    [speaker, videoId, title, durationSec, channel, refs][]
 *   refs:     "SB/10/4:3-5|BG//2:47" — chapter key, then verse range ("" = whole chapter)
 *
 *   node scripts/build-verse-index.js
 */

const fs = require('fs');
const path = require('path');
const { parseVerseRefs, chapterKey, entryStart, entryEnd } = require('../utils/verseRef');
const { archiveTitle } = require('../utils/archiveId');

const DATA = path.join(__dirname, '..', 'data');
const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
const HOST = 'https://audio.iskcondesiretree.com';

/** Catalogued speakers, in the order the app's `catalogued` list is read back (hooks/useVerses.ts). */
const CATALOGUED = [
  'radhanath', 'lokanath', 'bhaktiashraya', 'gourgovinda',
  'amarendra', 'radheshyam', 'vidvangauranga', 'vamsivadan', 'kartikeya',
];

/**
 * Other speakers, in tiers: other Maharajas (ISKCON Swamis), then Srila
 * Prabhupada, then Prabhujis and Matajis as a last resort that only tops a
 * verse up to FILL_*. Maharajas are capped per verse (round-robin across
 * speakers, English/Hindi first): popular verses carry hundreds of classes —
 * many in Slovenian or Russian — and keeping every one made the index 13 MB.
 * The cap only trims verses that already have plenty; no verse loses coverage.
 */
const MAHARAJAS_PER_VERSE = 25;
const MAHARAJAS_PER_CHAPTER_TALK = 10;
const FILL_PER_VERSE = 12;
const FILL_PER_CHAPTER_TALK = 6;

// ------------------------------------------------------------ verse table

const table = read('verse-table.json');
/** chapterKey -> { max, entries } for validation. */
const chapters = new Map();
for (const book of table.books) {
  for (const part of book.parts) {
    for (const ch of part.chapters) {
      const max = ch.verses.reduce((m, e) => Math.max(m, entryEnd(e)), 0);
      chapters.set(chapterKey(book.key, part.key, ch.n), { max, entries: ch.verses });
    }
  }
}

/** Keep only references to verses that exist; clip ranges to the chapter. */
function validRefs(refs) {
  const out = [];
  const seen = new Set();
  for (const r of refs) {
    const key = chapterKey(r.book, r.part, r.chapter);
    const ch = chapters.get(key);
    if (!ch) continue;
    let enc;
    if (r.from == null) enc = `${key}:`;
    else {
      if (r.from < 1 || r.from > ch.max) continue;
      const to = Math.min(r.to ?? r.from, ch.max);
      enc = to > r.from ? `${key}:${r.from}-${to}` : `${key}:${r.from}`;
    }
    if (!seen.has(enc)) {
      seen.add(enc);
      out.push(enc);
    }
  }
  return out;
}

/** The verse entry ("16-18") a verse number falls in — groups the fallback cap. */
function entryOf(key, verse) {
  const ch = chapters.get(key);
  return ch.entries.find((e) => verse >= entryStart(e) && verse <= entryEnd(e)) ?? String(verse);
}

// ------------------------------------------------------------ id + date

/** Only unambiguous four-digit-year dates — enough to order lectures by age. */
function looseDate(s) {
  const t = s.replace(/_/g, ' ');
  let m = t.match(/(19[6-9]\d|20[0-3]\d)[-. ](\d{1,2})[-. ](\d{1,2})(?!\d)/);
  if (m && +m[2] <= 12 && +m[3] <= 31) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/(?<!\d)(\d{1,2})[-. ](\d{1,2})[-. ](19[6-9]\d|20[0-3]\d)(?!\d)/);
  if (m && +m[2] <= 12 && +m[1] <= 31) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = t.match(/(?<!\d)(19[6-9]\d|20[0-3]\d)(?!\d)/);
  return m ? m[1] : '';
}

// ------------------------------------------------------------ build

const speakers = [...CATALOGUED];
const tiers = CATALOGUED.map(() => 0);
const speakerIdx = new Map(CATALOGUED.map((k, i) => [k, i]));
const audio = [];
const video = [];
const stats = {};
/** Folder paths shared by the other-speaker rows. */
const dirs = [];
const bump = (k, f) => {
  stats[k] = stats[k] ?? { audio: 0, video: 0 };
  stats[k][f]++;
};

// 1. Catalogued speakers' audio.
const knownUrls = new Set();
for (const key of CATALOGUED) {
  const file = path.join(DATA, `catalog-${key}.json`);
  if (!fs.existsSync(file)) {
    console.warn(`  ! missing ${file} — run npm run scrape:${key}`);
    continue;
  }
  for (const r of JSON.parse(fs.readFileSync(file, 'utf8'))) {
    knownUrls.add(r.path);
    // Title and filename both: titles are sometimes prettified and drop the ref.
    const refs = validRefs(parseVerseRefs(`${r.title} ${r.path.slice(r.path.lastIndexOf('/') + 1)}`));
    if (!refs.length) continue;
    audio.push([speakerIdx.get(key), r.id, r.title, r.date ?? (r.year ? String(r.year) : ''), refs.join('|')]);
    bump(key, 'audio');
  }
}

// 2. Catalogued speakers' YouTube.
if (fs.existsSync(path.join(DATA, 'verse-youtube.json'))) {
  for (const v of read('verse-youtube.json')) {
    const refs = validRefs(v.refs ?? parseVerseRefs(v.title));
    if (!refs.length || !speakerIdx.has(v.speaker)) continue;
    video.push([speakerIdx.get(v.speaker), v.videoId, v.title, v.durationSec ?? 0, v.channel ?? '', refs.join('|')]);
    bump(v.speaker, 'video');
  }
}

// 3. Other speakers' audio: all Maharajas + Prabhupada, Prabhujis as top-up.
const SPELLING = {
  'Prahladananada Swami': 'Prahladananda Swami',
  'Bhakti Vigna Vinasa Narsimha Swami': 'Bhakti Vigna Vinasa Narasimha Swami',
  'Bhakti Prabhupada Vrata Damodar Swami': 'Bhakti Prabhupada Vrata Damodara Swami',
  'Bhakti Prabhupada Vrat Damodar Swami': 'Bhakti Prabhupada Vrata Damodara Swami',
  'Bhakti Prabhupada Vrata Domadar Swami': 'Bhakti Prabhupada Vrata Damodara Swami',
  'Bhakti Aryava Priti Vardhana Swami': 'Bhakti Arjava Priti Vardhana Swami',
  'Bhakti Padma Saurabh Pracahrak Swami': 'Bhakti Padma Saurabh Pracharak Swami',
};
const CATALOGUED_NAME =
  /radhanath|lokanath|ashraya\s*vaishnava|gou?ra?\s*govinda|radhe\s*shyam|^amarendra(?!\s*hari)|vidvan\s*gauranga|vam(s|sh)?i\s*vadan|^kartikeya\s+prabhu/i;
const OTHERS_RAW = path.join(__dirname, '.cache', 'verse-others-raw.json');
if (fs.existsSync(OTHERS_RAW)) {
  const canonical = new Map(); // compact name -> display name (first seen; folder names come first)
  const compact = (n) => n.toLowerCase().replace(/(swami|goswami|maharaja?)/g, '').replace(/[^a-z]/g, '');
  const rows = JSON.parse(fs.readFileSync(OTHERS_RAW, 'utf8')).sort((a, b) =>
    // Folder-attributed rows first, so their (cleaner) spelling becomes canonical.
    Number(!a.path.startsWith('/02_')) - Number(!b.path.startsWith('/02_')),
  );

  /** "entryKey" -> candidate rows, for the per-verse cap. */
  const buckets = new Map();
  for (const row of rows) {
    if (knownUrls.has(row.path) || CATALOGUED_NAME.test(row.speaker)) continue;
    const file = row.path.slice(row.path.lastIndexOf('/') + 1);
    const refs = validRefs(parseVerseRefs(`${file} ${row.title ?? ''}`));
    if (!refs.length) continue;
    // Misspellings in the site's own folder names, which would otherwise
    // split one speaker in two.
    row.speaker = SPELLING[row.speaker] ?? row.speaker;
    const c = compact(row.speaker);
    if (!canonical.has(c)) canonical.set(c, row.speaker);
    const cand = { ...row, speaker: canonical.get(c), file, refs };
    // Bucket by the first reference — what the lecture is filed under.
    const [key, range] = refs[0].split(':');
    const bucket = range ? `${key}:${entryOf(key, parseInt(range, 10))}` : `${key}:`;
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket).push(cand);
  }

  const dirIdx = new Map();
  for (const [bucket, list] of buckets) {
    const fill = bucket.endsWith(':') ? FILL_PER_CHAPTER_TALK : FILL_PER_VERSE;
    // Lectures in a language other than English/Hindi sort last within a tier.
    const foreign = (r) =>
      /Russian|rus_|Spanish|Espanol|Portug|Italian|Slovenian|Slovenski|German|French|Polish|Hungarian|Czech|Chinese|Persian|Thai|Ukrain|Latvian|Lithuan/i.test(
        r.path,
      );
    const byTier = (t) => list.filter((r) => (r.tier ?? 1) === t);
    /** Round-robin across speakers, non-foreign first, until `cap`. */
    const roundRobin = (rows, picked, cap) => {
      const bySpeaker = new Map();
      for (const r of rows.sort((a, b) => Number(foreign(a)) - Number(foreign(b)))) {
        if (!bySpeaker.has(r.speaker)) bySpeaker.set(r.speaker, []);
        bySpeaker.get(r.speaker).push(r);
      }
      const queues = [...bySpeaker.values()];
      for (let round = 0; picked.length < cap && queues.some((q) => q.length > round); round++) {
        for (const q of queues) if (q[round] && picked.length < cap) picked.push(q[round]);
      }
    };
    const picked = [];
    roundRobin(byTier(1), picked, bucket.endsWith(':') ? MAHARAJAS_PER_CHAPTER_TALK : MAHARAJAS_PER_VERSE);
    picked.push(...byTier(2)); // Srila Prabhupada: always all of them
    roundRobin(byTier(3), picked, Math.max(fill, picked.length));
    for (const r of picked) {
      if (!speakerIdx.has(r.speaker)) {
        speakerIdx.set(r.speaker, speakers.length);
        speakers.push(r.speaker);
        tiers.push(r.tier ?? 1);
      }
      const dir = r.path.slice(0, r.path.lastIndexOf('/'));
      if (!dirIdx.has(dir)) {
        dirIdx.set(dir, dirs.length);
        dirs.push(dir);
      }
      audio.push([
        speakerIdx.get(r.speaker),
        // The id is rebuilt in the app from dir + file (utils/archiveId.js),
        // and so is the title when it is just the file name: shipping them
        // would nearly double the file.
        null,
        r.title && r.title !== archiveTitle(r.file) ? r.title : null,
        looseDate(r.path),
        r.refs.join('|'),
        dirIdx.get(dir),
        r.file,
        r.size ? Math.round(r.size / 1024) : 0,
      ]);
      bump('(others)', 'audio');
    }
  }
}

const out = {
  generatedAt: new Date().toISOString(),
  host: HOST,
  catalogued: CATALOGUED,
  speakers,
  tiers,
  dirs,
  audio,
  video,
};
/**
 * One file per shard — BG, each SB canto, CC — holding only the rows that
 * reference it (with the speaker and folder tables re-indexed to match). The
 * app loads a shard the first time it is opened, so reading one canto never
 * pays for the whole ~10 MB Bhagavatam index.
 */
const SHARDS = ['BG', ...Array.from({ length: 12 }, (_, i) => `SB/${i + 1}`), 'CC'];
const OUTS = [];
fs.mkdirSync(path.join(DATA, 'verse-index'), { recursive: true });
for (const book of SHARDS) {
  const spMap = new Map();
  const dirMap = new Map();
  const part = { ...out, speakers: [], tiers: [], dirs: [], audio: [], video: [] };
  // Catalogued speakers keep their fixed leading positions.
  CATALOGUED.forEach((k, i) => {
    spMap.set(i, i);
    part.speakers.push(speakers[i]);
    part.tiers.push(0);
  });
  const sp = (i) => {
    if (!spMap.has(i)) {
      spMap.set(i, part.speakers.length);
      part.speakers.push(speakers[i]);
      part.tiers.push(tiers[i]);
    }
    return spMap.get(i);
  };
  const dr = (i) => {
    if (i == null) return undefined;
    if (!dirMap.has(i)) {
      dirMap.set(i, part.dirs.length);
      part.dirs.push(dirs[i]);
    }
    return dirMap.get(i);
  };
  const mine = (refs) => refs.split('|').filter((r) => r.startsWith(`${book}/`)).join('|');
  for (const a of audio) {
    const refs = mine(a[4]);
    if (!refs) continue;
    const row = [sp(a[0]), a[1], a[2], a[3], refs];
    if (a[5] != null) row.push(dr(a[5]), a[6], a[7]);
    part.audio.push(row);
  }
  for (const v of video) {
    const refs = mine(v[5]);
    if (refs) part.video.push([sp(v[0]), v[1], v[2], v[3], v[4], refs]);
  }
  const file = path.join(DATA, 'verse-index', `${book.replace('/', '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(part));
  OUTS.push(file);
}
for (const legacy of ['verse-index.json', 'verse-index-BG.json', 'verse-index-SB.json', 'verse-index-CC.json']) {
  if (fs.existsSync(path.join(DATA, legacy))) fs.unlinkSync(path.join(DATA, legacy));
}

// ------------------------------------------------------------ coverage report

const covered = { BG: new Set(), SB: new Set(), CC: new Set() };
const total = { BG: 0, SB: 0, CC: 0 };
for (const [key, ch] of chapters) {
  const book = key.split('/')[0];
  total[book] += ch.entries.length;
}
for (const row of [...audio.map((a) => a[4]), ...video.map((v) => v[5])]) {
  for (const enc of row.split('|')) {
    const [key, range] = enc.split(':');
    if (!range) continue;
    const [a, b] = range.split('-').map(Number);
    for (let v = a; v <= (b || a); v++) covered[key.split('/')[0]].add(`${key}:${entryOf(key, v)}`);
  }
}

console.log('per speaker:', stats);
for (const b of ['BG', 'SB', 'CC']) {
  console.log(
    `${b}: ${covered[b].size}/${total[b]} verse entries have at least one lecture ` +
      `(${((covered[b].size / total[b]) * 100).toFixed(1)}%)`,
  );
}
console.log(`${audio.length} audio + ${video.length} video rows, ${speakers.length} speakers`);
for (const f of OUTS) console.log(`  ${path.relative(process.cwd(), f)} (${(fs.statSync(f).size / 1024 ** 2).toFixed(1)} MB)`);
