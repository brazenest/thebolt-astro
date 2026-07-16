/**
 * THE BOLT — /log client finishing.
 *
 * Three jobs, all progressive enhancement over the server-rendered table:
 *   1. Times — rewritten into the VISITOR'S local timezone (the server can't know it; the
 *      SSR text is a UTC fallback for no-JS).
 *   2. Ticks — the LISTENER'S OWN ratings (localStorage, same key as the just-played band).
 *   3. Pagination — the server hides rows past the first 10; "Show 5 more" reveals the next
 *      step per click and retires itself when everything is visible.
 */
const STEP = 5;

function ownRating(artist: string, title: string): number {
  try {
    const key = `bolt.rank:${artist.trim().toLowerCase()}|${title.trim().toLowerCase()}`;
    const v = Number(localStorage.getItem(key));
    return Number.isInteger(v) && v >= 1 && v <= 5 ? v : 0;
  } catch {
    return 0;
  }
}

function localizeTimes(): void {
  document.querySelectorAll<HTMLElement>('.tm[data-ts]').forEach((td) => {
    if (td.dataset.localized) return;
    td.dataset.localized = '1';
    const unix = Number(td.dataset.ts);
    if (!Number.isFinite(unix)) return;
    td.textContent = new Date(unix * 1000).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  });
}

function fillTicks(): void {
  document.querySelectorAll<HTMLElement>('.tk[data-artist]').forEach((td) => {
    if (td.dataset.filled) return;
    td.dataset.filled = '1';
    const r = ownRating(td.dataset.artist ?? '', td.dataset.title ?? '');
    td.innerHTML = [1, 2, 3, 4, 5].map((n) => `<i class="${n <= r ? 'on' : ''}"></i>`).join('');
  });
}

function bindMore(): void {
  const btn = document.querySelector<HTMLButtonElement>('[data-log-more]');
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', () => {
    const hiddenRows = document.querySelectorAll<HTMLTableRowElement>('[data-log] tr[hidden]');
    for (let i = 0; i < STEP && i < hiddenRows.length; i++) hiddenRows[i].hidden = false;
    if (hiddenRows.length <= STEP) btn.hidden = true;
  });
}

function mount(): void {
  localizeTimes();
  fillTicks();
  bindMore();
}

document.addEventListener('astro:page-load', mount);

export {};
