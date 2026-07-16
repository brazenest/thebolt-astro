/**
 * THE BOLT — now-playing capture (runs from the every-minute cron).
 *
 * Fetches the live track from AzuraCast, normalises it, and records the airing in `plays`. It
 * is LIVE-ONLY on purpose: with no backend configured (or an unreachable one) it captures
 * nothing rather than logging the UI mock — the play log is the real broadcast record. Track
 * identity uses the same trackKeyOf as the SongRank nonce, so plays and ranks share a key.
 *
 * Dedup is at the database (INSERT OR IGNORE on the unique airing index), so running every
 * minute over a multi-minute track writes one row. Never throws out of here.
 */
import type { Env } from './env';
import { normalizeBoltAzuracast, type AzuracastPayload } from '../nowplaying/azuracast';
import { trackKeyOf } from '../nowplaying/nonce';
import { insertPlay } from './plays-db';
import { sha256Hex } from './hash';
import type { BoltSnapshot } from '../nowplaying/types';

const DEGRADED: BoltSnapshot = { nowPlaying: null, recent: [], live: false };

async function liveSnapshot(env: Env): Promise<BoltSnapshot> {
  const base = env.AZURACAST_BASE_URL?.replace(/\/$/, '');
  if (!base) return DEGRADED; // no backend → nothing real to log
  const shortcode = env.AZURACAST_BOLT_SHORTCODE || 'bolt';
  try {
    const res = await fetch(`${base}/api/nowplaying/${shortcode}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      console.warn(`[capture] upstream ${res.status} from ${base}/api/nowplaying/${shortcode}`);
      return DEGRADED;
    }
    return normalizeBoltAzuracast((await res.json()) as AzuracastPayload);
  } catch (err) {
    console.warn(`[capture] upstream unreachable: ${err instanceof Error ? err.message : err}`);
    return DEGRADED;
  }
}

export async function captureNowPlaying(env: Env, now: number = Date.now()): Promise<void> {
  const db = env.DB;
  if (!db) return;

  const np = (await liveSnapshot(env)).nowPlaying;
  if (!np || (!np.title && !np.artist)) return;

  const trackKey = await trackKeyOf({ artist: np.artist, title: np.title });
  const playedAt = np.startedAt ? Math.floor(Date.parse(np.startedAt) / 1000) : Math.floor(now / 1000);
  const artHash = np.art ? (await sha256Hex(np.art)).slice(0, 32) : null;

  try {
    await insertPlay(db, {
      trackKey,
      artist: np.artist,
      title: np.title,
      album: np.album ?? null,
      artHash,
      playedAt,
    });
  } catch (err) {
    console.error('[capture] insert failed:', err);
  }
}
