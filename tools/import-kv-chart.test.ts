import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain .mjs tool, no type declarations
import { toRow, toSql } from './import-kv-chart.mjs';

const next = (publishedAt: string, label: string) => ({
  publishedAt,
  periodType: 'weekly',
  weeklyMode: 'published',
  periodStart: '2026-11-01T00:00:00.000Z',
  periodEnd: '2026-11-07T23:59:59.999Z',
  label,
  entries: [{ rank: 1, last: null, artist: "Guns N' Roses", track: 'Paradise City', weeks: 2, spins: 30 }],
});

describe('import-kv-chart', () => {
  it('maps a Next chart onto the D1 row', () => {
    expect(toRow(next('2026-11-09T09:00:05.000Z', 'Week of Nov 1 – Nov 7'))).toMatchObject({
      published_at: 1794214805,
      period_type: 'weekly',
      period_mode: 'published',
      period_start: 1793491200,
      period_end: 1794095999,
    });
    expect(toRow({ nope: true })).toBeNull();
  });

  it('orders oldest first, escapes quotes, and guards re-runs', () => {
    const sql: string = toSql([next('2026-11-09T09:00:00Z', 'B'), next('2026-11-02T09:00:00Z', 'A')]);
    expect(sql.indexOf("'A'")).toBeLessThan(sql.indexOf("'B'"));
    expect(sql).toContain("Guns N'' Roses");
    expect(sql.match(/WHERE NOT EXISTS/g)).toHaveLength(2);
  });
});
