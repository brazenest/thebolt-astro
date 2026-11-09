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
  name: 'The BOLT',
  /** Display wordmark casing. */
  wordmark: 'The BOLT',
  tagline: "Vegas's live rock radio. A ClubFM station.",
  domain: 'thebolt.stream',
  url: 'https://thebolt.stream',

  /** Home market. Vegas first, streaming worldwide — feeds locality copy ("Vegas's …")
   *  and the schema.org address. The association is deliberate and sitewide. */
  location: { city: 'Las Vegas', region: 'NV', country: 'US' },

  /** What actually airs: new/modern rock, new classics (~'90s–2015), and '60s–'70s classic
   *  rock. Feeds the schema.org genre list; page copy spells out the eras in prose. */
  genres: ['Rock', 'Modern Rock', 'Classic Rock'],

  /** The BOLT SwagShop — the station's Shopify storefront on a sibling subdomain. Off-site,
   *  so links to it open in a new tab: the persistent player dock keeps the stream alive in
   *  the tab the listener came from. */
  swagShop: {
    name: 'The BOLT SwagShop',
    short: 'SwagShop',
    url: 'https://swagshop.thebolt.stream',
  },

  /** Stream mounts. Primary is the high-quality mount; fallback is broad-compat (MP3/HLS). */
  stream: {
    primary: import.meta.env.PUBLIC_STREAM_URL ?? '',
    fallback: import.meta.env.PUBLIC_STREAM_FALLBACK_URL ?? '',
  },

  /** Brand red — a spot ink, never the page field. See styles/tokens.css (--bolt-red). */
  accent: '#E10600',
  /** ClubFM network tell, used sparingly. */
  signal: '#00E8D0',

  fonts: {
    display: "'Archivo Variable'",
    body: "'Archivo Variable'",
    data: "'JetBrains Mono'",
  },

  /** Station ops timezone (Pacific) — used only in operator-facing artifacts (the SongRank
   *  digest email). Everything a VISITOR sees — clock, schedule marking, play times — renders
   *  in the visitor's own local timezone, client-side. */
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
    from: import.meta.env.REQUEST_FROM ?? 'The BOLT <no-reply@thebolt.stream>',
  },
} as const;

export type Station = typeof station;
