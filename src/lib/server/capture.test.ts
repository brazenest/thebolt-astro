import { describe, it, expect, vi, afterEach } from 'vitest';
import { captureNowPlaying } from './capture';
import { trackKeyOf } from '../nowplaying/nonce';

/** Minimal fake D1 that records the bound values of any INSERT. */
function fakeDb() {
  const inserts: unknown[][] = [];
  return {
    inserts,
    prepare(query: string) {
      let bound: unknown[] = [];
      return {
        bind(...values: unknown[]) {
          bound = values;
          return this;
        },
        async run() {
          if (query.startsWith('INSERT')) inserts.push(bound);
          return {};
        },
        async all<T>() {
          return { results: [] as T[] };
        },
        async first() {
          return null;
        },
      };
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('now-playing capture → plays', () => {
  const payload = {
    now_playing: {
      played_at: 1_720_000_000,
      duration: 200,
      elapsed: 5,
      song: { title: 'Gift Horse', artist: 'Idles', album: 'TANGK', art: 'https://cdn/a.jpg' },
    },
    song_history: [],
    listeners: { current: 1 },
  };

  it('records the on-air track with the rank-shared track_key and reported played_at', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }))
    );
    const db = fakeDb();
    await captureNowPlaying(
      { AZURACAST_BASE_URL: 'https://radio.example', DB: db } as never,
      1_720_000_050_000
    );
    expect(db.inserts).toHaveLength(1);
    const [trackKey, artist, title, album, , playedAt] = db.inserts[0];
    expect(title).toBe('Gift Horse');
    expect(artist).toBe('Idles');
    expect(album).toBe('TANGK');
    expect(playedAt).toBe(1_720_000_000);
    expect(trackKey).toBe(await trackKeyOf({ artist: 'Idles', title: 'Gift Horse' }));
  });

  it('captures nothing when no backend is configured (live-only, never the mock)', async () => {
    const db = fakeDb();
    await captureNowPlaying({ DB: db } as never, 1_720_000_050_000);
    expect(db.inserts).toHaveLength(0);
  });

  it('captures nothing when the backend is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 502 }))
    );
    const db = fakeDb();
    await captureNowPlaying({ AZURACAST_BASE_URL: 'https://radio.example', DB: db } as never);
    expect(db.inserts).toHaveLength(0);
  });
});
