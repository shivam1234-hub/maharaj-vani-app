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
 * Srila Prabhupada's own root is not in the crawl (it is the Prabhupada Vani
 * app's subject); his verse lectures are carried over from the previous
 * raw file, which reached them via the site search.
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

const CACHE = path.join(__dirname, '.cache', 'site-crawl.jsonl');
// Build input only (36 MB) — kept out of data/ so it is never bundled or committed.
const OUT = path.join(__dirname, '.cache', 'verse-others-raw.json');
const AUDIO_EXT = /\.(mp3|m4a|wma|ogg|wav|aac)$/i;

const tidy = (s) => s.replace(/_/g, ' ').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim();

/** "Kesi Daman Pr" -> "Kesi Daman Prabhu", "Bhakti Vikas Sw" -> "Bhakti Vikas Swami". */
function honorific(name, title) {
  if (/^(swami|sw|goswami|maharaja?)$/i.test(title)) return `${name} ${/goswami/i.test(title) ? 'Goswami' : 'Swami'}`;
  if (/^(mataji|mtj|devi\s*dasi)$/i.test(title)) return `${name} Mataji`;
  return `${name} Prabhu`;
}

/** Words that sit just before an honorific in a title but are not part of a name. */
const NOT_NAME = /^(by|hg|hh|his|her|grace|holiness|sri|srila|class|lecture|day|part|and|with|the|of)$/i;

/**
 * Who gave the class, from where the file sits or what it is named.
 * Returns null when the speaker can't be told — such files are skipped rather
 * than guessed at.
 */
function speakerOf(p) {
  let m = p.match(/^\/02_-_ISKCON_Swamis\/[^/]+\/His_Holiness_([^/]+)\//);
  if (m) return { speaker: tidy(m[1]), tier: 1 };
  m = p.match(/^\/03_-_ISKCON_Prabhujis\/[^/]+\/His_Grace_([^/]+)\//) || p.match(/\/His_Grace_([^/]+)\//);
  if (m) return { speaker: tidy(m[1]).replace(/\s+Prabhu$/i, '') + ' Prabhu', tier: 3 };
  m = p.match(/^\/04_-_ISKCON_Matajis\/(?:[^/]+\/)?Her_Grace_([^/]+)\//) || p.match(/\/Her_Grace_([^/]+)\//);
  if (m) return { speaker: tidy(m[1]).replace(/\s+Mataji$/i, '') + ' Mataji', tier: 3 };
  if (/^\/0[34]_-_ISKCON_/.test(p)) return null;

  // Shared collections name the speaker in the file:
  //   "2017-12-14_BG_18-62_-_Kesi_Daman_Pr_ISKCON_Vrindavan"
  //   "… - Prahladananda_Swami_ISKCON_Slovenia", "Bhakti_Vikas_Sw_BG_08-05_…"
  const file = tidy(p.slice(p.lastIndexOf('/') + 1).replace(AUDIO_EXT, ''));
  const re = /((?:[A-Z][a-z]+\s+){0,3}[A-Z][a-z]+)\s+(Swami|Goswami|Maharaja?|Sw|Prabhuji|Prabhu|Pr|Mataji|Mtj|Devi\s+Dasi)\b/g;
  let best = null;
  for (const hit of file.matchAll(re)) {
    const words = hit[1].split(' ').filter((w) => !NOT_NAME.test(w));
    if (!words.length) continue;
    best = { name: words.join(' '), title: hit[2] };
  }
  if (!best) return null;
  if (/^(Srila|Prabhupada)/i.test(best.name)) return null;
  const tier = /^(swami|goswami|maharaja?|sw)$/i.test(best.title) ? 1 : 3;
  return { speaker: honorific(best.name, best.title), tier };
}

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
