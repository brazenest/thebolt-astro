#!/usr/bin/env node
/**
 * Carry the Next site's published charts (APP_KV "chart:previous" and "chart:current") into
 * this site's D1 `charts` table, so the first chart published here keeps movement and weeks.
 *
 * Reads only local JSON files and prints SQL; it never touches Cloudflare itself.
 *
 *   # 1. export from the Next site's KV (thebolt-website, namespace thebolt-website-app-state)
 *   wrangler kv key get chart:previous --namespace-id ddbfbf0ca52e47faaf4bfdca80010e13 --remote > prev.json
 *   wrangler kv key get chart:current  --namespace-id ddbfbf0ca52e47faaf4bfdca80010e13 --remote > cur.json
 *   # 2. convert (missing or empty files are skipped)
 *   node tools/import-kv-chart.mjs prev.json cur.json > chart-import.sql
 *   # 3. review chart-import.sql, then load it
 *   wrangler d1 execute thebolt --remote --file chart-import.sql
 *
 * Re-running is safe: a chart already imported (same window and publish time) is skipped.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const unix = (iso) => Math.floor(new Date(iso).getTime() / 1000);
const q = (v) => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

/** One Next ChartData → the D1 row, or null when it isn't a chart. */
export function toRow(c) {
  if (!c || !Array.isArray(c.entries) || !c.publishedAt || !c.periodType) return null;
  const mode = c.periodType === 'weekly' ? (c.weeklyMode ?? 'published')
    : c.periodType === 'monthly' ? (c.monthlyMode ?? 'published')
    : null;
  const entries = c.entries.map((e) => ({
    rank: Number(e.rank),
    last: e.last == null ? null : Number(e.last),
    artist: String(e.artist ?? ''),
    track: String(e.track ?? ''),
    weeks: Number(e.weeks ?? 1),
    spins: Number(e.spins ?? 0),
  }));
  return {
    published_at: unix(c.publishedAt),
    period_type: c.periodType,
    period_mode: mode,
    period_start: unix(c.periodStart),
    period_end: unix(c.periodEnd),
    label: String(c.label ?? ''),
    entries: JSON.stringify(entries),
  };
}

/** Oldest first, so the newest import becomes the current chart. */
export function toSql(charts) {
  const rows = charts.map(toRow).filter(Boolean).sort((a, b) => a.published_at - b.published_at);
  return rows
    .map(
      (r) =>
        `INSERT INTO charts (published_at, period_type, period_mode, period_start, period_end, label, entries)\n` +
        `SELECT ${q(r.published_at)}, ${q(r.period_type)}, ${q(r.period_mode)}, ${q(r.period_start)}, ${q(r.period_end)}, ${q(r.label)}, ${q(r.entries)}\n` +
        `WHERE NOT EXISTS (SELECT 1 FROM charts WHERE published_at = ${r.published_at} AND period_start = ${r.period_start} AND period_end = ${r.period_end});`
    )
    .join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error('usage: node tools/import-kv-chart.mjs <chart.json> [more.json …] > import.sql');
    process.exit(2);
  }
  const charts = [];
  for (const f of files) {
    const text = existsSync(f) ? readFileSync(f, 'utf8').trim() : '';
    if (!text) {
      console.error(`skip ${f}: missing or empty`);
      continue;
    }
    try {
      charts.push(JSON.parse(text));
    } catch {
      console.error(`skip ${f}: not JSON`);
    }
  }
  const sql = toSql(charts);
  if (!sql) {
    console.error('nothing to import');
    process.exit(1);
  }
  process.stdout.write(sql + '\n');
}
