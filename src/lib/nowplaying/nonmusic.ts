/**
 * THE BOLT — metadata that isn't a song.
 *
 * When something without song tags airs (imaging, IDs), the automation sends placeholder
 * metadata: RadioDJ's default ("RadioDJ — Your Station Slogan") or the station's own name as
 * artist ("The BOLT — The New Rock Alternative"). These must never be logged as plays, listed
 * in Just Played, or counted on the chart.
 *
 * Keep this list to exact artist names, never title patterns: a real song can be called anything.
 */
const NON_MUSIC_ARTISTS = new Set(['radiodj', 'the bolt']);

export function isNonMusic(artist: string | undefined, title: string | undefined): boolean {
  const a = (artist ?? '').trim().toLowerCase();
  const t = (title ?? '').trim();
  if (!a && !t) return true;
  return NON_MUSIC_ARTISTS.has(a);
}

/** SQL fragment excluding the same rows from `plays` (artist column). */
export const PLAYS_MUSIC_ONLY = `lower(trim(artist)) NOT IN (${[...NON_MUSIC_ARTISTS]
  .map((a) => `'${a.replace(/'/g, "''")}'`)
  .join(', ')})`;
