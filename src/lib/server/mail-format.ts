/**
 * THE BOLT — email bodies.
 *
 * The request format is ported VERBATIM from The Bolt's current implementation — same subject
 * shape, same `Station: / … / Sent from thebolt.stream` body. Do not restyle it; the operator's
 * filters and habits are built around it.
 *
 * The hourly SongRank digest is new (the old build emailed every tap; 3.5 replaces that with a
 * D1 ledger + one digest), but it speaks the same plain-text dialect so it reads as one system.
 */
import type { RankRollupRow } from './ranks-db';

const STATION = 'The Bolt';
const DOMAIN = 'thebolt.stream';
const TZ = 'America/Los_Angeles'; // station time — Pacific

export function composeRequest(track: string, artist: string): { subject: string; text: string } {
  return {
    subject: `[${STATION}] Song request: ${track}`,
    text: `Station: ${STATION}\nRequested track: ${track}\nArtist: ${artist}\n\nSent from ${DOMAIN}`,
  };
}

function clock(unix: number): string {
  return new Date(unix * 1000).toLocaleString('en-US', {
    timeZone: TZ,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function composeDigest(
  rows: RankRollupRow[],
  window: { start: number; end: number }
): { subject: string; text: string } {
  const total = rows.reduce((sum, r) => sum + r.n, 0);
  const lines = rows.map((r) => {
    const name = r.title
      ? `${r.title}${r.artist ? ` — ${r.artist}` : ''}`
      : `track ${r.track_key.slice(0, 10)}`;
    const dist = `Hate ${r.v1} · Dislike ${r.v2} · Neutral ${r.v3} · Like ${r.v4} · Love ${r.v5}`;
    return `${r.avg.toFixed(1)}/5 (${r.n}) — ${name}\n    ${dist}`;
  });
  return {
    subject: `[${STATION}] SongRank digest — ${total} rating${total === 1 ? '' : 's'}`,
    text:
      `Station: ${STATION}\n` +
      `Window: ${clock(window.start)} – ${clock(window.end)} (${TZ})\n` +
      `Total ratings: ${total}\n\n` +
      `${lines.join('\n')}\n\n` +
      `Sent from ${DOMAIN}`,
  };
}
