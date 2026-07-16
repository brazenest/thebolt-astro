/**
 * THE BOLT — server runtime bindings.
 *
 * The one place the Cloudflare env is shaped and read. Everything is optional: when a binding
 * or secret is absent (local dev, or a not-yet-provisioned resource) the helpers that read it
 * degrade gracefully rather than throwing — Turnstile skips, email no-ops, the rate limiter
 * fails open, D1 writes are skipped — so every listener flow stays testable offline. In
 * production all of these are set and every gate is enforced.
 *
 * Structural D1/KV types are declared locally so this carries no dependency on
 * @cloudflare/workers-types; only the handful of methods we actually call are described.
 */

/** Minimal view of a KV namespace — just what the rate limiter uses. */
export interface KVLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface D1ResultLike<T> {
  results: T[];
}
export interface D1PreparedLike {
  bind(...values: unknown[]): D1PreparedLike;
  run(): Promise<unknown>;
  all<T = Record<string, unknown>>(): Promise<D1ResultLike<T>>;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
}
export interface D1Like {
  prepare(query: string): D1PreparedLike;
}

export interface Env {
  /** Now-playing source (see src/pages/api/nowplaying.ts). */
  AZURACAST_BASE_URL?: string;
  AZURACAST_BOLT_SHORTCODE?: string;
  /** HMAC secret for the SongRank nonce — signed in the proxy, verified in /api/rank. */
  RANK_SECRET?: string;

  /** Resend transactional email (song requests + hourly SongRank digest). */
  RESEND_API_KEY?: string;
  /** Verified sender, e.g. "The Bolt <no-reply@thebolt.stream>". */
  EMAIL_FROM?: string;
  /** Where listener mail lands, e.g. music@thebolt.stream. */
  EMAIL_TO?: string;

  /** Turnstile server secret. Unset → verification is skipped (dev). */
  TURNSTILE_SECRET_KEY?: string;

  /** D1 database — the plays log and the SongRank ledger. */
  DB?: D1Like;
  /** KV namespace backing the fixed-window rate limiter. Unbound → limiter fails open. */
  RATE_LIMIT?: KVLike;
}

/** Read the runtime env off Astro locals. Defensive: returns {} when the proxy isn't present. */
export function getEnv(locals: App.Locals): Env {
  const runtime = (locals as unknown as { runtime?: { env?: Env } }).runtime;
  return runtime?.env ?? {};
}
