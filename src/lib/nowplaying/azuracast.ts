/**
 * THE BOLT — AzuraCast normaliser.
 *
 * Picks AzuraCast's /api/nowplaying/<shortcode> payload into a BoltSnapshot. Pure and
 * never-throws: any missing field degrades to undefined, never an exception. Rotation
 * containers (playlist, playing_next, station, …) are simply not read — the whitelist is
 * enforced structurally, then re-asserted by parseBoltSnapshot in the proxy.
 */
import type { BoltNowPlaying, BoltSnapshot, Track } from './types';
import { isNonMusic } from './nonmusic';

interface AzuraSong {
  title?: string;
  artist?: string;
  album?: string;
  text?: string;
  art?: string;
}
interface AzuraNowPlaying {
  elapsed?: number;
  duration?: number;
  played_at?: number;
  song?: AzuraSong;
}
export interface AzuracastPayload {
  now_playing?: AzuraNowPlaying;
  song_history?: { played_at?: number; song?: AzuraSong }[];
  listeners?: { current?: number; total?: number; unique?: number };
}

function toIso(unixSeconds?: number): string | undefined {
  if (typeof unixSeconds !== 'number' || !Number.isFinite(unixSeconds)) return undefined;
  return new Date(unixSeconds * 1000).toISOString();
}

function splitText(text: string): { artist: string; title: string } {
  const idx = text.indexOf(' - ');
  if (idx === -1) return { artist: '', title: text.trim() };
  return { artist: text.slice(0, idx).trim(), title: text.slice(idx + 3).trim() };
}

function song(s: AzuraSong | undefined): { title: string; artist: string; album?: string; art?: string } {
  const title = (s?.title ?? '').trim();
  const artist = (s?.artist ?? '').trim();
  const album = (s?.album ?? '').trim() || undefined;
  const art = s?.art || undefined;
  if (title || artist) return { title, artist, album, art };
  return { ...splitText((s?.text ?? '').trim()), album, art };
}

export function normalizeBoltAzuracast(payload: AzuracastPayload): BoltSnapshot {
  const np = song(payload.now_playing?.song);
  const nowPlaying: BoltNowPlaying | null =
    np.title || np.artist
      ? {
          title: np.title,
          artist: np.artist,
          album: np.album,
          durationSec: payload.now_playing?.duration,
          elapsedSec: payload.now_playing?.elapsed,
          startedAt: toIso(payload.now_playing?.played_at),
          art: np.art,
        }
      : null;

  const recent: Track[] = (payload.song_history ?? [])
    .map((item): Track => {
      const s = song(item.song);
      return { title: s.title, artist: s.artist, artworkUrl: s.art, playedAt: toIso(item.played_at) };
    })
    .filter((t) => !isNonMusic(t.artist, t.title));

  const snapshot: BoltSnapshot = { nowPlaying, recent, live: true, nonce: null };
  if (typeof payload.listeners?.current === 'number') snapshot.listeners = payload.listeners.current;
  return snapshot;
}
