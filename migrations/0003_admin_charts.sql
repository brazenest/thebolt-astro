-- THE BOLT — admin + airplay chart (ported from the Next site's APP_KV keys).
--
--   admin_config — the single admin login (KV "admin:config"). One row, id = 1. The password
--                  is PBKDF2-SHA256; `secret` signs session cookies and rotates on every
--                  credential change, which signs every existing session out.
--   charts       — every published airplay chart, newest last (KV "chart:current" and
--                  "chart:previous"). The public chart is the newest row; movement arrows and
--                  week counts compare against the newest row covering a different period.

CREATE TABLE IF NOT EXISTS admin_config (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  username    TEXT    NOT NULL,
  pw_hash     TEXT    NOT NULL,
  salt        TEXT    NOT NULL,
  iterations  INTEGER NOT NULL,
  secret      TEXT    NOT NULL,
  is_default  INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS charts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  published_at  INTEGER NOT NULL,
  period_type   TEXT    NOT NULL,  -- daily | weekly | monthly
  period_mode   TEXT,              -- rolling | published (weekly/monthly only)
  period_start  INTEGER NOT NULL,
  period_end    INTEGER NOT NULL,
  label         TEXT    NOT NULL,
  entries       TEXT    NOT NULL   -- JSON ChartEntry[]
);
CREATE INDEX IF NOT EXISTS idx_charts_published_at ON charts (published_at);
