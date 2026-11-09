/**
 * Album art through our own origin, cached in R2 (ported from the Next site's /api/art).
 * Every listener's art request would otherwise hit the AzuraCast box directly.
 *
 * Hardened against the Next version, which fetched ANY http(s) URL and served it back with
 * the upstream content type — an open proxy that could cache HTML onto thebolt.stream:
 *   - only URLs on the AzuraCast origin (AZURACAST_BASE_URL) are fetched;
 *   - only image/* responses, at most MAX_BYTES, are cached or served;
 *   - responses carry nosniff and a locked-down CSP.
 * R2 keys are sha256(src), the same scheme as the Next site, so a shared bucket stays warm.
 */
import type { Env } from './env';
import { sha256Hex } from './hash';

export const MAX_BYTES = 5 * 1024 * 1024;
const CACHE = 'public, max-age=604800, immutable';

/** The AzuraCast origin art may come from, or null when unconfigured. */
export function artOrigin(env: Env): string | null {
  try {
    return env.AZURACAST_BASE_URL ? new URL(env.AZURACAST_BASE_URL).origin : null;
  } catch {
    return null;
  }
}

/** Rewrite an AzuraCast art URL to go through /api/art. Anything else is left alone. */
export function proxiedArt(url: string | undefined, origin: string | null): string | undefined {
  if (!url || !origin) return url;
  try {
    return new URL(url).origin === origin ? `/api/art?src=${encodeURIComponent(url)}` : url;
  } catch {
    return url;
  }
}

function imageResponse(body: ArrayBuffer | ReadableStream, contentType: string): Response {
  return new Response(body, {
    headers: {
      'content-type': contentType,
      'cache-control': CACHE,
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
    },
  });
}

const notFound = () => new Response('Not found', { status: 404 });

export async function serveArt(env: Env, src: string | null): Promise<Response> {
  const origin = artOrigin(env);
  if (!src || !origin) return notFound();
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return notFound();
  }
  if (url.origin !== origin) return notFound();

  const key = await sha256Hex(url.href);
  const bucket = env.ART_CACHE;
  if (bucket) {
    const hit = await bucket.get(key);
    const type = hit?.httpMetadata?.contentType ?? '';
    if (hit && type.startsWith('image/')) return imageResponse(hit.body, type);
  }

  let res: Response;
  try {
    res = await fetch(url.href, { signal: AbortSignal.timeout(8000) });
  } catch {
    return notFound();
  }
  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!res.ok || !type.startsWith('image/') || type === 'image/svg+xml') return notFound();
  if (Number(res.headers.get('content-length') ?? 0) > MAX_BYTES) return notFound();
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) return notFound();

  if (bucket) {
    try {
      await bucket.put(key, bytes, { httpMetadata: { contentType: type } });
    } catch {
      /* cache write failure never blocks the image */
    }
  }
  return imageResponse(bytes, type);
}
