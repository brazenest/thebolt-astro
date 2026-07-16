/**
 * Fetches a fresh, invisible Turnstile token before a listener submits the request form. Uses
 * "invisible" execution mode so there's no widget UI in the common case. Ported from The Bolt's
 * turnstile-client.
 *
 * Resolves `undefined` when PUBLIC_TURNSTILE_SITE_KEY is unset (dev) or on any failure — the
 * server skips verification the same way when its secret is unset, so this degrades cleanly.
 */
declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      execute: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
let scriptPromise: Promise<void> | null = null;
let widgetId: string | null = null;
let resolveToken: ((token: string | undefined) => void) | null = null;

function loadScript(): Promise<void> {
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      if (window.turnstile) return resolve();
      const script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Turnstile'));
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

function ensureWidget(siteKey: string): string {
  if (widgetId) return widgetId;
  const container = document.createElement('div');
  container.style.display = 'none';
  document.body.appendChild(container);
  widgetId = window.turnstile!.render(container, {
    sitekey: siteKey,
    size: 'invisible',
    execution: 'execute',
    callback: (token: string) => resolveToken?.(token),
    'error-callback': (code: unknown) => {
      // Surface the Turnstile error code (e.g. 110200 = hostname not on the widget's
      // allowlist) — the form degrades either way, but silent failure is undebuggable.
      console.warn(`Turnstile error ${code}`);
      resolveToken?.(undefined);
    },
    'timeout-callback': () => resolveToken?.(undefined),
  });
  return widgetId;
}

export async function getTurnstileToken(): Promise<string | undefined> {
  const siteKey = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY as string | undefined;
  if (!siteKey) return undefined;
  try {
    await loadScript();
    if (!window.turnstile) return undefined;
    const id = ensureWidget(siteKey);
    return await new Promise<string | undefined>((resolve) => {
      resolveToken = resolve;
      window.turnstile!.reset(id);
      window.turnstile!.execute(id);
    });
  } catch {
    return undefined;
  }
}
