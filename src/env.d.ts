/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

// Runtime bindings reach API routes via Astro.locals.runtime.env (Cloudflare adapter, with
// platformProxy in dev). The binding shape is defined once in src/lib/server/env.ts.
declare namespace App {
  interface Locals {
    runtime: {
      env: import('./lib/server/env').Env;
      ctx: { waitUntil(promise: Promise<unknown>): void; passThroughOnException(): void };
      cf?: unknown;
    };
  }
}

// Public build-time vars (exposed to the client). Server secrets are NOT here — they live on
// the runtime env above and never reach the browser.
interface ImportMetaEnv {
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
  readonly PUBLIC_STREAM_URL?: string;
  readonly PUBLIC_STREAM_FALLBACK_URL?: string;
}
