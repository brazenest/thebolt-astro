-- THE BOLT — dedupe airings.
--
-- The capture cron runs every minute, but a track is on air for several minutes, so the same
-- airing is seen many times. An airing is identified by (track_key, played_at) — played_at is
-- the start time AzuraCast reports, stable across polls of the same play. A unique index lets
-- the cron use INSERT OR IGNORE: the first poll of an airing records it, the rest are no-ops.
CREATE UNIQUE INDEX IF NOT EXISTS idx_plays_airing ON plays (track_key, played_at);
