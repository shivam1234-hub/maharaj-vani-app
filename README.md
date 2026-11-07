# Maharaj Vani

Offline-first lecture app for **His Holiness Radhanath Swami**, **His Holiness Lokanath Swami**,
**His Holiness Bhakti Ashraya Vaishnava Swami** and **His Holiness Gour Govinda Swami**,
built with the same architecture as the Prabhupada Vani app (Expo Router, react-native-track-player,
resumable downloads, listening history, favourites and tags).

A Maharaja strip at the top of Home, Search and Video swaps the entire catalogue; the choice is
persisted and tints the tab bar. Home also shows the selected Maharaja's latest YouTube uploads.

Jayapataka Swami was removed on 2026-11-06. His name pattern is kept in the scraper as
attribution-only, so his guest classes inside another Maharaja's yatra folders are still not
listed under the host.

## What's in the catalogue

Scraped from `audio.iskcondesiretree.com`:

| Maharaja | Recordings | Own folder | Shared collections | Audio |
| --- | --- | --- | --- | --- |
| Radhanath Swami | 8,289 | 6,630 | 1,659 | 135.3 GB |
| Lokanath Swami | 2,442 | 2,073 | 369 | 57.9 GB |
| Bhakti Ashraya Vaishnava Swami | 742 | 580 | 162 | 20.2 GB |
| Gour Govinda Swami | 926 | 897 | 29 | 16.4 GB |

Every recording carries a direct, range-requestable MP3 URL, so playback and download need no
intermediate metadata request.

### The two traps in scraping this site

**1. Their recordings are not all in one place.** Each Maharaja has his own folder, but a large
share of their classes live in shared site collections alongside other speakers' — ISKCON
Chowpatty yatras, seminars and monthly archives, ISKCON Mayapur, Bhaktivedanta Manor, Los Angeles.
Scraping only the Maharaja's own folder misses ~1,660 Radhanath and ~290 Jayapataka recordings.

So `scripts/scrape-audio.js` runs two phases. Phase 1 walks the Maharaja's own subtree, where every
file is theirs whatever it is named. Phase 2 sweeps the rest of the site via the site's own search,
which matches **filenames** — so it surfaces precisely the files that name the speaker. Each
containing folder is then fetched for real titles and sizes, and only name-matching files are
attributed, because a folder like `96_-_Yatra` holds many speakers and must not be taken wholesale.
Records found this way carry `external: true` and a `collection` label.

**2. The site's playlist endpoint truncates silently.** `index.php?q=p&p=<folder>` returns every MP3
under a folder in one request, but caps at exactly 5000 lines. For Radhanath Swami that dropped 10
of his 13 subfolders with no error at all. Walking `index.php?q=f&f=<folder>` page by page has no
cap, and folder pages additionally carry the display title and file size the playlist omits.

## Tabs

- **Home** — Maharaja switch, catalogue stats, "continue listening", category grid, latest recordings.
- **Search** — full-text search across the active catalogue with category chips, and a filter sheet
  (sort, downloaded-only, favourites-only, category, year, place). "Save list" queues every result
  for download after confirming the size.
- **Video** — live YouTube search scoped to the active Maharaja, with per-channel filter chips and
  paging. Plays in an embedded player, with hand-off to YouTube for embed-disabled uploads.
- **Downloads** — in-progress items with byte progress and retry, plus saved recordings and total size.
- **History** — every lecture played, with resume position and a retention setting (7/30/90 days or forever).

## Data pipeline

```bash
npm run scrape              # every Maharaja (slow — hundreds of folder pages)
npm run scrape:radhanath    # one at a time; each rewrites only its own file
npm run scrape:lokanath
npm run scrape:bhaktiashraya
npm run scrape:gourgovinda
npm run stats               # coverage + metadata sanity check
```

Output is one file per Maharaja (`data/catalog-<key>.json`) rather than one combined blob, because
`hooks/useLectures.ts` requires them lazily — only the catalogue being browsed is parsed, keeping
~8 MB of JSON off the startup path.

### Metadata extraction

Titles and folder names are the only metadata the source provides, so the scraper derives the rest:

- **date** — several grammars (`1989-01-13`, `18-04-89`, `22_Nov_2007`, `20070122`). Verse
  references are masked out first, since `JPS SB 01-05-35` would otherwise parse as 1 May 2035.
- **location** — matched against a curated place list, longest-name-first so `New Vrindaban` wins
  over `Vrindavan`.
- **scripture** — normalised to `SB 1.5.35` form.
- **category** — from the folder the file sits in (the site's own curation) first, then the title.
- **id** — readable slug plus an FNV-1a hash of the full path. The hash is not decoration: collapsing
  punctuation makes `Rama's_Mercy` and `Rama_s_Mercy` the same slug, and the tree contains such
  pairs. Ids key downloads, history and favourites, so they must be unique and stable.

Outside his own folder, "Lokanath" alone also names Srila Lokanatha Gosvami, so Lokanath Swami's
shared-collection files must say Swami/Maharaj after the name (or use his `LNS` prefix), and files
in other speakers' own folders (Vyasa-puja offerings *to* him) are skipped.

## YouTube search — no API key

`utils/youtube.ts` reads the `ytInitialData` blob embedded in the desktop results page, and pages
further using the innertube key the page itself ships. A desktop User-Agent is required — the mobile
page has a different shape with no such blob. Results shorter than 3 minutes are dropped so Shorts
don't crowd out lectures.

This depends on YouTube's page shape, so it is the one part of the app that can break without any
change on our side. Failures surface as a retry prompt rather than an empty list.

## Running

```bash
npm install
npm run android     # or: npm run ios
```

Audio courtesy of `audio.iskcondesiretree.com`.

## Notification taps

Tapping the audio notification opens the app with `trackplayer://notification.click`.
`app/+native-intent.tsx` rewrites that to the now-playing lecture (Expo Router would otherwise show
"not found"), and `AudioContext` re-reads the active track from the background service so a
restarted UI still knows what is playing.

## Known scope limits

- **Web is not wired up.** `react-native-track-player`'s web shim throws at require-time in the
  installed alpha, which is why the sibling app carries a separate `AudioContext.web.tsx`. That
  variant was not ported here; the app targets Android and iOS.
- **No transcripts.** The Prabhupada app's transcript, presentation and slide-sync features are
  backed by Vanisource wikitext, which has no equivalent for these Maharajas.
- YouTube video is stream-only; offline download applies to the audio archive.
