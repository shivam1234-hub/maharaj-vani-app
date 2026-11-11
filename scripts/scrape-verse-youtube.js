#!/usr/bin/env node
/**
 * Builds data/verse-youtube.json — YouTube lectures that name a BG / SB / CC
 * verse in their title, per catalogued speaker.
 *
 * Two sources, because neither alone is complete:
 *
 *   1. Full upload history (Videos + Live tabs) of each speaker's OWN channels.
 *      Everything there is theirs, so no name check is needed.
 *   2. Per-chapter searches ("Radheshyam Prabhu SB 4", "… BG 12", "… CC Madhya"),
 *      which reach classes posted by temples and fan channels. Those channels
 *      carry many speakers, so a result is kept only when its title or channel
 *      names the speaker.
 *
 * Either way a video is kept only if its title parses to a verse reference
 * (utils/verseRef.js — the same parser the app's live search uses).
 *
 * Keyless, like utils/youtube.ts: reads the ytInitialData blob, then pages on
 * through the innertube endpoint with the key the page ships.
 *
 *   node scripts/scrape-verse-youtube.js
 *   node scripts/scrape-verse-youtube.js --only radheshyam   # merges into existing file
 */

const fs = require('fs');
const path = require('path');
const { parseVerseRefs } = require('../utils/verseRef');

const OUT = path.join(__dirname, '..', 'data', 'verse-youtube.json');
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const CONTEXT = { client: { clientName: 'WEB', clientVersion: '2.20240726.00.00', hl: 'en', gl: 'US' } };
const ONLY = (() => {
  const i = process.argv.indexOf('--only');
  return i > -1 ? process.argv[i + 1] : null;
})();

/** Max pages per channel tab (30 videos each) and per search query (~20 each). */
const CHANNEL_PAGES = 120;
const SEARCH_PAGES = 3;
const CONCURRENCY = 4;

const SPEAKERS = [
  {
    key: 'radhanath',
    short: 'Radhanath Swami',
    match: /radhanath/i,
    own: ['UChphslaY9GHwg1fKjngCJIg', 'UCUZTWReIbBYqOFL9TyKFblg', 'UCzywp4-atthpp2FEKnhivYQ'],
  },
  {
    key: 'lokanath',
    short: 'Lokanath Swami',
    match: /lokanath/i,
    own: ['UCsdDftx_W6Hi3DWNsZRJvIA'],
  },
  {
    key: 'bhaktiashraya',
    short: 'Bhakti Ashraya Vaishnava Swami',
    match: /ashraya\s*vai?s?h?nava|bavs/i,
    own: ['UCAjbXXOyV673M85ei4Phf-g'],
  },
  {
    key: 'gourgovinda',
    short: 'Gour Govinda Swami',
    match: /gaura?\s*govinda|gour\s*govinda/i,
    own: ['UCY4k4Ei3Qt-36DW_Y-sbe0Q', 'UC58YBlESBWOLVexg5doV1Qg'],
  },
  {
    key: 'radheshyam',
    short: 'Radheshyam Prabhu',
    match: /radhe\s*shyam/i,
    own: ['UC9Pap1xwEQAo7X1tKqpcpWg'],
  },
  {
    key: 'amarendra',
    short: 'Amarendra Prabhu',
    match: /amarendra/i,
    own: ['UChkQ7Q6cEBQenwKugPjOVjA'],
  },
  {
    key: 'vidvangauranga',
    short: 'Vidvan Gauranga Prabhu',
    // Not "Gauranga Prabhu" alone — that is HG Gauranga Das, another devotee.
    match: /vidvan\s*gauranga/i,
    own: [],
  },
  {
    key: 'vamsivadan',
    short: 'Vamsi Vadan Prabhu',
    // Pr/Prabhu/Das required: "Vamsivadana Thakura" is the acharya.
    match: /vam(?:s|sh)?i\s*vadana?\s*(?:pr|prabhu|das)/i,
    own: [],
  },
  {
    key: 'kartikeya',
    short: 'Kartikeya Prabhu',
    // Pr/Prabhu/Das required — "Kartikeya" alone is also Lord Siva's son.
    match: /kartikeya\s*(?:pr|prabhu|das)/i,
    own: ['UCtIgLzkNyOUPZVTvjTGkXRA'],
  },
];

const SEARCH_SUFFIXES = [
  ...Array.from({ length: 18 }, (_, i) => `BG ${i + 1}`),
  ...Array.from({ length: 12 }, (_, i) => `SB ${i + 1}`),
  'Srimad Bhagavatam',
  'Bhagavad Gita',
  'CC Adi',
  'CC Madhya',
  'CC Antya',
];

// ---------------------------------------------------------------- youtube

function walk(node, visit) {
  if (Array.isArray(node)) for (const v of node) walk(v, visit);
  else if (node && typeof node === 'object') {
    visit(node);
    for (const v of Object.values(node)) walk(v, visit);
  }
}

const runs = (o) => o?.simpleText ?? (o?.runs ?? []).map((r) => r.text).join('') ?? '';

function toSec(t) {
  if (!t) return null;
  const p = String(t).split(':').map(Number);
  if (p.some(Number.isNaN)) return null;
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : null;
}

/** Videos from either renderer shape (search: videoRenderer; channel: lockupViewModel). */
function harvest(data, channelFallback) {
  const videos = [];
  const tokens = [];
  walk(data, (n) => {
    const vr = n.videoRenderer;
    if (vr?.videoId) {
      videos.push({
        videoId: vr.videoId,
        title: runs(vr.title),
        channel: runs(vr.ownerText) || runs(vr.longBylineText),
        channelId: vr.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId ?? null,
        durationSec: toSec(vr.lengthText?.simpleText),
      });
    }
    const lv = n.lockupViewModel;
    if (lv?.contentId && lv.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO') {
      let badge = null;
      walk(lv.contentImage, (b) => {
        if (b.thumbnailBadgeViewModel?.text && !badge) badge = b.thumbnailBadgeViewModel.text;
      });
      videos.push({
        videoId: lv.contentId,
        title: lv.metadata?.lockupMetadataViewModel?.title?.content ?? '',
        channel: channelFallback?.name ?? '',
        channelId: channelFallback?.id ?? null,
        durationSec: toSec(badge),
      });
    }
    const tok = n.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
    if (tok) tokens.push(tok);
  });
  tokens.sort((a, b) => b.length - a.length);
  return { videos, continuation: tokens[0] ?? null };
}

async function fetchRetry(url, init, attempts = 4) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      if (i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
}

async function page(url) {
  const res = await fetchRetry(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' } });
  const html = await res.text();
  const m = html.match(/ytInitialData\s*=\s*(\{.+?\});\s*<\/script>/s);
  if (!m) throw new Error('no ytInitialData');
  const name = html.match(/<meta property="og:title" content="([^"]*)"/)?.[1];
  return {
    data: JSON.parse(m[1]),
    apiKey: html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1],
    name,
  };
}

async function more(endpoint, apiKey, continuation) {
  const res = await fetchRetry(`https://www.youtube.com/youtubei/v1/${endpoint}?key=${apiKey}&prettyPrint=false`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ context: CONTEXT, continuation }),
  });
  return res.json();
}

async function crawlChannelTab(channelId, tab) {
  const out = [];
  let first;
  try {
    first = await page(`https://www.youtube.com/channel/${channelId}/${tab}?hl=en`);
  } catch {
    return out; // channel has no such tab
  }
  const ch = { id: channelId, name: (first.name ?? '').replace(/&amp;/g, '&') };
  let { videos, continuation } = harvest(first.data, ch);
  out.push(...videos);
  for (let i = 1; i < CHANNEL_PAGES && continuation && first.apiKey; i++) {
    const r = harvest(await more('browse', first.apiKey, continuation), ch);
    if (!r.videos.length) break;
    out.push(...r.videos);
    continuation = r.continuation;
  }
  return out;
}

async function crawlSearch(query) {
  const out = [];
  const first = await page(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en`);
  let { videos, continuation } = harvest(first.data);
  out.push(...videos);
  for (let i = 1; i < SEARCH_PAGES && continuation && first.apiKey; i++) {
    const r = harvest(await more('search', first.apiKey, continuation));
    out.push(...r.videos);
    continuation = r.continuation;
  }
  return out;
}

async function pool(items, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (i < items.length) {
        const it = items[i++];
        try {
          await fn(it);
        } catch (e) {
          console.error(`  ! ${JSON.stringify(it)} — ${e.message}`);
        }
      }
    }),
  );
}

// ---------------------------------------------------------------- main

(async () => {
  const speakers = ONLY ? SPEAKERS.filter((s) => s.key === ONLY) : SPEAKERS;
  const existing = ONLY && fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : [];
  const result = existing.filter((v) => !speakers.some((s) => s.key === v.speaker));

  for (const sp of speakers) {
    console.log(`\n${sp.short}`);
    const byId = new Map();
    const keep = (v, trusted) => {
      // Shorts and teasers are not classes.
      if (v.durationSec != null && v.durationSec < 300) return;
      if (!trusted && !sp.match.test(v.title) && !sp.match.test(v.channel)) return;
      const refs = parseVerseRefs(v.title);
      if (!refs.length) return;
      if (!byId.has(v.videoId)) byId.set(v.videoId, { ...v, speaker: sp.key, refs });
    };

    const tabs = sp.own.flatMap((id) => [[id, 'videos'], [id, 'streams']]);
    await pool(tabs, async ([id, tab]) => {
      const vids = await crawlChannelTab(id, tab);
      for (const v of vids) keep(v, true);
      console.log(`  channel ${id}/${tab}: ${vids.length} videos → ${byId.size} verse videos so far`);
    });

    let done = 0;
    await pool(SEARCH_SUFFIXES, async (suffix) => {
      const vids = await crawlSearch(`${sp.short} ${suffix}`);
      for (const v of vids) keep(v, sp.own.includes(v.channelId));
      process.stdout.write(`\r  searches ${++done}/${SEARCH_SUFFIXES.length} → ${byId.size} verse videos     `);
    });
    process.stdout.write('\n');

    result.push(...byId.values());
    // Written after every speaker so an interrupted run keeps what it has.
    fs.writeFileSync(OUT, JSON.stringify(result));
  }

  const counts = {};
  for (const v of result) counts[v.speaker] = (counts[v.speaker] ?? 0) + 1;
  console.log('\n', counts);
  console.log(`wrote ${path.relative(process.cwd(), OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
})();
