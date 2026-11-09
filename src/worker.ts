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
import { captureNowPlaying } from './lib/server/capture';
import { generateAndPublish } from './lib/server/chart';
import type { Env } from './lib/server/env';

interface ExecutionCtx {
  waitUntil(promise: Promise<unknown>): void;
}
interface ScheduledEvt {
  cron?: string;
}

const WEEKLY_CHART_CRON = '0 9 * * 1';

export function createExports(manifest: SSRManifest) {
  const server = createServerExports(manifest).default;
  return {
    default: {
      fetch: server.fetch,
      scheduled(event: ScheduledEvt, env: Env, ctx: ExecutionCtx): void {
        // Triggers (wrangler.jsonc): "* * * * *" captures the on-air track into the plays
        // log; "0 * * * *" additionally sends the hourly SongRank digest. At :00 both fire as
        // separate events. Never await here — hand the work to the runtime so the cron returns.
        // "0 9 * * 1" publishes the weekly airplay chart (Monday 09:00 UTC, as on the Next site).
        if (event.cron === WEEKLY_CHART_CRON) {
          ctx.waitUntil(
            generateAndPublish(env, { type: 'weekly', mode: 'published' }).catch((err) =>
              console.error('weekly chart publish failed:', err)
            )
          );
        } else if (event.cron === '0 * * * *') ctx.waitUntil(runHourlyDigest(env));
        else ctx.waitUntil(captureNowPlaying(env));
      },
    },
  };
}
