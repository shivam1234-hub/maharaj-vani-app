#!/usr/bin/env node
/**
 * Builds scripts/.cache/verse-others-raw.json — every verse lecture on
 * audio.iskcondesiretree.com by a speaker the app does NOT catalogue. These are
 * the fallback in the Verses tab, so a verse the chosen Maharajas/Prabhujis
 * never spoke on still has lectures.
 *
 * Source: scripts/.cache/site-crawl.jsonl (scripts/crawl-site.js) — every
 * file on the site with its real title and size. The site search this used to
 * rely on returns nothing for a query as broad as "SB" and misses the many
 * naming styles, which left most of the Bhagavatam uncovered.
 *
 * Srila Prabhupada's lectures are in the crawl when it was run with
 * `--roots /01_-_Srila_Prabhupada/01_-_Lectures`; any older ones reached via
 * the site search are carried over from the previous raw file.
 *
 * Each row: { path, speaker, tier, title, size }
 *   tier 1 = another Maharaja (ISKCON Swami)       — "any other Maharaja"
 *   tier 2 = Srila Prabhupada
 *   tier 3 = other Prabhujis and Matajis           — last resort
 *
 *   node scripts/build-verse-others.js
 */

const fs = require('fs');
const path = require('path');
const { parseVerseRefs } = require('../utils/verseRef');
const { speakerOf } = require('./lib/speaker');

const CACHE = path.join(__dirname, '.cache', 'site-crawl.jsonl');
// Build input only (36 MB) — kept out of data/ so it is never bundled or committed.
const OUT = path.join(__dirname, '.cache', 'verse-others-raw.json');

(async () => {
  const rows = [];
  const seen = new Set();
  const counts = { 1: 0, 2: 0, 3: 0 };
  let verseFiles = 0;
  let unattributed = 0;

  for (const line of fs.readFileSync(CACHE, 'utf8').split('\n')) {
    if (!line) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    for (const [p, title, size] of rec.f) {
      if (seen.has(p)) continue;
      const file = p.slice(p.lastIndexOf('/') + 1);
      if (!parseVerseRefs(`${file} ${title}`).length) continue;
      verseFiles++;
      const who = speakerOf(p);
      if (!who) {
        unattributed++;
        continue;
      }
      seen.add(p);
      rows.push({ path: p, speaker: who.speaker, tier: who.tier, title, size });
      counts[who.tier]++;
    }
  }

  // Srila Prabhupada, carried over from the search-built file.
  if (fs.existsSync(OUT)) {
    for (const r of JSON.parse(fs.readFileSync(OUT, 'utf8'))) {
      if (!r.path.startsWith('/01_-_Srila_Prabhupada/') || seen.has(r.path)) continue;
      seen.add(r.path);
      rows.push({ path: r.path, speaker: 'Srila Prabhupada', tier: 2, title: r.title ?? '', size: r.size ?? 0 });
      counts[2]++;
    }
  }

  fs.writeFileSync(OUT, JSON.stringify(rows));
  const bySpeaker = {};
  for (const r of rows) bySpeaker[r.speaker] = (bySpeaker[r.speaker] ?? 0) + 1;
  console.log(`${verseFiles} verse files in the crawl, ${unattributed} without a recognisable speaker (skipped)`);
  console.log(`${rows.length} rows · other Maharajas ${counts[1]} · Srila Prabhupada ${counts[2]} · Prabhujis/Matajis ${counts[3]}`);
  console.log(`${Object.keys(bySpeaker).length} speakers; top:`);
  console.log(
    Object.entries(bySpeaker).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => `${k}:${v}`).join('  '),
  );
  console.log(`wrote ${path.relative(process.cwd(), OUT)} (${(fs.statSync(OUT).size / 1024 ** 2).toFixed(1)} MB)`);
})();
