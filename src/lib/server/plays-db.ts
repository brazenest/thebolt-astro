/**
 * THE BOLT — plays log (D1).
 *
 * `plays` is the airing history: one row per distinct airing, deduped by (track_key, played_at)
 * via INSERT OR IGNORE (see migration 0002). track_key is computed with the SAME trackKeyOf as
 * the SongRank nonce, so a play and its ratings share a key — that's what lets the hourly digest
 * name tracks and, later, aggregate a room rating against a real airing.
 */
import type { D1Like } from './env';
import { PLAYS_MUSIC_ONLY } from '../nowplaying/nonmusic';

export async function insertPlay(
  db: D1Like,
  p: {
    trackKey: string;
    artist: string;
    title: string;
    album: string | null;
    artHash: string | null;
    playedAt: number;
  }
): Promise<void> {
  await db
    .prepare(
      'INSERT OR IGNORE INTO plays (track_key, artist, title, album, art_hash, played_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)'
    )
    .bind(p.trackKey, p.artist, p.title, p.album, p.artHash, p.playedAt)
    .run();
}

export interface PlayRow {
  track_key: string;
  artist: string;
  title: string;
  album: string | null;
  played_at: number;
}

/** Newest airings first, for /log. */
export async function recentPlays(db: D1Like, limit = 200): Promise<PlayRow[]> {
  const { results } = await db
    .prepare(
      `SELECT track_key, artist, title, album, played_at FROM plays WHERE ${PLAYS_MUSIC_ONLY}
       ORDER BY played_at DESC, id DESC LIMIT ?1`
    )
    .bind(limit)
    .all<PlayRow>();
  return results;
}

/** Every music airing in [start, end] (unix seconds), oldest first — the chart's source. */
export async function playsBetween(
  db: D1Like,
  start: number,
  end: number
): Promise<{ artist: string; title: string; played_at: number }[]> {
  const { results } = await db
    .prepare(
      `SELECT artist, title, played_at FROM plays
       WHERE played_at BETWEEN ?1 AND ?2 AND ${PLAYS_MUSIC_ONLY}
       ORDER BY played_at, id`
    )
    .bind(start, end)
    .all<{ artist: string; title: string; played_at: number }>();
  return results;
}
