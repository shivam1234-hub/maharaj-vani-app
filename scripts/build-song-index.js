#!/usr/bin/env node
/**
 * Builds data/song-index.json — for every entry of the Prayers & Songs
 * catalogue (utils/songs.js: Gurvastakam, Siksastakam, the Saranagati songs,
 * Kunti's prayers …), the lectures that explain it: archive audio from the
 * catalogued Maharajas and Prabhujis, then other Maharajas, Srila Prabhupada,
 * and other Prabhujis/Matajis.
 *
 * Recordings of a song being sung (kirtan, bhajan albums, recitations) are
 * left out unless their title says they are explained — see isPerformance().
 *
 * Inputs (offline):
 *   data/catalog-<key>.json              catalogued speakers' recordings
 *   scripts/.cache/site-crawl.jsonl      every file on the site (crawl-site.js;
 *                                        run with --roots /01_-_Srila_Prabhupada/01_-_Lectures
 *                                        for Srila Prabhupada's purports)
 *
 * Output — same row shape as a verse-index shard, so the app reuses the
 * guest-recording code (utils/archiveId.js ids, shard "song"):
 *   audio: [speaker, id, title, date, songIds ("gurvastakam|siksastakam"), dir?, file?, sizeKB?][]
 *
 *   node scripts/build-song-index.js
 */

const fs = require('fs');
const path = require('path');
const { SONGS, matchSongs, isPerformance } = require('../utils/songs');
const { archiveTitle } = require('../utils/archiveId');
const { speakerOf, SPELLING } = require('./lib/speaker');

const DATA = path.join(__dirname, '..', 'data');
const CRAWL = path.join(__dirname, '.cache', 'site-crawl.jsonl');
const OUT = path.join(DATA, 'song-index.json');
const HOST = 'https://audio.iskcondesiretree.com';

/** Same order as the verse index (data/verseIndex.ts reads catalogued speakers by position). */
const CATALOGUED = [
  'radhanath', 'lokanath', 'bhaktiashraya', 'gourgovinda',
  'amarendra', 'radheshyam', 'vidvangauranga', 'vamsivadan', 'kartikeya',
];
const CATALOGUED_NAME =
  /radhanath|lokanath|ashraya\s*vaishnava|gou?ra?\s*govinda|radhe\s*shyam|^amarendra(?!\s*hari)|vidvan\s*gauranga|vam(s|sh)?i\s*vadan|^kartikeya\s+prabhu/i;

/** Per song: other Maharajas (round-robin across speakers), then Prabhujis/Matajis top it up. */
const MAHARAJAS_PER_SONG = 60;
const FILL_PER_SONG = 90;

const FOREIGN =
  /Russian|rus_|Spanish|Espanol|Portug|Italian|Slovenian|Slovenski|German|French|Polish|Hungarian|Czech|Chinese|Persian|Thai|Ukrain|Latvian|Lithuan|Dutch|Croatian/i;

function looseDate(s) {
  const t = s.replace(/_/g, ' ');
  let m = t.match(/(19[6-9]\d|20[0-3]\d)[-. ](\d{1,2})[-. ](\d{1,2})(?!\d)/);
  if (m && +m[2] <= 12 && +m[3] <= 31) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/(?<!\d)(\d{1,2})[-. ](\d{1,2})[-. ](19[6-9]\d|20[0-3]\d)(?!\d)/);
  if (m && +m[2] <= 12 && +m[1] <= 31) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = t.match(/(?<!\d)(19[6-9]\d|20[0-3]\d)(?!\d)/);
  return m ? m[1] : '';
}

/** Folder (last two levels) + file + title: enough to tell a kirtan album from a seminar. */
const context = (p, title) =>
  `${p.slice(0, p.lastIndexOf('/')).split('/').slice(-2).join(' ')} ${p.slice(p.lastIndexOf('/') + 1)} ${title ?? ''}`;

const speakers = [...CATALOGUED];
const tiers = CATALOGUED.map(() => 0);
const speakerIdx = new Map(CATALOGUED.map((k, i) => [k, i]));
const dirs = [];
const dirIdx = new Map();
const audio = [];
const perSong = Object.fromEntries(SONGS.map((s) => [s.id, { mine: 0, others: 0 }]));

// 1. Catalogued speakers.
const knownPaths = new Set();
for (const key of CATALOGUED) {
  const file = path.join(DATA, `catalog-${key}.json`);
  if (!fs.existsSync(file)) continue;
  for (const r of JSON.parse(fs.readFileSync(file, 'utf8'))) {
    knownPaths.add(r.path);
    const name = r.path.slice(r.path.lastIndexOf('/') + 1);
    const ids = matchSongs(`${r.title} ${name}`);
    if (!ids.length || isPerformance(context(r.path, r.title))) continue;
    audio.push([speakerIdx.get(key), r.id, r.title, r.date ?? (r.year ? String(r.year) : ''), ids.join('|')]);
    for (const id of ids) perSong[id].mine++;
  }
}

// 2. Everyone else, from the crawl.
const canonical = new Map();
const compact = (n) => n.toLowerCase().replace(/(swami|goswami|maharaja?)/g, '').replace(/[^a-z]/g, '');
/** song id -> candidate rows */
const buckets = new Map(SONGS.map((s) => [s.id, []]));
const seen = new Set();
for (const line of fs.readFileSync(CRAWL, 'utf8').split('\n')) {
  if (!line) continue;
  let rec;
  try {
    rec = JSON.parse(line);
  } catch {
    continue;
  }
  for (const [p, title, size] of rec.f) {
    if (seen.has(p) || knownPaths.has(p)) continue;
    const file = p.slice(p.lastIndexOf('/') + 1);
    const ids = matchSongs(`${file} ${title ?? ''}`);
    if (!ids.length || isPerformance(context(p, title))) continue;
    const who = speakerOf(p);
    if (!who || CATALOGUED_NAME.test(who.speaker)) continue;
    seen.add(p);
    const sp = SPELLING[who.speaker] ?? who.speaker;
    const c = compact(sp);
    if (!canonical.has(c)) canonical.set(c, sp);
    // Filed under its first song; the others are listed on the row too.
    buckets.get(ids[0]).push({ path: p, file, title, size, ids, speaker: canonical.get(c), tier: who.tier });
  }
}

for (const [, list] of buckets) {
  const byTier = (t) => list.filter((r) => r.tier === t);
  const roundRobin = (rows, picked, cap) => {
    const bySpeaker = new Map();
    for (const r of rows.sort((a, b) => Number(FOREIGN.test(a.path)) - Number(FOREIGN.test(b.path)))) {
      if (!bySpeaker.has(r.speaker)) bySpeaker.set(r.speaker, []);
      bySpeaker.get(r.speaker).push(r);
    }
    const queues = [...bySpeaker.values()];
    for (let round = 0; picked.length < cap && queues.some((q) => q.length > round); round++) {
      for (const q of queues) if (q[round] && picked.length < cap) picked.push(q[round]);
    }
  };
  const picked = [];
  roundRobin(byTier(1), picked, MAHARAJAS_PER_SONG);
  picked.push(...byTier(2)); // Srila Prabhupada: always all of them
  roundRobin(byTier(3), picked, Math.max(FILL_PER_SONG, picked.length));
  for (const r of picked) {
    if (!speakerIdx.has(r.speaker)) {
      speakerIdx.set(r.speaker, speakers.length);
      speakers.push(r.speaker);
      tiers.push(r.tier);
    }
    const dir = r.path.slice(0, r.path.lastIndexOf('/'));
    if (!dirIdx.has(dir)) {
      dirIdx.set(dir, dirs.length);
      dirs.push(dir);
    }
    audio.push([
      speakerIdx.get(r.speaker),
      null,
      r.title && r.title !== archiveTitle(r.file) ? r.title : null,
      looseDate(r.path),
      r.ids.join('|'),
      dirIdx.get(dir),
      r.file,
      r.size ? Math.round(r.size / 1024) : 0,
    ]);
    for (const id of r.ids) perSong[id].others++;
  }
}

fs.writeFileSync(
  OUT,
  JSON.stringify({ generatedAt: new Date().toISOString(), host: HOST, catalogued: CATALOGUED, speakers, tiers, dirs, audio }),
);

const empty = SONGS.filter((s) => !perSong[s.id].mine && !perSong[s.id].others).map((s) => s.id);
console.log(
  SONGS.map((s) => `${s.id}:${perSong[s.id].mine}+${perSong[s.id].others}`).join('  '),
);
console.log(`\n${SONGS.length - empty.length}/${SONGS.length} entries have lectures${empty.length ? ` (none yet: ${empty.join(', ')})` : ''}`);
console.log(`${audio.length} rows, ${speakers.length} speakers → ${path.relative(process.cwd(), OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
