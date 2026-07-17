import { describe, it, expect } from 'vitest';
import { composeRequest, composeContact, composeDigest } from './mail-format';
import type { RankRollupRow } from './ranks-db';

describe('request email — ported format, must not drift', () => {
  it('matches The BOLT current implementation verbatim', () => {
    const mail = composeRequest('Gift Horse', 'Idles');
    expect(mail.subject).toBe('[The BOLT] Song request: Gift Horse');
    expect(mail.text).toBe(
      'Station: The BOLT\nRequested track: Gift Horse\nArtist: Idles\n\nSent from thebolt.stream'
    );
  });

  it('keeps the shape when the artist is blank', () => {
    const mail = composeRequest('Untitled', '');
    expect(mail.subject).toBe('[The BOLT] Song request: Untitled');
    expect(mail.text).toContain('Artist: \n');
    expect(mail.text.endsWith('Sent from thebolt.stream')).toBe(true);
  });
});

describe('contact email — v1 /api/feedback contact branch, must not drift', () => {
  it('matches the v1 subject shape and body field order', () => {
    const mail = composeContact({
      category: 'Press & PR',
      name: 'Sam Reporter',
      email: 'sam@example.com',
      company: 'The Daily',
      message: 'Interview request for the morning show.',
    });
    expect(mail.subject).toBe('[The BOLT] Press & PR — Sam Reporter');
    expect(mail.text).toBe(
      'Category: Press & PR\n' +
        'Name: Sam Reporter\n' +
        'Email: sam@example.com\n' +
        'Company/Artist: The Daily\n\n' +
        'Interview request for the morning show.\n\n' +
        'Sent from thebolt.stream'
    );
  });
});

describe('hourly SongRank digest', () => {
  const row = (over: Partial<RankRollupRow>): RankRollupRow => ({
    track_key: 'abc123def456',
    n: 2,
    avg: 4.5,
    v1: 0,
    v2: 0,
    v3: 0,
    v4: 1,
    v5: 1,
    artist: 'Idles',
    title: 'Gift Horse',
    ...over,
  });

  it('aggregates, names via the join, and speaks the ported dialect', () => {
    const mail = composeDigest([row({})], { start: 1_720_000_000, end: 1_720_003_600 });
    expect(mail.subject).toBe('[The BOLT] SongRank digest — 2 ratings');
    expect(mail.text).toContain('Station: The BOLT');
    expect(mail.text).toContain('Total ratings: 2');
    expect(mail.text).toContain('4.5/5 (2) — Gift Horse — Idles');
    expect(mail.text).toContain('Hate 0 · Dislike 0 · Neutral 0 · Like 1 · Love 1');
    expect(mail.text.endsWith('Sent from thebolt.stream')).toBe(true);
  });

  it('singularises one rating and degrades to a track key when unnamed', () => {
    const mail = composeDigest([row({ n: 1, avg: 3, v4: 0, v5: 0, v3: 1, title: null, artist: null })], {
      start: 1_720_000_000,
      end: 1_720_003_600,
    });
    expect(mail.subject).toBe('[The BOLT] SongRank digest — 1 rating');
    expect(mail.text).toContain('3.0/5 (1) — track abc123def4');
  });
});
