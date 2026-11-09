/**
 * THE BOLT — /log client finishing. Progressive enhancement over the server-rendered list
 * (which already carries every loaded row; the server caps how many that is).
 *
 *   1. Times   — rewritten into the VISITOR'S local timezone.
 *   2. Squares — the LISTENER'S OWN ratings (localStorage, same key as the home page).
 *   3. Filter  — Today / Yesterday split the loaded rows by local date ("Yesterday" also holds
 *                anything older); the toggle only appears when both days are present.
 *                Search matches title or artist within the selected day.
 *   4. Paging  — "Load earlier" reveals STEP more matching rows; retires when all are shown.
 *                A search shows every match at once.
 */
import { getOwnRating, squares } from './own-rank';

const STEP = 6;

type Day = 'today' | 'yesterday';
const state = { day: 'today' as Day, query: '', limit: 0, split: false };

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime() / 1000;
}

function rows(): HTMLLIElement[] {
  return Array.from(document.querySelectorAll<HTMLLIElement>('[data-log] > li'));
}

function dayOf(li: HTMLLIElement, midnight: number): Day {
  return Number(li.dataset.ts) >= midnight ? 'today' : 'yesterday';
}

function finishRows(): void {
  rows().forEach((li) => {
    if (li.dataset.finished) return;
    li.dataset.finished = '1';
    const unix = Number(li.dataset.ts);
    const t = li.querySelector<HTMLElement>('[data-time]');
    if (t && Number.isFinite(unix)) {
      t.textContent = new Date(unix * 1000).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      });
    }
    const slot = li.querySelector<HTMLElement>('[data-sq]');
    if (slot) {
      slot.replaceWith(squares(getOwnRating(slot.dataset.artist ?? '', slot.dataset.title ?? '')));
    }
  });
}

function apply(): void {
  const midnight = startOfToday();
  const q = state.query.trim().toLowerCase();
  let shown = 0;
  let matches = 0;
  rows().forEach((li) => {
    const inDay = !state.split || dayOf(li, midnight) === state.day;
    const hit = !q || (li.dataset.find ?? '').includes(q);
    const match = inDay && hit;
    if (match) matches += 1;
    const visible = match && (q !== '' || shown < state.limit);
    if (visible) shown += 1;
    li.hidden = !visible;
  });

  const none = document.querySelector<HTMLElement>('[data-log-none]');
  if (none) none.hidden = matches > 0;
  const more = document.querySelector<HTMLButtonElement>('[data-log-more]');
  if (more) more.hidden = q !== '' || shown >= matches;

  document.querySelectorAll<HTMLButtonElement>('[data-log-days] [data-day]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.day === state.day));
  });
}

function mount(): void {
  const page = document.querySelector<HTMLElement>('[data-log-page]');
  if (!page || page.dataset.bound) return;
  page.dataset.bound = '1';

  finishRows();
  state.limit = Number(page.dataset.initial) || 12;
  state.query = '';

  const midnight = startOfToday();
  const days = new Set(rows().map((li) => dayOf(li, midnight)));
  state.split = days.size > 1;
  state.day = days.has('today') ? 'today' : 'yesterday';

  const tools = document.querySelector<HTMLElement>('[data-log-tools]');
  if (tools) tools.hidden = false;
  const dayGroup = document.querySelector<HTMLElement>('[data-log-days]');
  if (dayGroup) dayGroup.hidden = !state.split;

  dayGroup?.querySelectorAll<HTMLButtonElement>('[data-day]').forEach((b) => {
    b.addEventListener('click', () => {
      state.day = b.dataset.day as Day;
      state.limit = Number(page.dataset.initial) || 12;
      apply();
    });
  });
  document.querySelector<HTMLInputElement>('[data-log-find]')?.addEventListener('input', (e) => {
    state.query = (e.currentTarget as HTMLInputElement).value;
    apply();
  });
  document.querySelector<HTMLButtonElement>('[data-log-more]')?.addEventListener('click', () => {
    state.limit += STEP;
    apply();
  });

  apply();
}

document.addEventListener('astro:page-load', mount);

export {};
