#!/usr/bin/env node
/**
 * Builds data/verse-table.json — the canonical list of every verse of
 * Bhagavad-gita, Srimad-Bhagavatam, Sri Caitanya-caritamrta, The Nectar of
 * Instruction, Brahma-samhita and Sri Isopanisad, chapter by chapter, with
 * chapter titles, from vedabase.io — plus the chapters of The Nectar of
 * Devotion, which is prose and is followed chapter by chapter instead.
 *
 * The smaller books keep the same book → part → chapter → verse shape:
 *   NOI, ISO  one part, one chapter (n = 1). ISO's Invocation is verse "0".
 *   BS        one part, one chapter (n = 5 — the book is its fifth chapter).
 *   NOD       one part, chapters 0 (Introduction) to 51, each with no verses.
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
 *   node scripts/build-verse-table.js --only NOI,NOD,BS,ISO   # merges into the existing file
 */

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'data', 'verse-table.json');
const ONLY = (() => {
  const i = process.argv.indexOf('--only');
  return i > -1 ? new Set(process.argv[i + 1].toUpperCase().split(',')) : null;
})();
/** Book order on the Verses tab. */
const ORDER = ['BG', 'SB', 'CC', 'NOI', 'NOD', 'BS', 'ISO'];
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

const BUILDERS = {
  async BG() {
    return {
      key: 'BG',
      name: 'Bhagavad-gita As It Is',
      // BG has no canto level; a single implicit part keeps the shape uniform.
      parts: [{ key: '', name: '', chapters: await chapters('/en/library/bg/') }],
    };
  },
  async SB() {
    const sb = { key: 'SB', name: 'Srimad-Bhagavatam', parts: [] };
    for (let c = 1; c <= 12; c++) {
      sb.parts.push({ key: String(c), name: `Canto ${c}`, chapters: await chapters(`/en/library/sb/${c}/`) });
    }
    return sb;
  },
  async CC() {
    const cc = { key: 'CC', name: 'Sri Caitanya-caritamrta', parts: [] };
    for (const [key, name] of [['adi', 'Adi-lila'], ['madhya', 'Madhya-lila'], ['antya', 'Antya-lila']]) {
      cc.parts.push({ key, name, chapters: await chapters(`/en/library/cc/${key}/`) });
    }
    return cc;
  },
  async NOI() {
    const verses = await chapter('/en/library/noi/');
    return {
      key: 'NOI',
      name: 'The Nectar of Instruction',
      parts: [{ key: '', name: '', chapters: [{ n: 1, title: 'Eleven Texts of Srila Rupa Gosvami', verses }] }],
    };
  },
  async ISO() {
    // The Invocation is the verse before Mantra One: entry "0".
    const verses = ['0', ...(await chapter('/en/library/iso/'))];
    return {
      key: 'ISO',
      name: 'Sri Isopanisad',
      parts: [{ key: '', name: '', chapters: [{ n: 1, title: 'The Invocation and Eighteen Mantras', verses }] }],
    };
  },
  async BS() {
    const verses = await chapter('/en/library/bs/5/');
    return {
      key: 'BS',
      name: 'Brahma-samhita',
      parts: [{ key: '', name: '', chapters: [{ n: 5, title: 'Lord Brahma’s Hymn to Govinda', verses }] }],
    };
  },
  async NOD() {
    const html = await get(`${HOST}/en/library/nod/`);
    const list = children(html, '/en/library/nod/').map(([n, text]) => ({
      n: Number(n),
      title: chapterTitle(text),
      verses: [],
    }));
    return {
      key: 'NOD',
      name: 'The Nectar of Devotion',
      parts: [{ key: '', name: '', chapters: [{ n: 0, title: 'Introduction', verses: [] }, ...list] }],
    };
  },
};

(async () => {
  const table =
    ONLY && fs.existsSync(OUT)
      ? JSON.parse(fs.readFileSync(OUT, 'utf8'))
      : { generatedAt: null, books: [] };
  table.generatedAt = new Date().toISOString();

  for (const key of ORDER) {
    if (ONLY && !ONLY.has(key)) continue;
    console.log(`\n${key}`);
    const book = await BUILDERS[key]();
    table.books = table.books.filter((b) => b.key !== key).concat(book);
  }
  table.books.sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));

  fs.writeFileSync(OUT, JSON.stringify(table));
  console.log('\n');
  for (const b of table.books) {
    const ch = b.parts.reduce((s, p) => s + p.chapters.length, 0);
    const v = b.parts.reduce((s, p) => s + p.chapters.reduce((t, c) => t + c.verses.length, 0), 0);
    console.log(`${b.key}: ${ch} chapters, ${v} verse entries`);
  }
  console.log(`wrote ${path.relative(process.cwd(), OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
})();
