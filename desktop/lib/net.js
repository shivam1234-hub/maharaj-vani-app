'use strict';

const { net } = require('electron');

/**
 * Network fetches made on behalf of the renderer.
 *
 * utils/youtube.ts reads YouTube's own results page (the keyless search) and
 * pages it through the innertube endpoint. From a 127.0.0.1 page both are
 * cross-origin requests YouTube sends no CORS headers for — and the POST is
 * preflighted — so in a browser they simply fail. The main process has no
 * same-origin policy, so the renderer hands the request here instead
 * (utils/httpFetch.web.ts) and gets the body back over IPC.
 *
 * Deliberately narrow: only YouTube, only GET/POST, a timeout, and a body
 * size cap — this must not turn into a general proxy for page script.
 */
const ALLOWED_HOSTS = new Set(['www.youtube.com', 'youtube.com', 'm.youtube.com']);
const TIMEOUT_MS = 20000;
const MAX_BYTES = 12 * 1024 * 1024;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0 Safari/537.36';

async function fetchForRenderer(req) {
  let url;
  try {
    url = new URL(String(req?.url ?? ''));
  } catch {
    return { ok: false, status: 0, body: '', error: 'Bad URL' };
  }
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) {
    return { ok: false, status: 0, body: '', error: 'Host not allowed' };
  }
  const method = req.method === 'POST' ? 'POST' : 'GET';
  const headers = {
    'User-Agent': UA,
    'Accept-Language': 'en-US,en;q=0.9',
  };
  if (method === 'POST') headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await net.fetch(url.toString(), {
      method,
      headers,
      body: method === 'POST' && typeof req.body === 'string' ? req.body : undefined,
      redirect: 'follow',
      signal: controller.signal,
    });
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      body: text.length > MAX_BYTES ? text.slice(0, MAX_BYTES) : text,
    };
  } catch (e) {
    return { ok: false, status: 0, body: '', error: e?.name === 'AbortError' ? 'Timed out' : String(e?.message ?? e) };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchForRenderer };
