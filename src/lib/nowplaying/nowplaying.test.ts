import { describe, it, expect } from 'vitest';
import { normalizeBoltAzuracast, type AzuracastPayload } from './azuracast';
import { parseBoltSnapshot, FORBIDDEN_KEYS, assertNoForbiddenKeys } from './schema';
import { signNonce, verifyNonce, trackKeyOf } from './nonce';

const RAW = {
  station: { id: 2, name: 'THE BOLT', shortcode: 'bolt', mounts: [{ id: 1 }] },
  listeners: { current: 1240, unique: 1200, total: 1240 },
  live: { is_live: false, streamer: '' },
  now_playing: {
    sh_id: 55,
    played_at: 1_720_000_000,
    duration: 202,
    elapsed: 44,
    playlist: 'Currents',
    song: { title: 'Starburster', artist: 'Fontaines D.C.', album: 'Romance', art: 'https://cdn/a.jpg' },
  },
  playing_next: { sh_id: 56, playlist: 'Currents', song: { title: 'Gift Horse', artist: 'Idles' } },
  song_history: [
    { sh_id: 54, played_at: 1_719_999_700, playlist: 'A', song: { title: 'HOLIDAY', artist: 'Turnstile' } },
  ],
  is_online: true,
} as unknown as AzuracastPayload;

describe('The BOLT now-playing proxy is a whitelist, not a passthrough', () => {
  it('drops every rotation-shaped key from the normalized+parsed body', () => {
    const body = JSON.stringify(parseBoltSnapshot(normalizeBoltAzuracast(RAW)));
    for (const key of FORBIDDEN_KEYS) expect(body).not.toContain(`"${key}"`);
    expect(() => assertNoForbiddenKeys(body)).not.toThrow();
  });

  it('surfaces the extended fields the page needs', () => {
    const snap = parseBoltSnapshot(normalizeBoltAzuracast(RAW));
    expect(snap.nowPlaying?.title).toBe('Starburster');
    expect(snap.nowPlaying?.album).toBe('Romance');
    expect(snap.nowPlaying?.durationSec).toBe(202);
    expect(snap.nowPlaying?.elapsedSec).toBe(44);
    expect(snap.listeners).toBe(1240);
    expect(snap.recent[0].title).toBe('HOLIDAY');
  });

  it('parseBoltSnapshot omits unknown keys, keeps album/year/listeners/nonce', () => {
    const clean = parseBoltSnapshot({
      nowPlaying: { title: 'X', artist: 'Y', album: 'Z', year: 2020, playlist: 'leak', sh_id: 9 },
      recent: [{ title: 'A', artist: 'B', playing_next: true }],
      live: true,
      listeners: 5,
      nonce: { trackKey: 'k', exp: 999, sig: 's' },
      station: { leak: true },
    });
    const body = JSON.stringify(clean);
    expect(body).not.toContain('playlist');
    expect(body).not.toContain('sh_id');
    expect(body).not.toContain('"station"');
    expect(clean.nowPlaying?.album).toBe('Z');
    expect(clean.nowPlaying?.year).toBe(2020);
    expect(clean.listeners).toBe(5);
    expect(clean.nonce?.trackKey).toBe('k');
  });
});

describe('SongRank nonce', () => {
  const secret = 'test-secret';
  const np = { artist: 'Fontaines D.C.', title: 'Starburster' };

  it('round-trips: a freshly signed nonce verifies', async () => {
    const now = 1_000_000;
    const nonce = await signNonce(np, secret, now);
    expect(nonce.trackKey).toBe(await trackKeyOf(np));
    expect(await verifyNonce(nonce, secret, now + 60)).toBe(true);
  });

  it('rejects a tampered signature, wrong secret, and expiry', async () => {
    const now = 1_000_000;
    const nonce = await signNonce(np, secret, now);
    expect(await verifyNonce({ ...nonce, sig: nonce.sig.slice(0, -1) + 'A' }, secret, now)).toBe(false);
    expect(await verifyNonce(nonce, 'other-secret', now)).toBe(false);
    expect(await verifyNonce(nonce, secret, nonce.exp + 1)).toBe(false);
  });

  it('binds to the track: a nonce for one track will not verify a forged trackKey', async () => {
    const now = 1_000_000;
    const nonce = await signNonce(np, secret, now);
    const forged = { ...nonce, trackKey: await trackKeyOf({ artist: 'Someone', title: 'Else' }) };
    expect(await verifyNonce(forged, secret, now)).toBe(false);
  });
});
