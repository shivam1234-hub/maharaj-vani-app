#!/usr/bin/env node
/**
 * Prints what the scraped catalogues actually contain — run after a scrape to
 * sanity-check coverage and metadata extraction before shipping the data.
 *
 *   node scripts/catalog-stats.js
 */

const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');

const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : '—');

for (const file of fs.readdirSync(DATA).filter((f) => /^catalog-.+\.json$/.test(f))) {
  if (file === 'catalog-index.json') continue;

  const key = file.replace(/^catalog-|\.json$/g, '');
  const recs = JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf8'));

  const ids = new Set(recs.map((r) => r.id));
  const dated = recs.filter((r) => r.date).length;
  const located = recs.filter((r) => r.location).length;
  const versed = recs.filter((r) => r.scripture).length;
  const bytes = recs.reduce((s, r) => s + (r.sizeBytes || 0), 0);
  const years = recs.map((r) => r.year).filter(Boolean);

  console.log(`\n=== ${key} ===`);
  console.log(`recordings   ${recs.length}`);
  console.log(`unique ids   ${ids.size}${ids.size === recs.length ? '' : '  ** COLLISION **'}`);
  console.log(`with date    ${dated} (${pct(dated, recs.length)})`);
  console.log(`with place   ${located} (${pct(located, recs.length)})`);
  console.log(`with verse   ${versed} (${pct(versed, recs.length)})`);
  console.log(`years        ${years.length ? `${Math.min(...years)}–${Math.max(...years)}` : '—'}`);
  console.log(`total audio  ${(bytes / 1024 ** 3).toFixed(1)} GB`);

  const cats = {};
  for (const r of recs) cats[r.category] = (cats[r.category] ?? 0) + 1;
  console.log('categories   ' +
    Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}:${n}`).join('  '));

  const missingUrl = recs.filter((r) => !/^https:\/\//.test(r.url || ''));
  if (missingUrl.length) console.log(`** ${missingUrl.length} records have a non-https url **`);
}

const indexFile = path.join(DATA, 'catalog-index.json');
if (fs.existsSync(indexFile)) {
  const idx = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
  console.log(`\nscraped at   ${idx.generatedAt}`);
}
