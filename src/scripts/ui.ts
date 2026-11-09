/**
 * THE BOLT — page chrome behaviour: the theme toggle.
 *
 * Theme policy: follow the OS until the listener explicitly chooses, then keep that choice for
 * 7 days after their most recent visit (the pre-paint script in Base.astro slides the window on
 * each load and owns the first paint, so there's no flash). With no fresh choice, live OS
 * changes are followed while the page is open.
 *
 * Bound on astro:page-load so it survives view-transition navigations.
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
  if (!btn) return;
  const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  btn.setAttribute('aria-label', `Switch to ${next} theme`);
  btn.setAttribute('title', `Switch to ${next} theme`);
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

function mount(): void {
  const theme = document.getElementById('theme');
  if (theme && !theme.dataset.bound) {
    theme.dataset.bound = '1';
    theme.addEventListener('click', onThemeClick);
  }
  paintThemeLabel();
}

document.addEventListener('astro:page-load', mount);

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  if (hasFreshChoice()) return;
  root.setAttribute('data-theme', e.matches ? 'dark' : 'light');
  paintThemeLabel();
});

// View transitions swap in the incoming page's static <html> attributes (no data-theme), and
// the pre-paint script only runs on full loads — re-resolve the listener's theme on every swap.
document.addEventListener('astro:after-swap', () => {
  root.setAttribute('data-theme', resolvedTheme());
});
