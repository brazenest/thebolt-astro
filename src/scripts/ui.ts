/**
 * THE BOLT — page chrome behaviour.
 *
 * Theme flips two page tokens (--bg/--fg); the plate polarity and the inversion law follow
 * in pure CSS. Artwork drops to "off" when the payload has no art or the image 404s — the
 * band geometry does not change, the word "On air" returns to the gutter.
 *
 * Bound on astro:page-load so it survives view-transition navigations; the pre-paint theme
 * script in <head> owns the first paint so there is no flash.
 *
 * Theme policy: follow the OS until the listener explicitly chooses, then keep that choice for
 * 7 days after their most recent visit (the pre-paint script slides the window each load). No
 * explicit choice → we also track live OS changes while the page is open.
 */
const root = document.documentElement;

const THEME_KEY = 'bolt.theme';
const THEME_TS = 'bolt.theme.ts';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** True when an explicit theme choice exists and is still inside its 7-day sliding window. */
function hasFreshChoice(): boolean {
  try {
    const t = localStorage.getItem(THEME_KEY);
    const ts = Number(localStorage.getItem(THEME_TS));
    return !!t && !!ts && Date.now() - ts <= WEEK_MS;
  } catch {
    return false;
  }
}

/** The theme that should be showing right now: a fresh explicit choice, else the OS. */
function resolvedTheme(): string {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t && hasFreshChoice()) return t;
  } catch {
    /* fall through to system */
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function paintThemeLabel(): void {
  const btn = document.getElementById('theme');
  if (btn) btn.textContent = root.getAttribute('data-theme') === 'dark' ? 'Light' : 'Dark';
}
function paintArtLabel(): void {
  const btn = document.getElementById('art');
  if (btn) btn.textContent = root.getAttribute('data-art') === 'on' ? 'Art off' : 'Art on';
}

function onThemeClick(): void {
  const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  try {
    // An explicit choice, stamped now. The stamp is what the 7-day sliding window measures.
    localStorage.setItem(THEME_KEY, next);
    localStorage.setItem(THEME_TS, String(Date.now()));
  } catch {
    /* private mode — theme still applies for the session */
  }
  paintThemeLabel();
}
function onArtClick(): void {
  root.setAttribute('data-art', root.getAttribute('data-art') === 'on' ? 'off' : 'on');
  paintArtLabel();
}
function onArtError(): void {
  root.setAttribute('data-art', 'off');
  paintArtLabel();
}

/**
 * Anchor navigation must land with the target band's top edge flush below the sticky mast —
 * "On air" reveals the inverted container from its very top. CSS carries a fixed fallback;
 * this measures the real mast (it wraps taller on narrow screens).
 */
function setScrollPadding(): void {
  const mast = document.querySelector<HTMLElement>('.mast');
  if (mast) root.style.scrollPaddingTop = `${mast.offsetHeight}px`;
}
window.addEventListener('resize', setScrollPadding);

/**
 * Mobile menu (below 760px, page.css): the hamburger owns [data-menu] on the mast. Opening
 * grows the sticky mast, so scroll-padding is re-measured on every flip — anchor taps close
 * the menu first, then land under the collapsed mast height.
 */
function setMenu(open: boolean): void {
  const mast = document.querySelector<HTMLElement>('.mast');
  const tgl = document.querySelector<HTMLElement>('[data-menu-toggle]');
  if (!mast || !tgl) return;
  if (open) mast.setAttribute('data-menu', 'open');
  else mast.removeAttribute('data-menu');
  tgl.setAttribute('aria-expanded', String(open));
  const word = tgl.querySelector('[data-menu-word]');
  if (word) word.textContent = open ? 'Close' : 'Menu';
  setScrollPadding();
}

function mount(): void {
  setScrollPadding();
  const theme = document.getElementById('theme');
  const art = document.getElementById('art');
  const img = document.querySelector<HTMLImageElement>('[data-np-art]');

  if (theme && !theme.dataset.bound) {
    theme.dataset.bound = '1';
    theme.addEventListener('click', onThemeClick);
  }
  if (art && !art.dataset.bound) {
    art.dataset.bound = '1';
    art.addEventListener('click', onArtClick);
  }
  const menuTgl = document.querySelector<HTMLElement>('[data-menu-toggle]');
  if (menuTgl && !menuTgl.dataset.bound) {
    menuTgl.dataset.bound = '1';
    menuTgl.addEventListener('click', () => {
      setMenu(menuTgl.closest('.mast')?.getAttribute('data-menu') !== 'open');
    });
  }
  // Any nav choice dismisses the panel — anchors go on to scroll, Contact opens its dialog
  // on top. The theme/art toggles in .util deliberately keep the menu open.
  const menuNav = document.querySelector<HTMLElement>('.mast-menu nav');
  if (menuNav && !menuNav.dataset.bound) {
    menuNav.dataset.bound = '1';
    menuNav.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('a, button')) setMenu(false);
    });
  }
  if (img && !img.dataset.bound) {
    img.dataset.bound = '1';
    img.addEventListener('error', onArtError);
    // A cached broken image may have already errored before this ran.
    if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) onArtError();
  }

  paintThemeLabel();
  paintArtLabel();
}

document.addEventListener('astro:page-load', mount);

// Escape closes the menu and hands focus back to the toggle. The contact dialog's own
// Escape handling is native <dialog> behaviour and never overlaps: opening it via the nav
// already closed the menu.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const mast = document.querySelector<HTMLElement>('.mast');
  if (mast?.getAttribute('data-menu') !== 'open') return;
  setMenu(false);
  document.querySelector<HTMLElement>('[data-menu-toggle]')?.focus();
});

// While no fresh explicit choice is in effect, follow the OS live — flip the moment the
// listener changes their system theme, without a reload. An explicit choice suppresses this
// until it lapses (7 days after their last visit).
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  if (hasFreshChoice()) return;
  root.setAttribute('data-theme', e.matches ? 'dark' : 'light');
  paintThemeLabel();
});

// View transitions swap in the incoming page's STATIC <html> attributes (data-theme="dark",
// data-art="on"), and the pre-paint script only runs on full loads — so without this, the
// first client-side navigation silently flipped the whole site dark. The theme belongs to
// the listener, not the page: re-resolve it (and carry the live art state) on every swap,
// before the new page paints. The inversion law stays a per-band move, never a per-page one.
let artAcrossSwap: string | null = null;
document.addEventListener('astro:before-swap', () => {
  artAcrossSwap = root.getAttribute('data-art');
});
document.addEventListener('astro:after-swap', () => {
  root.setAttribute('data-theme', resolvedTheme());
  if (artAcrossSwap) root.setAttribute('data-art', artAcrossSwap);
});
