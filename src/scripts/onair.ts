/**
 * THE BOLT — on-air surfaces, driven by THE BOLT's now-playing feed.
 *
 * The dock owns the <audio>; this module is a CONSUMER of the shared feed (one poll for the
 * whole page). It paints whatever on-air surfaces the current page has:
 *   [data-onair]   home hero — title, artist, album/year, sleeve art, SongRank state
 *   [data-history] home Just Played — last five tracks
 *   [data-np-line] /log now-playing strip — "Title — Artist"
 * Every lookup is scoped (the dock has its own [data-np-*] hooks) and no-ops when absent.
 */
import { boltFeed } from './feed';
import { getOwnRating, setOwnRating, squares } from './own-rank';
import type { BoltSnapshot, BoltNowPlaying } from '../lib/nowplaying/types';

declare global {
  interface Window {
    /** Current rank authorisation, read by SongRank when casting a vote. */
    __boltNonce?: BoltSnapshot['nonce'];
  }
}

const IDLE_TITLE = 'Rock radio';
const IDLE_ARTIST = 'The BOLT';
const RANK_LABELS = ['Hate', 'Dislike', 'Neutral', 'Like', 'Love'];

const q = <T extends Element>(root: ParentNode, sel: string) => root.querySelector<T>(sel);

// The track on air, kept for the rank handler (own-rating key; the nonce is on window).
let currentNp: BoltNowPlaying | null = null;

function paintRankState(np: BoltNowPlaying | null): void {
  const group = document.querySelector<HTMLElement>('[data-rank]');
  if (!group) return;
  const mine = np ? getOwnRating(np.artist, np.title) : 0;
  group.querySelectorAll<HTMLButtonElement>('.rank__btn').forEach((b) => {
    b.setAttribute('aria-pressed', String(Number(b.value) === mine));
  });
  const note = q<HTMLElement>(group, '[data-rank-note]');
  if (note) note.textContent = mine ? `You: ${RANK_LABELS[mine - 1]}` : 'Tap to rate';
}

function paintHero(np: BoltNowPlaying | null): void {
  const hero = document.querySelector<HTMLElement>('[data-onair]');
  if (!hero) return;
  const title = q<HTMLElement>(hero, '[data-np-title]');
  const artist = q<HTMLElement>(hero, '[data-np-artist]');
  const release = q<HTMLElement>(hero, '[data-np-release]');
  const sleeve = q<HTMLElement>(hero, '[data-sleeve]');
  const img = q<HTMLImageElement>(hero, '[data-np-art]');

  if (title) title.textContent = np?.title || IDLE_TITLE;
  if (artist) artist.textContent = np?.artist || IDLE_ARTIST;
  if (release) {
    release.textContent = np ? [np.album, np.year].filter(Boolean).join(' — ') : '';
  }

  // Art is optional: without it (or on a 404) the hatched sleeve stands in.
  if (sleeve && img) {
    if (np?.art) {
      if (img.getAttribute('src') !== np.art) img.setAttribute('src', np.art);
      img.alt = `Album art for ${np.album || np.title} by ${np.artist}`;
      sleeve.dataset.hasArt = 'true';
    } else {
      img.removeAttribute('src');
      img.alt = '';
      sleeve.dataset.hasArt = 'false';
    }
  }
  paintRankState(np);
}

function fmtClock(iso: string | number | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function trackRow(time: string, title: string, artist: string): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'row';
  const t = document.createElement('span');
  t.className = 'row__t';
  t.textContent = time;
  const trk = document.createElement('span');
  trk.className = 'row__trk';
  const tt = document.createElement('span');
  tt.className = 'row__title';
  tt.textContent = title; // textContent: never inject untrusted metadata as HTML
  const ar = document.createElement('span');
  ar.className = 'row__artist';
  ar.textContent = artist;
  trk.append(tt, ar);
  li.append(t, trk, squares(getOwnRating(artist, title)));
  return li;
}

function paintHistory(recent: BoltSnapshot['recent']): void {
  const list = document.querySelector<HTMLOListElement>('[data-history]');
  if (!list) return;
  const rows = (recent ?? []).slice(0, 5);
  if (!rows.length) {
    // Resolve the suspense rows into an honest empty state on a degraded feed.
    const li = document.createElement('li');
    li.className = 'row row--empty';
    li.textContent = 'Nothing logged yet.';
    list.replaceChildren(li);
    return;
  }
  list.replaceChildren(...rows.map((t) => trackRow(fmtClock(t.playedAt), t.title, t.artist)));
}

function paintLine(np: BoltNowPlaying | null): void {
  const line = document.querySelector<HTMLElement>('[data-np-line]');
  if (line) line.textContent = np ? `${np.title} — ${np.artist}` : `${IDLE_TITLE} — ${IDLE_ARTIST}`;
}

function render(snapshot: BoltSnapshot): void {
  window.__boltNonce = snapshot.nonce ?? null;
  currentNp = snapshot.nowPlaying;
  paintHero(snapshot.nowPlaying);
  paintHistory(snapshot.recent);
  paintLine(snapshot.nowPlaying);
}

/**
 * Cast a rating for the track on air. Optimistic: the listener's own rating is stored and
 * reflected at once. The POST echoes the signed nonce so the vote can only land on the track
 * actually playing; the server writes it to the D1 ledger. A failure keeps the local rating.
 */
async function castRank(value: number): Promise<void> {
  const np = currentNp;
  const status = document.getElementById('rank-status');
  if (!np) return;

  setOwnRating(np.artist, np.title, value);
  paintRankState(np);
  if (status) status.textContent = `Rated ${RANK_LABELS[value - 1]}`;

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
  group.querySelectorAll<HTMLButtonElement>('.rank__btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const value = Number(btn.value);
      if (Number.isInteger(value) && value >= 1 && value <= 5) void castRank(value);
    });
  });
}

function mountArt(): void {
  const img = document.querySelector<HTMLImageElement>('[data-onair] [data-np-art]');
  if (!img || img.dataset.bound) return;
  img.dataset.bound = '1';
  img.addEventListener('error', () => {
    const sleeve = img.closest<HTMLElement>('[data-sleeve]');
    if (sleeve) sleeve.dataset.hasArt = 'false';
    img.alt = '';
  });
}

function mountPage(): void {
  mountRank();
  mountArt();
  // A view-transition swap ships fresh suspense skeletons, but the feed usually already knows
  // the answer — repaint at once from the cached snapshot instead of waiting for the next poll.
  const cached = boltFeed.latest();
  if (cached) render(cached as BoltSnapshot);
}
document.addEventListener('astro:page-load', mountPage);

// Subscribe once; the feed replays the latest immediately and on every poll.
boltFeed.subscribe((s) => render(s as BoltSnapshot));
boltFeed.start();
