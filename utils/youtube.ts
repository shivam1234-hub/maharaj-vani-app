import type { VideoResult } from '../data/types';
import { httpFetch } from './httpFetch';

/**
 * Keyless YouTube search.
 *
 * The desktop results page embeds an `ytInitialData` blob holding every result
 * on the first page plus a continuation token, and the page also ships the
 * innertube API key needed to request the next page. That is the whole
 * mechanism — no Data API key, no quota.
 *
 * A desktop User-Agent is required: the mobile page ships a different shape
 * with no ytInitialData.
 */
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const INNERTUBE_CONTEXT = {
  client: { clientName: 'WEB', clientVersion: '2.20240726.00.00', hl: 'en', gl: 'US' },
};

export interface SearchPage {
  videos: VideoResult[];
  /** Pass back to `searchMore` to fetch the next page; null when exhausted. */
  continuation: string | null;
  apiKey: string | null;
}

function walk(node: any, visit: (n: any) => void) {
  if (Array.isArray(node)) {
    for (const v of node) walk(v, visit);
  } else if (node && typeof node === 'object') {
    visit(node);
    for (const v of Object.values(node)) walk(v, visit);
  }
}

function durationToSec(t: string): number | null {
  const parts = t.split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

const runsText = (o: any): string =>
  o?.simpleText ?? (o?.runs ?? []).map((r: any) => r.text).join('') ?? '';

/** Pull video rows and the results-grid continuation token out of a blob. */
function harvest(data: any): { videos: VideoResult[]; continuation: string | null } {
  const videos: VideoResult[] = [];
  const tokens: string[] = [];
  const seen = new Set<string>();

  walk(data, (n) => {
    const vr = n.videoRenderer;
    if (vr?.videoId && !seen.has(vr.videoId)) {
      seen.add(vr.videoId);
      const len = vr.lengthText?.simpleText;
      videos.push({
        videoId: vr.videoId,
        title: runsText(vr.title),
        channel:
          runsText(vr.ownerText) ||
          runsText(vr.longBylineText) ||
          runsText(vr.shortBylineText),
        channelId:
          vr.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId ??
          vr.longBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId,
        durationSec: len ? durationToSec(len) : null,
        publishedText: vr.publishedTimeText?.simpleText,
        viewsText: vr.shortViewCountText?.simpleText ?? runsText(vr.viewCountText),
        thumbnail: vr.thumbnail?.thumbnails?.slice(-1)?.[0]?.url,
      });
    }

    const tok = n.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
    if (tok) tokens.push(tok);
  });

  // A results page ships several continuations (filter chips, shelves); the
  // grid's own "load more" token is reliably the longest.
  tokens.sort((a, b) => b.length - a.length);
  return { videos, continuation: tokens[0] ?? null };
}

/** Shorts and 30-second teasers aren't lectures; keep anything over 3 minutes. */
const MIN_LECTURE_SEC = 180;

function isPlausibleLecture(v: VideoResult): boolean {
  return v.durationSec == null || v.durationSec >= MIN_LECTURE_SEC;
}

/** YouTube's own "sort by upload date" filter token, already URL-encoded. */
const SORT_BY_UPLOAD_DATE = 'CAI%253D';

export async function search(
  query: string,
  signal?: AbortSignal,
  opts: { newestFirst?: boolean } = {},
): Promise<SearchPage> {
  const url =
    `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en` +
    (opts.newestFirst ? `&sp=${SORT_BY_UPLOAD_DATE}` : '');
  const res = await httpFetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
    signal,
  });
  if (!res.ok) throw new Error(`YouTube returned ${res.status}`);
  const html = await res.text();

  const m = html.match(/ytInitialData\s*=\s*(\{.+?\});\s*<\/script>/s);
  if (!m) throw new Error('Could not read YouTube results');

  let data: any;
  try {
    data = JSON.parse(m[1]);
  } catch {
    throw new Error('Could not parse YouTube results');
  }

  const keyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
  const { videos, continuation } = harvest(data);

  return {
    videos: videos.filter(isPlausibleLecture),
    continuation,
    apiKey: keyMatch?.[1] ?? null,
  };
}

export async function searchMore(
  apiKey: string,
  continuation: string,
  signal?: AbortSignal,
): Promise<SearchPage> {
  const res = await httpFetch(`https://www.youtube.com/youtubei/v1/search?key=${apiKey}&prettyPrint=false`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ context: INNERTUBE_CONTEXT, continuation }),
    signal,
  });
  if (!res.ok) throw new Error(`YouTube returned ${res.status}`);
  const data = await res.json();
  const { videos, continuation: next } = harvest(data);
  return { videos: videos.filter(isPlausibleLecture), continuation: next, apiKey };
}

const AGE_UNIT_SEC: Record<string, number> = {
  second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000,
};

/**
 * Seconds since upload, read from YouTube's "3 days ago" / "Streamed 2 weeks
 * ago" text. YouTube's own date sort is loose (years-old uploads appear
 * between this week's), so the Home row re-sorts on this. Unknown text sorts
 * last.
 */
export function ageSeconds(publishedText?: string): number {
  if (!publishedText) return Number.MAX_SAFE_INTEGER;
  const m = publishedText.match(/(\d+)\s*(second|minute|hour|day|week|month|year)/i);
  if (!m) return Number.MAX_SAFE_INTEGER;
  return Number(m[1]) * AGE_UNIT_SEC[m[2].toLowerCase()];
}

export const watchUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;

/**
 * `playsinline` and `rel=0` keep playback inside the WebView instead of
 * bouncing to the YouTube app mid-lecture.
 *
 * Never load this straight into a WebView as its top-level document — see
 * {@link youtubeEmbedHtml}.
 */
export const embedUrl = (videoId: string) =>
  // enablejsapi=1 is what lets us command the player later — specifically to
  // pause it when the app goes to the background. Without it the iframe
  // ignores postMessage and the audio keeps playing after you leave.
  `https://www.youtube.com/embed/${videoId}?playsinline=1&rel=0&modestbranding=1&fs=1&enablejsapi=1`;

/**
 * Injected into the wrapper document to pause playback.
 *
 * The player lives in a cross-origin iframe, so its `<video>` element is
 * unreachable from the parent — `document.querySelectorAll('video')` finds
 * nothing. postMessage is the only channel across that boundary, and it needs
 * `enablejsapi=1` on the embed URL to be listened to.
 */
export const PAUSE_SCRIPT = `
  (function () {
    try {
      var f = document.querySelector('iframe');
      if (f && f.contentWindow) {
        f.contentWindow.postMessage(
          JSON.stringify({
            event: 'command', func: 'pauseVideo', args: [],
            // id/channel MUST match the 'listening' handshake. Without
            // them the player ignores the command outright — which is why
            // pausing from PiP and from the notification both did nothing.
            id: 1, channel: 'widget',
          }),
          '*'
        );
      }
      // Any same-origin media (not the YouTube iframe) can be paused directly.
      document.querySelectorAll('video, audio').forEach(function (el) { el.pause(); });
    } catch (e) {}
    true;
  })();
`;

/** Counterpart to PAUSE_SCRIPT, for resuming from the notification. */
export const PLAY_SCRIPT = `
  (function () {
    try {
      var f = document.querySelector('iframe');
      if (f && f.contentWindow) {
        f.contentWindow.postMessage(
          JSON.stringify({
            event: 'command', func: 'playVideo', args: [],
            id: 1, channel: 'widget',
          }),
          '*'
        );
      }
    } catch (e) {}
    true;
  })();
`;

/**
 * Origin the WebView presents itself as while hosting the embed.
 *
 * Two rules pull in opposite directions here, and missing either one breaks
 * playback in a way that looks like a broken video rather than a rejected
 * request:
 *
 *  1. The embed refuses a request with no `Referer` at all, answering
 *     "Video player configuration error". A top-level navigation sends no
 *     referrer, so the player can never be the WebView's own document — it has
 *     to sit in an iframe inside a page that has an origin.
 *  2. That origin has to be a real *third-party* site. Setting it to
 *     youtube.com reads as a self-embed and is rejected just as firmly, with
 *     "This video is unavailable".
 *
 * Hence a domain of our own. It is only ever an identity for the embed
 * handshake — nothing is ever fetched from it, so it need not resolve.
 */
export const YOUTUBE_EMBED_ORIGIN = 'https://maharajvani.app';

/**
 * A minimal page hosting the embed in an iframe, for WebView's
 * `{ html, baseUrl }` source. See {@link YOUTUBE_EMBED_ORIGIN} for why the
 * wrapper exists at all.
 *
 * The iframe reports readiness over `postMessage`, because the outer
 * document's own load event fires long before the player is up.
 */
export function youtubeEmbedHtml(videoId: string, startSec = 0): string {
  const url = startSec > 0
    ? `${embedUrl(videoId)}&start=${Math.floor(startSec)}`
    : embedUrl(videoId);
  // `&` has to be escaped to sit inside an HTML attribute.
  const src = url.replace(/&/g, '&amp;');
  // Deliberately ASCII-only: Hermes stores any string constant containing a
  // non-ASCII character as UTF-16, which hides the whole chunk from a
  // `strings` check of the built bundle.
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <style>
      html, body { margin: 0; padding: 0; height: 100%; width: 100%; background: #000; overflow: hidden; }
      body { display: flex; align-items: center; justify-content: center; }
      iframe { display: block; border: 0; width: 100%; height: 100%; }
    </style>
  </head>
  <body>
    <iframe
      src="${src}"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
      allowfullscreen
    ></iframe>
    <script>
      var f = document.querySelector('iframe');
      function tell(msg) {
        if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(msg);
      }
      f.addEventListener('load', function () { tell('ready'); });
      f.addEventListener('error', function () { tell('error'); });

      // With enablejsapi=1 the player will post its state back, but only to a
      // parent that has introduced itself with a "listening" message. Sent a
      // few times because the handshake is ignored until the player is up.
      function listen() {
        try {
          f.contentWindow.postMessage(
            JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*');
        } catch (e) {}
      }
      f.addEventListener('load', function () {
        listen();
        setTimeout(listen, 500);
        setTimeout(listen, 1500);
      });

      // playerState: 1 = playing, 2 = paused, 0 = ended. Reported so the
      // notification's button can show Pause vs Resume accurately instead of
      // guessing from whatever we last sent.
      //
      // currentTime rides along on the same messages and is what lets playback
      // hand over to the archive recording at the point you had reached,
      // rather than restarting the lecture.
      var lastSent = -1;
      var sentDuration = false;
      window.addEventListener('message', function (e) {
        try {
          var d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
          if (!d || !d.info) return;

          var st = d.info.playerState;
          if (st === 1) tell('state:playing');
          else if (st === 2) tell('state:paused');
          else if (st === 0) tell('state:ended');

          // Throttled to once a second — these arrive many times per second.
          var t = d.info.currentTime;
          if (typeof t === 'number' && Math.abs(t - lastSent) >= 1) {
            lastSent = t;
            tell('time:' + Math.floor(t));
          }

          // Sent once: needed to show "12:30 of 48:02" in history and to draw
          // the progress bar on a resumed video.
          var dur = d.info.duration;
          if (typeof dur === 'number' && dur > 0 && !sentDuration) {
            sentDuration = true;
            tell('dur:' + Math.floor(dur));
          }
        } catch (err) {}
      });

      // The expand button is inside a cross-origin iframe so the tap is
      // invisible to us, but the resulting transition still raises
      // fullscreenchange on THIS document, which is enough to rotate to match.
      function onFsChange() {
        var el = document.fullscreenElement || document.webkitFullscreenElement;
        tell(el ? 'fullscreen:on' : 'fullscreen:off');
      }
      document.addEventListener('fullscreenchange', onFsChange);
      document.addEventListener('webkitfullscreenchange', onFsChange);
    </script>
  </body>
</html>`;
}
