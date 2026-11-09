import { describe, it, expect, vi, afterEach } from 'vitest';
import { proxiedArt, serveArt, MAX_BYTES } from './art';

const ENV = { AZURACAST_BASE_URL: 'https://radio.example.test/' };
const ART = 'https://radio.example.test/api/station/bolt/art/abc-123.jpg';

function bucket() {
  const store = new Map<string, { bytes: ArrayBuffer; type: string }>();
  return {
    store,
    async get(k: string) {
      const v = store.get(k);
      return v ? { body: new Response(v.bytes).body!, httpMetadata: { contentType: v.type } } : null;
    },
    async put(k: string, bytes: ArrayBuffer, o?: { httpMetadata?: { contentType?: string } }) {
      store.set(k, { bytes, type: o?.httpMetadata?.contentType ?? '' });
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('proxiedArt', () => {
  it('routes only AzuraCast-origin art through /api/art', () => {
    const origin = 'https://radio.example.test';
    expect(proxiedArt(ART, origin)).toBe(`/api/art?src=${encodeURIComponent(ART)}`);
    expect(proxiedArt('https://elsewhere.test/a.jpg', origin)).toBe('https://elsewhere.test/a.jpg');
    expect(proxiedArt(ART, null)).toBe(ART);
    expect(proxiedArt(undefined, origin)).toBeUndefined();
  });
});

describe('serveArt', () => {
  it('refuses anything not on the AzuraCast origin (no open proxy)', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect((await serveArt(ENV, 'https://evil.test/x.jpg')).status).toBe(404);
    expect((await serveArt(ENV, 'not a url')).status).toBe(404);
    expect((await serveArt({}, ART)).status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetches once, caches in R2, then serves from R2 with nosniff', async () => {
    const fetchSpy = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } }));
    vi.stubGlobal('fetch', fetchSpy);
    const ART_CACHE = bucket();
    const first = await serveArt({ ...ENV, ART_CACHE }, ART);
    expect(first.status).toBe(200);
    expect(first.headers.get('content-type')).toBe('image/jpeg');
    expect(first.headers.get('x-content-type-options')).toBe('nosniff');
    const second = await serveArt({ ...ENV, ART_CACHE }, ART);
    expect(new Uint8Array(await second.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('never caches or serves non-images, SVG, or oversized files', async () => {
    const ART_CACHE = bucket();
    for (const [type, size] of [['text/html', 10], ['image/svg+xml', 10], ['image/png', MAX_BYTES + 1]] as const) {
      vi.stubGlobal('fetch', async () => new Response(new Uint8Array(size), { headers: { 'content-type': type } }));
      expect((await serveArt({ ...ENV, ART_CACHE }, ART)).status).toBe(404);
    }
    expect(ART_CACHE.store.size).toBe(0);
  });
});
