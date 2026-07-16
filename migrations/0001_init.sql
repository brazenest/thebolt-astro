-- THE BOLT — initial schema.
--
-- Two tables, defined together because the digest joins across them:
--   plays — the airing log. The full-log cron (3.6) upserts now-playing here every minute;
--           /log renders from it. Created now so the SongRank digest can name tracks via a
--           LEFT JOIN on track_key even before that cron ships.
--   ranks — the SongRank ledger (3.5). One row per tap; the hourly digest rolls it up. The
--           tick ratings shown on-page are the listener's own (localStorage) — this ledger
--           exists so moving to a room aggregate later is a render change, not a migration.

CREATE TABLE IF NOT EXISTS plays (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  track_key  TEXT    NOT NULL,
  artist     TEXT    NOT NULL,
  title      TEXT    NOT NULL,
  album      TEXT,
  art_hash   TEXT,
  played_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plays_track ON plays (track_key);
CREATE INDEX IF NOT EXISTS idx_plays_played_at ON plays (played_at);

CREATE TABLE IF NOT EXISTS ranks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  track_key   TEXT    NOT NULL,
  value       INTEGER NOT NULL,
  ip_hash     TEXT    NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ranks_created_at ON ranks (created_at);
CREATE INDEX IF NOT EXISTS idx_ranks_track ON ranks (track_key);
