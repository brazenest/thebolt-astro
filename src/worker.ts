/**
 * THE BOLT — worker entry (workerEntryPoint).
 *
 * The Astro Cloudflare adapter normally ships its own entry that only exports `fetch`. We swap
 * in this one to ADD a `scheduled()` handler for the hourly SongRank digest, while delegating
 * every request to the adapter's own fetch handler (so static assets, middleware, and API
 * routes behave exactly as before). Same worker, one deploy — no separate cron worker.
 *
 * Wire-up: astro.config.mjs → adapter `workerEntryPoint: { path: 'src/worker.ts' }`, and the
 * cron trigger lives in wrangler.jsonc (`triggers.crons`).
 */
import type { SSRManifest } from 'astro';
import { createExports as createServerExports } from '@astrojs/cloudflare/entrypoints/server.js';
import { runHourlyDigest } from './lib/server/digest';
import type { Env } from './lib/server/env';

interface ExecutionCtx {
  waitUntil(promise: Promise<unknown>): void;
}

export function createExports(manifest: SSRManifest) {
  const server = createServerExports(manifest).default;
  return {
    default: {
      fetch: server.fetch,
      scheduled(_event: unknown, env: Env, ctx: ExecutionCtx): void {
        // Never await here — hand the work to the runtime so the cron returns promptly.
        ctx.waitUntil(runHourlyDigest(env));
      },
    },
  };
}
