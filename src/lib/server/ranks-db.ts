/**
 * THE BOLT — SongRank ledger (D1).
 *
 * `ranks(id, track_key, value, ip_hash, created_at)` is an append-only ledger — one row per
 * tap. The digest rolls it up hourly. Track names come from the `plays` log via a LEFT JOIN on
 * track_key (the full-log cron fills `plays`), so a rating is human-readable once that track
 * has been captured; until then it degrades to a short track key rather than failing.
 */
import type { D1Like } from './env';

export async function insertRank(
  db: D1Like,
  r: { trackKey: string; value: number; ipHash: string; at: number }
): Promise<void> {
  await db
    .prepare('INSERT INTO ranks (track_key, value, ip_hash, created_at) VALUES (?1, ?2, ?3, ?4)')
    .bind(r.trackKey, r.value, r.ipHash, r.at)
    .run();
}

export interface RankRollupRow {
  track_key: string;
  n: number;
  avg: number;
  v1: number;
  v2: number;
  v3: number;
  v4: number;
  v5: number;
  artist: string | null;
  title: string | null;
}

/** Roll up every rating cast at or after `sinceUnix`, grouped by track, most-rated first. */
export async function hourlyRollup(db: D1Like, sinceUnix: number): Promise<RankRollupRow[]> {
  const q = `
    SELECT
      r.track_key AS track_key,
      COUNT(*)    AS n,
      AVG(r.value) AS avg,
      SUM(CASE WHEN r.value = 1 THEN 1 ELSE 0 END) AS v1,
      SUM(CASE WHEN r.value = 2 THEN 1 ELSE 0 END) AS v2,
      SUM(CASE WHEN r.value = 3 THEN 1 ELSE 0 END) AS v3,
      SUM(CASE WHEN r.value = 4 THEN 1 ELSE 0 END) AS v4,
      SUM(CASE WHEN r.value = 5 THEN 1 ELSE 0 END) AS v5,
      (SELECT p.artist FROM plays p WHERE p.track_key = r.track_key ORDER BY p.played_at DESC LIMIT 1) AS artist,
      (SELECT p.title  FROM plays p WHERE p.track_key = r.track_key ORDER BY p.played_at DESC LIMIT 1) AS title
    FROM ranks r
    WHERE r.created_at >= ?1
    GROUP BY r.track_key
    ORDER BY n DESC, avg DESC`;
  const { results } = await db.prepare(q).bind(sinceUnix).all<RankRollupRow>();
  return results;
}
