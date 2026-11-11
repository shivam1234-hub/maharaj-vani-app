#!/usr/bin/env node
/**
 * Builds data/verse-table.json — the canonical list of every verse of
 * Bhagavad-gita, Srimad-Bhagavatam and Sri Caitanya-caritamrta, chapter by
 * chapter, with chapter titles, from vedabase.io.
 *
 * The Verses tab is driven entirely by this table: it decides what "every
 * verse in sequence" means, and the verse index (build-verse-index.js) uses it
 * to reject references that don't exist (a filename "SB 13.2.4" is a date or a
 * typo, not a verse).
 *
 * Verse groupings are kept as Vedabase prints them: BG 1.16-18 is one entry
 * "16-18", because that is how the purports are grouped and how lectures on
 * them are named.
 *
 *   node scripts/build-verse-table.js
 */

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'data', 'verse-table.json');
const HOST = 'https://vedabase.io';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0 Safari/537.36';

async function get(url, attempts = 4) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
}

const decode = (s) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

/** "CHAPTER TWO: Divinity and Divine Service" -> "Divinity and Divine Service" */
const chapterTitle = (s) => s.replace(/^.*?(CHAPTER|Chapter)\s+[A-Za-z-]+\s*[:.]?\s*/, '').trim() || s;

/** Child links one level below `base`, in numeric order, with their link text. */
function children(html, base) {
  const out = new Map();
  const re = new RegExp(`<a[^>]*href="${base.replace(/[/.]/g, '\\$&')}([^"/]+)/"[^>]*>([\\s\\S]*?)</a>`, 'g');
  for (const m of html.matchAll(re)) {
    const key = m[1];
    if (!/^\d+(-\d+)?$/.test(key)) continue;
    const text = decode(m[2]);
    if (!out.has(key) || (text && !out.get(key))) out.set(key, text);
  }
  return [...out.entries()].sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10));
}

async function chapter(base) {
  const html = await get(`${HOST}${base}`);
  return children(html, base).map(([k]) => k);
}

async function chapters(base) {
  const html = await get(`${HOST}${base}`);
  const list = children(html, base);
  const out = [];
  for (const [n, text] of list) {
    const verses = await chapter(`${base}${n}/`);
    out.push({ n: Number(n), title: chapterTitle(text), verses });
    process.stdout.write(`\r  ${base}${n}  (${verses.length} verses)        `);
  }
  return out;
}

(async () => {
  const table = { generatedAt: new Date().toISOString(), books: [] };

  console.log('Bhagavad-gita');
  table.books.push({
    key: 'BG',
    name: 'Bhagavad-gita As It Is',
    // BG has no canto level; a single implicit part keeps the shape uniform.
    parts: [{ key: '', name: '', chapters: await chapters('/en/library/bg/') }],
  });

  console.log('\nSrimad-Bhagavatam');
  const sb = { key: 'SB', name: 'Srimad-Bhagavatam', parts: [] };
  for (let c = 1; c <= 12; c++) {
    sb.parts.push({ key: String(c), name: `Canto ${c}`, chapters: await chapters(`/en/library/sb/${c}/`) });
  }
  table.books.push(sb);

  console.log('\nSri Caitanya-caritamrta');
  const cc = { key: 'CC', name: 'Sri Caitanya-caritamrta', parts: [] };
  for (const [key, name] of [['adi', 'Adi-lila'], ['madhya', 'Madhya-lila'], ['antya', 'Antya-lila']]) {
    cc.parts.push({ key, name, chapters: await chapters(`/en/library/cc/${key}/`) });
  }
  table.books.push(cc);

  fs.writeFileSync(OUT, JSON.stringify(table));
  console.log('\n');
  for (const b of table.books) {
    const ch = b.parts.reduce((s, p) => s + p.chapters.length, 0);
    const v = b.parts.reduce((s, p) => s + p.chapters.reduce((t, c) => t + c.verses.length, 0), 0);
    console.log(`${b.key}: ${ch} chapters, ${v} verse entries`);
  }
  console.log(`wrote ${path.relative(process.cwd(), OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
})();
