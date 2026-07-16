/**
 * THE BOLT — hero band + just-played, driven by the shared now-playing store.
 *
 * The dock owns the <audio> and the poll loop; this band is a CONSUMER. It subscribes via
 * onNowPlaying (one poll for the whole page) and paints the current track, the elapsed bar,
 * the listener count, and the just-played list. Between polls a 1s ticker advances the bar
 * locally off elapsed + startedAt so it moves smoothly without hammering the proxy.
 *
 * Art follows the payload: present → plate on; absent or 404 → data-art="off", and the word
 * "On air" returns to the gutter with the band geometry unchanged.
 */
import { onNowPlaying, startNowPlaying } from '@clubfm/player';
import type { BoltSnapshot, BoltNowPlaying } from '../lib/nowplaying/types';

declare global {
  interface Window {
    /** Current rank authorisation, read by SongRank when casting a vote. */
    __boltNonce?: BoltSnapshot['nonce'];
  }
}

const IDLE_TITLE = 'Rock radio';
const IDLE_ARTIST = 'The Bolt';
const TZ = 'America/Denver';

const root = document.documentElement;
const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel);

function fmtTime(sec?: number): string {
  if (!sec || !Number.isFinite(sec) || sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Own rating for a track (this listener's, from localStorage) — not the room's aggregate. */
function ownKey(artist: string, title: string): string {
  return `bolt.rank:${artist.trim().toLowerCase()}|${title.trim().toLowerCase()}`;
}
function getOwnRating(artist: string, title: string): number {
  try {
    const v = Number(localStorage.getItem(ownKey(artist, title)));
    return Number.isInteger(v) && v >= 1 && v <= 5 ? v : 0;
  } catch {
    return 0;
  }
}

// Elapsed ticker state — the last snapshot's timing, plus when we received it.
let base: { elapsed: number; duration: number; at: number } | null = null;

function paintNowPlaying(np: BoltNowPlaying | null): void {
  const title = $('[data-np-title]');
  const artist = $('[data-np-artist]');
  const release = $('[data-np-release]');
  const duration = $('[data-np-duration]');
  const img = $<HTMLImageElement>('[data-np-art]');

  if (title) title.textContent = np?.title || IDLE_TITLE;
  if (artist) artist.textContent = np?.artist || IDLE_ARTIST;

  const rel = np ? [np.album, np.year].filter(Boolean).join(' · ') : '';
  if (release) release.textContent = rel;
  if (duration) duration.textContent = fmtTime(np?.durationSec);

  // Artwork is optional; toggle the plate rather than showing a broken frame.
  if (np?.art) {
    if (img && img.getAttribute('src') !== np.art) img.setAttribute('src', np.art);
    root.setAttribute('data-art', 'on');
  } else {
    root.setAttribute('data-art', 'off');
  }

  base = np
    ? { elapsed: np.elapsedSec ?? 0, duration: np.durationSec ?? 0, at: performance.now() }
    : null;

  // Reflect this listener's own rating on the current track.
  const group = $('[data-rank]');
  if (group) {
    const mine = np ? getOwnRating(np.artist, np.title) : 0;
    group.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      b.setAttribute('aria-pressed', String(Number(b.value) === mine));
    });
  }
}

function paintHistory(recent: BoltSnapshot['recent']): void {
  const tbody = $('[data-history] tbody');
  if (!tbody) return;
  const rows = recent.slice(0, 5);
  if (!rows.length) return;
  tbody.replaceChildren(
    ...rows.map((t) => {
      const tr = document.createElement('tr');
      const time = t.playedAt
        ? new Date(t.playedAt).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: TZ,
          })
        : '';
      const rating = getOwnRating(t.artist, t.title);
      const ticks = [1, 2, 3, 4, 5]
        .map((n) => `<i class="${n <= rating ? 'on' : ''}"></i>`)
        .join('');
      tr.innerHTML =
        `<td class="tm">${time}</td>` +
        `<td class="nm"><b></b> <s></s></td>` +
        `<td class="tk">${ticks}</td>`;
      // textContent assignment avoids injecting untrusted title/artist as HTML.
      tr.querySelector('b')!.textContent = t.title;
      tr.querySelector('s')!.textContent = `— ${t.artist}`;
      return tr;
    })
  );
}

function paintListeners(n?: number): void {
  const el = $('[data-listeners]');
  if (el && typeof n === 'number') el.textContent = n.toLocaleString('en-US');
}

function tick(): void {
  const clock = $('[data-np-clock]');
  if (clock) {
    clock.textContent = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: TZ,
    });
  }
  const bar = $<HTMLElement>('[data-np-elapsed]');
  if (bar && base && base.duration > 0) {
    const elapsed = Math.min(base.duration, base.elapsed + (performance.now() - base.at) / 1000);
    bar.style.width = `${(elapsed / base.duration) * 100}%`;
  }
}

function render(snapshot: BoltSnapshot): void {
  window.__boltNonce = snapshot.nonce ?? null;
  paintNowPlaying(snapshot.nowPlaying);
  paintHistory(snapshot.recent);
  paintListeners(snapshot.listeners);
}

// Subscribe once; the store replays the latest immediately and on every poll. The handler
// queries the DOM live, so it simply no-ops on pages without a hero (e.g. /log).
onNowPlaying((s) => render(s as BoltSnapshot));
startNowPlaying();
setInterval(tick, 1000);
