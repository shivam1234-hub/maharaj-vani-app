/**
 * Desktop: YouTube search requests go through the Electron main process
 * (desktop/lib/net.js), which has no same-origin policy. The result is wrapped
 * back into a Response so utils/youtube.ts reads it exactly as on mobile.
 *
 * In a plain browser (no `window.desktop`) this falls back to fetch, which
 * YouTube will refuse — the screens already show that as a retry prompt.
 */
interface NetBridge {
  fetch: (req: { url: string; method?: string; body?: string }) => Promise<{
    ok: boolean; status: number; body: string; error?: string;
  }>;
}

function bridge(): NetBridge | null {
  if (typeof window === 'undefined') return null;
  return (window as any).desktop?.net ?? null;
}

export async function httpFetch(url: string, init?: RequestInit): Promise<Response> {
  const net = bridge();
  if (!net) return fetch(url, init);
  const signal = init?.signal;
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const request = net.fetch({
    url,
    method: init?.method === 'POST' ? 'POST' : 'GET',
    body: typeof init?.body === 'string' ? init.body : undefined,
  });

  // The main-process request can't be cancelled from here, but an aborted
  // caller must stop waiting on it just like with real fetch.
  const result = await new Promise<Awaited<typeof request>>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
    signal?.addEventListener('abort', onAbort, { once: true });
    request.then(
      (r) => { signal?.removeEventListener('abort', onAbort); resolve(r); },
      (e) => { signal?.removeEventListener('abort', onAbort); reject(e); },
    );
  });

  if (result.status === 0) throw new TypeError(result.error ?? 'Network request failed');
  return new Response(result.body, { status: result.status });
}
