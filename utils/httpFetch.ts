/**
 * `fetch` for the keyless YouTube search (utils/youtube.ts).
 *
 * On a phone this is plain fetch. The web/desktop variant (httpFetch.web.ts)
 * routes the request through the Electron main process, because YouTube sends
 * no CORS headers and a renderer on 127.0.0.1 cannot read its pages.
 */
export function httpFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, init);
}
