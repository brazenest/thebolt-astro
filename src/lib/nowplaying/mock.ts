/**
 * THE BOLT — server-side mock snapshot.
 *
 * Used by the proxy ONLY when no AzuraCast backend is configured (local dev / preview), so
 * the page is demoable without a station. This is server-side: the CLIENT store never
 * fabricates a track (see @clubfm/player's DEV-gated mock and prod degrade-to-null). The
 * rotation advances off the wall clock so the elapsed bar and "just played" list move.
 */
import type { BoltSnapshot, Track } from './types';

const ROTATION = [
  { title: 'Starburster', artist: 'Fontaines D.C.', album: 'Romance', year: 2024 },
  { title: 'Gift Horse', artist: 'Idles', album: 'TANGK', year: 2024 },
  { title: 'No One Knows', artist: 'Queens of the Stone Age', album: 'Songs for the Deaf', year: 2002 },
  { title: 'HOLIDAY', artist: 'Turnstile', album: 'GLOW ON', year: 2021 },
  { title: 'I Got Heaven', artist: 'Mannequin Pussy', album: 'I Got Heaven', year: 2024 },
  { title: 'My Own Summer', artist: 'Deftones', album: 'Around the Fur', year: 1997 },
];

const TRACK_MS = 200_000;

export function mockBoltSnapshot(now: number): BoltSnapshot {
  const slot = Math.floor(now / TRACK_MS);
  const idx = ((slot % ROTATION.length) + ROTATION.length) % ROTATION.length;
  const cur = ROTATION[idx];

  const recent: Track[] = Array.from({ length: 5 }, (_, i) => {
    const s = slot - (i + 1);
    const t = ROTATION[((s % ROTATION.length) + ROTATION.length) % ROTATION.length];
    return { title: t.title, artist: t.artist, playedAt: new Date(s * TRACK_MS).toISOString() };
  });

  return {
    nowPlaying: {
      title: cur.title,
      artist: cur.artist,
      album: cur.album,
      year: cur.year,
      durationSec: Math.floor(TRACK_MS / 1000),
      elapsedSec: Math.floor((now % TRACK_MS) / 1000),
      startedAt: new Date(slot * TRACK_MS).toISOString(),
    },
    recent,
    live: false,
    listeners: 1240,
    nonce: null,
  };
}
