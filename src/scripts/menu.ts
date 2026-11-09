/**
 * THE BOLT — phone masthead menu. Sets [data-menu="closed"|"open"] on the header; CSS collapses
 * the nav only when that attribute exists (so no-JS visitors get the wrapped nav instead).
 *
 * Closes on: a nav choice (anchors then scroll; Contact opens its dialog), Escape (focus returns
 * to the toggle), a tap outside, or growing past the phone breakpoint. Re-binds after every view
 * transition, since the masthead is re-rendered per page.
 */
const PHONE = window.matchMedia('(max-width: 559px)');

function mount(): void {
  const mast = document.querySelector<HTMLElement>('[data-mast]');
  const toggle = mast?.querySelector<HTMLButtonElement>('[data-menu-toggle]');
  const nav = mast?.querySelector<HTMLElement>('#mast-nav');
  if (!mast || !toggle || !nav || mast.dataset.menu) return;

  const set = (open: boolean, refocus = false) => {
    mast.dataset.menu = open ? 'open' : 'closed';
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Menu');
    if (refocus) toggle.focus();
  };
  set(false);

  // Page-lifetime listeners on document/media go away when the next page swaps in.
  const life = new AbortController();
  document.addEventListener('astro:before-swap', () => life.abort(), { once: true });

  toggle.addEventListener('click', () => set(mast.dataset.menu !== 'open'));
  nav.addEventListener('click', (e) => {
    if ((e.target as Element).closest('a, button')) set(false);
  });
  mast.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mast.dataset.menu === 'open') set(false, true);
  });
  document.addEventListener(
    'click',
    (e) => {
      if (mast.dataset.menu === 'open' && !mast.contains(e.target as Node)) set(false);
    },
    { signal: life.signal }
  );
  PHONE.addEventListener('change', () => set(false), { signal: life.signal });
}

document.addEventListener('astro:page-load', mount);
