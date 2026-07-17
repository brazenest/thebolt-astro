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
import { getLatestSnapshot, onNowPlaying, startNowPlaying } from '@clubfm/player';
import type { BoltSnapshot, BoltNowPlaying } from '../lib/nowplaying/types';

declare global {
  interface Window {
    /** Current rank authorisation, read by SongRank when casting a vote. */
    __boltNonce?: BoltSnapshot['nonce'];
  }
}

// Clock and just-played times render in the LISTENER'S local timezone. The schedule is the
// one two-clock surface: pinned to Pacific for what's airing, displayed in local time — see
// paintShows. Station time otherwise exists only in ops artifacts (the digest email).
const IDLE_TITLE = 'Rock radio';
const IDLE_ARTIST = 'The BOLT';

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
function setOwnRating(artist: string, title: string, value: number): void {
  try {
    localStorage.setItem(ownKey(artist, title), String(value));
  } catch {
    /* private mode — the rating still applies for the session */
  }
}

// The track currently on air, kept for the rank handler (it needs artist/title for the own
// rating key; the signed nonce comes off window.__boltNonce).
let currentNp: BoltNowPlaying | null = null;

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
  // The separator is part of the duration cell: with no known duration (or no release to
  // separate from) nothing prints — no dangling "·" while data is absent.
  const dur = fmtTime(np?.durationSec);
  if (duration) duration.textContent = dur ? (rel ? ` · ${dur}` : dur) : '';

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
  if (!rows.length) {
    // First snapshot with no history — resolve the suspense rows into an honest empty state
    // rather than leaving skeletons pulsing forever on a degraded feed.
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="tm">—</td><td class="nm"><s>Nothing logged yet.</s></td><td class="tk"></td>`;
    tbody.replaceChildren(tr);
    return;
  }
  tbody.replaceChildren(
    ...rows.map((t) => {
      const tr = document.createElement('tr');
      const time = t.playedAt
        ? new Date(t.playedAt).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
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

/**
 * Paint the schedule. Two clocks, deliberately:
 *
 *   WHAT'S AIRING — the schedule is pinned to Pacific: a show occupies one fixed real-world
 *   window for everyone, so the highlight follows the CURRENT PACIFIC HOUR against the
 *   Pacific brackets carried in data-start/data-end.
 *
 *   WHAT'S DISPLAYED — each bracket is rewritten into the visitor's local clock (10–15 PT
 *   reads as 11–16 in Denver, 22:30–03:30 in Mumbai). The conversion uses the live
 *   local↔Pacific offset, so DST on either side is handled; minutes only appear for
 *   fractional-offset zones. A local end landing on midnight renders as 24 (…–24, 00–…),
 *   matching the schedule's own dialect.
 *
 * The page is prerendered, so none of this can be done server-side (no request-time clock,
 * no visitor timezone). Re-run every minute so the highlight rolls across a shift change.
 */
const STATION_TZ = 'America/Los_Angeles';
const pad2 = (n: number): string => String(n).padStart(2, '0');

function paintShows(): void {
  const chips = document.querySelectorAll<HTMLElement>('[data-shows] > span[data-start]');
  if (!chips.length) return;

  const now = new Date();
  const pacificHour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: STATION_TZ,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(now)
  );
  // Minutes the visitor's clock runs ahead of Pacific right now (negative when behind).
  // The reinterpret-as-local trick is the standard dependency-free way to get a zone delta.
  const pseudoPacific = new Date(now.toLocaleString('en-US', { timeZone: STATION_TZ }));
  const offsetMin = Math.round((now.getTime() - pseudoPacific.getTime()) / 60_000);

  const toLocal = (pacificHourMark: number, isEnd: boolean): string => {
    const m = (((pacificHourMark * 60 + offsetMin) % 1440) + 1440) % 1440;
    if (isEnd && m === 0) return '24';
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return mm ? `${pad2(h)}:${pad2(mm)}` : pad2(h);
  };

  chips.forEach((chip) => {
    const start = Number(chip.dataset.start);
    const end = Number(chip.dataset.end);
    const t = chip.querySelector<HTMLElement>('.sh-t');
    if (t) t.textContent = `${toLocal(start, false)}–${toLocal(end, true)}`;
    if (pacificHour >= start && pacificHour < end) chip.setAttribute('aria-current', 'true');
    else chip.removeAttribute('aria-current');
  });
}

function tick(): void {
  const clock = $('[data-np-clock]');
  if (clock) {
    clock.textContent = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
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
  currentNp = snapshot.nowPlaying;
  paintNowPlaying(snapshot.nowPlaying);
  paintHistory(snapshot.recent);
}

/**
 * Cast a rating for the track on air. Optimistic: the listener's own rating is stored and
 * reflected at once. The POST echoes the signed nonce so the vote can only land on the track
 * actually playing; the server writes it to the D1 ledger (no per-tap email). A failure keeps
 * the local rating — the tick marks on-page are the listener's own, not the room's.
 */
async function castRank(value: number, group: HTMLElement, btn: HTMLButtonElement): Promise<void> {
  const np = currentNp;
  const status = document.getElementById('rank-status');
  if (!np) return;

  setOwnRating(np.artist, np.title, value);
  group
    .querySelectorAll<HTMLButtonElement>('button')
    .forEach((b) => b.setAttribute('aria-pressed', String(Number(b.value) === value)));
  if (status) status.textContent = `Rated ${btn.textContent?.trim() ?? ''}`;

  const nonce = window.__boltNonce;
  if (!nonce) return; // unknown/degraded track — no authorisation to send; keep it local
  try {
    const res = await fetch('/api/rank', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value, nonce }),
    });
    if (!res.ok && res.status === 429 && status) status.textContent = 'Rated — easy on the taps.';
  } catch {
    /* network hiccup — the local rating stands */
  }
}

function mountRank(): void {
  const group = document.querySelector<HTMLElement>('[data-rank]');
  if (!group || group.dataset.bound) return;
  group.dataset.bound = '1';
  group.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const value = Number(btn.value);
      if (Number.isInteger(value) && value >= 1 && value <= 5) void castRank(value, group, btn);
    });
  });
}

/* ── Hero play control ─────────────────────────────────────────────────────
   A consumer of the dock, not a second player: click dispatches clubfm:toggle, state mirrors
   clubfm:playerstate. On mount it syncs from the persisted dock's data-state, so a stream
   already playing shows the pause face after a navigation. */
function applyHeroPlayState(state: string): void {
  const btn = document.querySelector<HTMLButtonElement>('[data-hero-toggle]');
  if (!btn) return;
  const playing = state === 'playing' || state === 'buffering';
  btn.dataset.state = state;
  btn.setAttribute('aria-pressed', String(playing));
  btn.setAttribute('aria-label', playing ? 'Pause' : `Play ${IDLE_ARTIST}`);
}

function mountHeroPlay(): void {
  const btn = document.querySelector<HTMLButtonElement>('[data-hero-toggle]');
  if (!btn) return;
  if (!btn.dataset.bound) {
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => window.dispatchEvent(new CustomEvent('clubfm:toggle')));
  }
  const dock = document.querySelector<HTMLElement>('player-dock');
  applyHeroPlayState(dock?.dataset.state ?? 'paused');
}

window.addEventListener('clubfm:playerstate', (e) => {
  const detail = (e as CustomEvent<{ state?: string }>).detail;
  applyHeroPlayState(detail?.state ?? 'paused');
});

function mountPage(): void {
  mountRank();
  mountHeroPlay();
  paintShows();
  // A view-transition swap (logo click on home, /log → /) ships fresh suspense skeletons,
  // but the store usually already knows the answer. Repaint at once from the cached
  // snapshot instead of pulsing until the next poll lands (~15s). First-ever load has no
  // snapshot yet — the subscription below resolves that one, as before.
  const cached = getLatestSnapshot();
  if (cached) render(cached as BoltSnapshot);
}
document.addEventListener('astro:page-load', mountPage);

// Subscribe once; the store replays the latest immediately and on every poll. The handler
// queries the DOM live, so it simply no-ops on pages without a hero (e.g. /log).
onNowPlaying((s) => render(s as BoltSnapshot));
startNowPlaying();
setInterval(tick, 1000);
setInterval(paintShows, 60_000);
