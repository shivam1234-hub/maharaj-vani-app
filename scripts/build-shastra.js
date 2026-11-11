#!/usr/bin/env node
/**
 * Builds the English translation of every verse the Verses tab walks through
 * (the verse list itself is data/verse-table.json, from build-verse-table.js;
 * both read the same vedabase.io chapter pages, so their verse units agree):
 *
 *   data/shastra/text-BG.json     { "2.47": "You have a right to perform…" }
 *   data/shastra/text-SB.json     { "1.2.6": "…" }
 *   data/shastra/text-CC.json     { "adi.1.1": "…" }
 *
 * Source: one vedabase.io chapter page per chapter (≈415 requests). A chapter
 * page lists every verse with its translation, and shows joined verses as one
 * unit ("Texts 16-18"), which is exactly the unit a class is given on.
 *
 * Translations are split per book and loaded lazily by the app; the structure
 * file stays small enough to read at startup.
 *
 *   node scripts/build-shastra.js
 *   node scripts/build-shastra.js --only BG
 */

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'data', 'shastra');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36';
const ONLY = (() => {
  const i = process.argv.indexOf('--only');
  return i > -1 ? process.argv[i + 1] : null;
})();

const SB_CANTOS = [
  [1, 'Creation', 19],
  [2, 'The Cosmic Manifestation', 10],
  [3, 'The Status Quo', 33],
  [4, 'The Creation of the Fourth Order', 31],
  [5, 'The Creative Impetus', 26],
  [6, 'Prescribed Duties for Mankind', 19],
  [7, 'The Science of God', 15],
  [8, 'Withdrawal of the Cosmic Creations', 24],
  [9, 'Liberation', 24],
  [10, 'The Summum Bonum', 90],
  [11, 'General History', 31],
  [12, 'The Age of Deterioration', 13],
];

const CC_LILAS = [
  ['adi', 'Adi-lila', 17],
  ['madhya', 'Madhya-lila', 25],
  ['antya', 'Antya-lila', 20],
];

async function get(url, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
}

const decode = (s) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * One chapter page → its title and ordered verse units.
 * A unit label is "47" or, for joined verses, "16-18".
 */
function parseChapter(html, base) {
  const titleM = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const title = titleM ? decode(titleM[1]) : '';
  const esc = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `<a href="${esc}([0-9]+(?:-[0-9]+)?)/"[^>]*>[^<]*(?:<!-- -->)?:?</a>\\s*<span[^>]*>([\\s\\S]*?)</span>`,
    'g',
  );
  const verses = [];
  const text = {};
  const seen = new Set();
  for (const m of html.matchAll(re)) {
    const label = m[1];
    if (seen.has(label)) continue;
    seen.add(label);
    verses.push(label);
    text[label] = decode(m[2]);
  }
  // Fallback: a page whose markup moved still lists the verse links.
  if (!verses.length) {
    for (const m of html.matchAll(new RegExp(`href="${esc}([0-9]+(?:-[0-9]+)?)/"`, 'g'))) {
      if (!seen.has(m[1])) {
        seen.add(m[1]);
        verses.push(m[1]);
      }
    }
  }
  verses.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  return { title, verses, text };
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const it = items[i++];
        await fn(it);
      }
    }),
  );
}

async function buildBook(key) {
  const jobs = [];
  if (key === 'BG') {
    for (let c = 1; c <= 18; c++) jobs.push({ part: null, ch: c, base: `/en/library/bg/${c}/` });
  } else if (key === 'SB') {
    for (const [canto, , n] of SB_CANTOS)
      for (let c = 1; c <= n; c++) jobs.push({ part: canto, ch: c, base: `/en/library/sb/${canto}/${c}/` });
  } else {
    for (const [lila, , n] of CC_LILAS)
      for (let c = 1; c <= n; c++) jobs.push({ part: lila, ch: c, base: `/en/library/cc/${lila}/${c}/` });
  }

  const results = new Map();
  let done = 0;
  await pool(jobs, 4, async (j) => {
    const html = await get(`https://vedabase.io${j.base}`);
    const parsed = parseChapter(html, j.base);
    if (!parsed.verses.length) throw new Error(`no verses parsed at ${j.base}`);
    results.set(j.base, { ...j, ...parsed });
    process.stdout.write(`\r  ${key}: ${++done}/${jobs.length} chapters      `);
  });
  process.stdout.write('\n');

  const text = {};
  const chapterOf = (j) => {
    const r = results.get(j.base);
    const prefix = j.part == null ? `${j.ch}` : `${j.part}.${j.ch}`;
    for (const v of r.verses) text[`${prefix}.${v}`] = r.text[v] ?? '';
    return { n: j.ch, title: r.title.replace(/^(Chapter|Text)\s+\w+:?\s*/i, ''), verses: r.verses };
  };

  let structure;
  if (key === 'BG') {
    structure = { key, name: 'Bhagavad-gita As It Is', chapters: jobs.map(chapterOf) };
  } else if (key === 'SB') {
    structure = {
      key,
      name: 'Srimad-Bhagavatam',
      parts: SB_CANTOS.map(([canto, title]) => ({
        key: String(canto),
        label: `Canto ${canto}`,
        title,
        chapters: jobs.filter((j) => j.part === canto).map(chapterOf),
      })),
    };
  } else {
    structure = {
      key,
      name: 'Sri Caitanya-caritamrta',
      parts: CC_LILAS.map(([lila, title]) => ({
        key: lila,
        label: title,
        title,
        chapters: jobs.filter((j) => j.part === lila).map(chapterOf),
      })),
    };
  }

  return { structure, text };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  for (const key of ['BG', 'SB', 'CC']) {
    if (ONLY && ONLY !== key) continue;
    console.log(`\n${key}`);
    const { text } = await buildBook(key);
    fs.writeFileSync(path.join(OUT, `text-${key}.json`), JSON.stringify(text));
    const units = Object.keys(text).length;
    console.log(`  ${units} verse units · text-${key}.json ${(JSON.stringify(text).length / 1024).toFixed(0)} KB`);
  }

})().catch((e) => {
  console.error('\n' + e.stack);
  process.exit(1);
});
