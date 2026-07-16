/**
 * THE BOLT — snapshot whitelist gate.
 *
 * Extends @clubfm/player's base parser with The Bolt's extra fields (album, year, listeners,
 * nonce). Same law: an unknown key cannot survive, because the output is rebuilt from picked
 * fields — never `as`-cast from the upstream shape. Reuses the network's FORBIDDEN_KEYS so a
 * rotation-shaped key (playlist, playing_next, …) fails CI here too.
 */
import { num, str, parseTrack, FORBIDDEN_KEYS, assertNoForbiddenKeys } from '@clubfm/player/schema';
import type { Track } from '@clubfm/player/types';
import type { BoltNowPlaying, BoltSnapshot, RankNonce } from './types';

export { FORBIDDEN_KEYS, assertNoForbiddenKeys };

function parseBoltNowPlaying(input: unknown): BoltNowPlaying | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;
  const title = str(o.title);
  const artist = str(o.artist);
  if (!title && !artist) return null;
  const np: BoltNowPlaying = { title, artist };
  if (str(o.startedAt)) np.startedAt = str(o.startedAt);
  if (num(o.durationSec) !== undefined) np.durationSec = num(o.durationSec);
  if (num(o.elapsedSec) !== undefined) np.elapsedSec = num(o.elapsedSec);
  if (str(o.artworkUrl)) np.artworkUrl = str(o.artworkUrl);
  if (str(o.art)) np.art = str(o.art);
  if (str(o.album)) np.album = str(o.album);
  if (num(o.year) !== undefined) np.year = num(o.year);
  return np;
}

function parseNonce(input: unknown): RankNonce | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;
  const trackKey = str(o.trackKey);
  const exp = num(o.exp);
  const sig = str(o.sig);
  if (!trackKey || exp === undefined || !sig) return null;
  return { trackKey, exp, sig };
}

export function parseBoltSnapshot(input: unknown): BoltSnapshot {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const recent = Array.isArray(o.recent)
    ? o.recent.map(parseTrack).filter((t): t is Track => t !== null)
    : [];
  const snapshot: BoltSnapshot = {
    nowPlaying: parseBoltNowPlaying(o.nowPlaying),
    recent,
    live: o.live === true,
    nonce: parseNonce(o.nonce),
  };
  if (num(o.listeners) !== undefined) snapshot.listeners = num(o.listeners);
  return snapshot;
}
