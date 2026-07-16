/**
 * THE BOLT — station configuration.
 *
 * One place for the facts that make this station this station: identity, mounts, brand ink,
 * faces, schedule, timezone, and where listener mail lands. The dock and the proxy read
 * from here; nothing station-specific should be hardcoded in a component.
 */

export interface Show {
  /** Start hour, 24h, in the station timezone. */
  start: number;
  /** End hour, 24h (24 = midnight). */
  end: number;
  name: string;
}

export const station = {
  name: 'The Bolt',
  /** Display wordmark casing. */
  wordmark: 'The Bolt',
  tagline: 'Rock radio. A ClubFM station.',
  domain: 'thebolt.stream',
  url: 'https://thebolt.stream',

  /** Stream mounts. Primary is the high-quality mount; fallback is broad-compat (MP3/HLS). */
  stream: {
    primary: import.meta.env.PUBLIC_STREAM_URL ?? '',
    fallback: import.meta.env.PUBLIC_STREAM_FALLBACK_URL ?? '',
  },

  /** Brand ink — the one molten accent. See styles/tokens.css (--acc). */
  accent: '#FF3B1E',
  /** ClubFM network tell, used sparingly. */
  signal: '#00E8D0',

  fonts: {
    display: "'Darker Grotesque'",
    body: "'Archivo'",
    data: "'Space Mono'",
  },

  /** Air schedule, in station-local time (Pacific). The current show is marked client-side
   *  from this zone — the homepage is prerendered, so a server-side mark would go stale. */
  timezone: 'America/Los_Angeles',
  shows: [
    { start: 6, end: 10, name: 'Morning Load' },
    { start: 10, end: 15, name: 'Day Shift' },
    { start: 15, end: 19, name: 'Drive' },
    { start: 19, end: 24, name: 'The Active Hours' },
    { start: 0, end: 6, name: 'Third Shift' },
  ] as Show[],

  /** Where song requests + inquiries are delivered. */
  email: {
    to: import.meta.env.REQUEST_TO ?? 'music@thebolt.stream',
    from: import.meta.env.REQUEST_FROM ?? 'The Bolt <no-reply@thebolt.stream>',
  },
} as const;

export type Station = typeof station;
