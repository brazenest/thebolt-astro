import { describe, it, expect } from 'vitest';
import { isNonMusic, PLAYS_MUSIC_ONLY } from './nonmusic';

describe('isNonMusic', () => {
  it('flags the automation default and station-name entries, case-insensitively', () => {
    expect(isNonMusic('RadioDJ', 'Your Station Slogan')).toBe(true);
    expect(isNonMusic(' the bolt ', 'The New Rock Alternative')).toBe(true);
    expect(isNonMusic('', '')).toBe(true);
  });
  it('leaves real songs alone, whatever they are called', () => {
    expect(isNonMusic('Foo Fighters', 'Window')).toBe(false);
    expect(isNonMusic('Bolt Thrower', 'The IVth Crusade')).toBe(false);
    expect(isNonMusic('Some Band', 'Station Slogan')).toBe(false);
  });
  it('SQL filter names the same artists', () => {
    expect(PLAYS_MUSIC_ONLY).toBe("lower(trim(artist)) NOT IN ('radiodj', 'the bolt')");
  });
});
