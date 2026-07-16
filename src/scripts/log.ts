/**
 * THE BOLT — /log tick marks.
 *
 * The full log renders server-side (real airings). The tick ratings on each row are the
 * LISTENER'S OWN (localStorage) — same key as the home page's just-played band — filled in on
 * the client so the log stays a static, cacheable render server-side.
 */
function ownRating(artist: string, title: string): number {
  try {
    const key = `bolt.rank:${artist.trim().toLowerCase()}|${title.trim().toLowerCase()}`;
    const v = Number(localStorage.getItem(key));
    return Number.isInteger(v) && v >= 1 && v <= 5 ? v : 0;
  } catch {
    return 0;
  }
}

function fill(): void {
  document.querySelectorAll<HTMLElement>('.tk[data-artist]').forEach((td) => {
    if (td.dataset.filled) return;
    td.dataset.filled = '1';
    const r = ownRating(td.dataset.artist ?? '', td.dataset.title ?? '');
    td.innerHTML = [1, 2, 3, 4, 5].map((n) => `<i class="${n <= r ? 'on' : ''}"></i>`).join('');
  });
}

document.addEventListener('astro:page-load', fill);

export {};
