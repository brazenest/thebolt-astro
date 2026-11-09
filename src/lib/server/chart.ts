/**
 * THE BOLT — airplay chart: count spins from the station's own play log (D1 `plays`, filled
 * every minute by the capture cron), rank the top 30, publish to D1. Ported from the Next site
 * (lib/chart-compute.ts), same periods, same ranking.
 *
 * Source: the Next site read AzuraCast's /history API, which needs an API key with station
 * report access (it returned 403, so the live site never published a chart). The play log has
 * the same airings, needs no key, and is exactly what /log shows. Imaging/IDs are excluded
 * (lib/nowplaying/nonmusic.ts) — they'd otherwise top the chart.
 *
 * Periods are computed in UTC. That matches the live site, which ran on Workers (UTC) and used
 * local-time Date methods; a "published week" is Sunday 00:00 – Saturday 23:59:59 UTC.
 *
 * One deliberate change: movement arrows and week counts compare against the newest chart of
 * the same kind (e.g. published week) covering a DIFFERENT window. The Next site compared
 * against "chart:previous", which after two publishes is the chart before last, and mixed in
 * whatever ad-hoc period was published in between. Re-publishing the same window still
 * compares against the one before it, so weeks never double-count.
 */
import type { D1Like, Env } from './env';
import { playsBetween } from './plays-db';
import { isNonMusic } from '../nowplaying/nonmusic';

export type PeriodType = 'daily' | 'weekly' | 'monthly';
export type PeriodMode = 'rolling' | 'published';

export interface ChartEntry {
  rank: number;
  /** Rank on the previous chart; null = new. */
  last: number | null;
  artist: string;
  track: string;
  weeks: number;
  spins: number;
}

export interface Chart {
  id: number;
  publishedAt: number; // unix seconds
  periodType: PeriodType;
  periodMode: PeriodMode | null;
  periodStart: number;
  periodEnd: number;
  label: string;
  entries: ChartEntry[];
}

export interface Period {
  type: PeriodType;
  /** Weekly/monthly only; ignored for daily. */
  mode?: PeriodMode;
}

export const CHART_SIZE = 30;
const DAY_MS = 86_400_000;

export function isPeriod(p: unknown): p is Period {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  if (o.type !== 'daily' && o.type !== 'weekly' && o.type !== 'monthly') return false;
  return o.mode === undefined || o.mode === 'rolling' || o.mode === 'published';
}

const fmtDay = (d: Date) =>
  d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });

/** The window a chart covers. `now` is injectable for tests. */
export function periodRange(p: Period, now = new Date()): { start: Date; end: Date; label: string } {
  const mode = p.mode ?? 'published';

  if (p.type === 'daily') {
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    return {
      start,
      end: now,
      label: now.toLocaleDateString('en-US', {
        timeZone: 'UTC',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
    };
  }

  if (p.type === 'weekly') {
    if (mode === 'rolling') {
      const start = new Date(now.getTime() - 7 * DAY_MS);
      return { start, end: now, label: `Rolling 7 Days (${fmtDay(start)} – ${fmtDay(now)})` };
    }
    // The most recently completed Sun–Sat week. On a Saturday, that's this very week.
    const dow = now.getUTCDay(); // 0 = Sun … 6 = Sat
    const end = new Date(now);
    end.setUTCDate(end.getUTCDate() - (dow === 6 ? 0 : dow + 1));
    end.setUTCHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 6);
    start.setUTCHours(0, 0, 0, 0);
    return { start, end, label: `Week of ${fmtDay(start)} – ${fmtDay(end)}` };
  }

  if (mode === 'rolling') {
    const start = new Date(now.getTime() - 30 * DAY_MS);
    return { start, end: now, label: `Rolling 30 Days (${fmtDay(start)} – ${fmtDay(now)})` };
  }
  // The last fully concluded calendar month.
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 1);
  return {
    start,
    end,
    label: start.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' }),
  };
}

export interface HistoryItem {
  played_at: number;
  song: { artist?: string; title?: string };
}

const keyOf = (artist: string, track: string) => `${artist.toLowerCase()}|||${track.toLowerCase()}`;

/** Count spins, keep the top CHART_SIZE, and carry movement + weeks from the previous chart. */
export function rankEntries(items: HistoryItem[], prev: ChartEntry[]): ChartEntry[] {
  const spins = new Map<string, { artist: string; track: string; spins: number }>();
  for (const item of items) {
    if (isNonMusic(item.song.artist, item.song.title)) continue;
    const artist = item.song.artist?.trim() || 'Unknown';
    const track = item.song.title?.trim() || 'Unknown';
    const k = keyOf(artist, track);
    const hit = spins.get(k);
    if (hit) hit.spins++;
    else spins.set(k, { artist, track, spins: 1 });
  }

  const before = new Map(prev.map((e) => [keyOf(e.artist, e.track), e]));
  // Stable sort: ties keep first-heard order, as on the Next site.
  return [...spins.values()]
    .sort((a, b) => b.spins - a.spins)
    .slice(0, CHART_SIZE)
    .map((s, i) => {
      const p = before.get(keyOf(s.artist, s.track));
      return {
        rank: i + 1,
        last: p?.rank ?? null,
        artist: s.artist,
        track: s.track,
        weeks: p ? p.weeks + 1 : 1,
        spins: s.spins,
      };
    });
}

// ── D1 ────────────────────────────────────────────────────────────────────

interface ChartRow {
  id: number;
  published_at: number;
  period_type: PeriodType;
  period_mode: PeriodMode | null;
  period_start: number;
  period_end: number;
  label: string;
  entries: string;
}

const COLS = 'id, published_at, period_type, period_mode, period_start, period_end, label, entries';

function fromRow(r: ChartRow): Chart {
  let entries: ChartEntry[] = [];
  try {
    entries = JSON.parse(r.entries) as ChartEntry[];
  } catch {
    entries = [];
  }
  return {
    id: r.id,
    publishedAt: r.published_at,
    periodType: r.period_type,
    periodMode: r.period_mode,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    label: r.label,
    entries,
  };
}

/** The chart the public page shows: the newest one published. */
export async function currentChart(db: D1Like): Promise<Chart | null> {
  const row = await db
    .prepare(`SELECT ${COLS} FROM charts ORDER BY published_at DESC, id DESC LIMIT 1`)
    .first<ChartRow>();
  return row ? fromRow(row) : null;
}

/**
 * The baseline for movement and weeks: the newest chart of the SAME kind (type + mode) that
 * covers a different window. An ad-hoc daily or rolling publish never becomes the baseline
 * for the Monday weekly chart.
 */
export async function previousChart(
  db: D1Like,
  type: PeriodType,
  mode: PeriodMode | null,
  start: number,
  end: number
): Promise<Chart | null> {
  const row = await db
    .prepare(
      `SELECT ${COLS} FROM charts
       WHERE period_type = ?1 AND period_mode IS ?2 AND NOT (period_start = ?3 AND period_end = ?4)
       ORDER BY published_at DESC, id DESC LIMIT 1`
    )
    .bind(type, mode, start, end)
    .first<ChartRow>();
  return row ? fromRow(row) : null;
}

/** Build the chart for a period from the play log and publish it. */
export async function generateAndPublish(env: Env, p: Period, now = new Date()): Promise<Chart> {
  const db = env.DB;
  if (!db) throw new Error('The chart database (DB) is not bound.');

  const { start, end, label } = periodRange(p, now);
  const startS = Math.floor(start.getTime() / 1000);
  const endS = Math.floor(end.getTime() / 1000);

  const mode = p.type === 'daily' ? null : (p.mode ?? 'published');
  const [rows, prev] = await Promise.all([
    playsBetween(db, startS, endS),
    previousChart(db, p.type, mode, startS, endS),
  ]);
  const items: HistoryItem[] = rows.map((r) => ({ played_at: r.played_at, song: { artist: r.artist, title: r.title } }));
  const entries = rankEntries(items, prev?.entries ?? []);
  // Never replace a real chart with an empty one (capture cron down, empty window).
  if (entries.length === 0) throw new Error(`No plays found for ${label}. Nothing was published.`);
  const publishedAt = Math.floor(now.getTime() / 1000);

  const row = await db
    .prepare(
      `INSERT INTO charts (published_at, period_type, period_mode, period_start, period_end, label, entries)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) RETURNING id`
    )
    .bind(publishedAt, p.type, mode, startS, endS, label, JSON.stringify(entries))
    .first<{ id: number }>();

  return {
    id: row?.id ?? 0,
    publishedAt,
    periodType: p.type,
    periodMode: mode,
    periodStart: startS,
    periodEnd: endS,
    label,
    entries,
  };
}
