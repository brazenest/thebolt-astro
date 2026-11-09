/**
 * THE BOLT — this listener's own SongRank ratings (localStorage), shared by the home page and
 * /log. These are the listener's taps, not the room's aggregate — no endpoint exposes tallies
 * yet (a future SPINDEX release brings room averages and the listener-split bar).
 */
function key(artist: string, title: string): string {
  return `bolt.rank:${artist.trim().toLowerCase()}|${title.trim().toLowerCase()}`;
}

export function getOwnRating(artist: string, title: string): number {
  try {
    const v = Number(localStorage.getItem(key(artist, title)));
    return Number.isInteger(v) && v >= 1 && v <= 5 ? v : 0;
  } catch {
    return 0;
  }
}

export function setOwnRating(artist: string, title: string, value: number): void {
  try {
    localStorage.setItem(key(artist, title), String(value));
  } catch {
    /* private mode — the rating still applies for the session */
  }
}

/** Five small squares; filled up to the rating, all red at 5/5. Decorative + labelled. */
export function squares(rating: number): HTMLElement {
  const el = document.createElement('span');
  el.className = 'sq';
  el.dataset.r = String(rating);
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', rating ? `Your SongRank ${rating} of 5` : 'Not rated');
  for (let n = 1; n <= 5; n++) {
    const i = document.createElement('i');
    if (n <= rating) i.className = 'on';
    el.appendChild(i);
  }
  return el;
}
