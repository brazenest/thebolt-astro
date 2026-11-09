import { describe, it, expect } from 'vitest';
import { periodRange, rankEntries, isPeriod, CHART_SIZE, type HistoryItem } from './chart';

const at = (iso: string) => new Date(iso);
const play = (artist: string, title: string): HistoryItem => ({ played_at: 0, song: { artist, title } });

describe('periodRange', () => {
  it('published week = last completed Sun–Sat (UTC)', () => {
    // Monday 2026-11-09 09:00 UTC — the cron's moment.
    const r = periodRange({ type: 'weekly', mode: 'published' }, at('2026-11-09T09:00:00Z'));
    expect(r.start.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-11-07T23:59:59.999Z');
    expect(r.label).toBe('Week of Nov 1 – Nov 7');
  });

  it('on a Saturday, the published week is this week', () => {
    const r = periodRange({ type: 'weekly', mode: 'published' }, at('2026-11-14T12:00:00Z'));
    expect(r.start.toISOString()).toBe('2026-11-08T00:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-11-14T23:59:59.999Z');
  });

  it('published month = last full calendar month, across a year boundary', () => {
    const r = periodRange({ type: 'monthly', mode: 'published' }, at('2027-01-05T00:00:00Z'));
    expect(r.start.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-12-31T23:59:59.999Z');
    expect(r.label).toBe('December 2026');
  });

  it('daily = UTC midnight to now', () => {
    const now = at('2026-11-09T15:30:00Z');
    const r = periodRange({ type: 'daily' }, now);
    expect(r.start.toISOString()).toBe('2026-11-09T00:00:00.000Z');
    expect(r.end).toEqual(now);
  });

  it('rolling windows end now', () => {
    const now = at('2026-11-09T15:30:00Z');
    expect(periodRange({ type: 'weekly', mode: 'rolling' }, now).start.toISOString()).toBe('2026-11-02T15:30:00.000Z');
    expect(periodRange({ type: 'monthly', mode: 'rolling' }, now).start.toISOString()).toBe('2026-10-10T15:30:00.000Z');
  });
});

describe('rankEntries', () => {
  it('ranks by spins, merges case-insensitively, and caps at the chart size', () => {
    const items = [
      play('Idles', 'Gift Horse'),
      play('Deftones', 'My Own Summer'),
      play('IDLES', 'gift horse'),
      ...Array.from({ length: 40 }, (_, i) => play(`A${i}`, `T${i}`)),
    ];
    const out = rankEntries(items, []);
    expect(out).toHaveLength(CHART_SIZE);
    expect(out[0]).toMatchObject({ rank: 1, artist: 'Idles', track: 'Gift Horse', spins: 2, last: null, weeks: 1 });
    expect(out[1]).toMatchObject({ rank: 2, artist: 'Deftones' });
  });

  it('carries movement and weeks from the previous chart', () => {
    const prev = [
      { rank: 1, last: null, artist: 'Deftones', track: 'My Own Summer', weeks: 3, spins: 9 },
      { rank: 2, last: null, artist: 'Idles', track: 'Gift Horse', weeks: 1, spins: 4 },
    ];
    const out = rankEntries([play('Idles', 'Gift Horse'), play('Idles', 'Gift Horse'), play('Deftones', 'My Own Summer')], prev);
    expect(out[0]).toMatchObject({ track: 'Gift Horse', rank: 1, last: 2, weeks: 2 });
    expect(out[1]).toMatchObject({ track: 'My Own Summer', rank: 2, last: 1, weeks: 4 });
  });

  it('names blank metadata Unknown', () => {
    expect(rankEntries([{ played_at: 0, song: {} }], [])[0]).toMatchObject({ artist: 'Unknown', track: 'Unknown' });
  });
});

describe('isPeriod', () => {
  it('accepts the five admin periods and rejects junk', () => {
    expect(isPeriod({ type: 'weekly', mode: 'published' })).toBe(true);
    expect(isPeriod({ type: 'daily' })).toBe(true);
    expect(isPeriod({ type: 'yearly' })).toBe(false);
    expect(isPeriod({ type: 'weekly', mode: 'x' })).toBe(false);
    expect(isPeriod(null)).toBe(false);
  });
});
