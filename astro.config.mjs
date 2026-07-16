// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// The Bolt — thebolt.stream, a ClubFM station. Deploy target: Cloudflare Workers via the
// Cloudflare adapter. Pages are static by default; API routes (request, rank, nowplaying
// proxy) opt into on-demand rendering with `export const prerender = false`.
export default defineConfig({
  site: 'https://thebolt.stream',
  trailingSlash: 'never',
  adapter: cloudflare({
    // Expose the Cloudflare bindings (D1, KV, secrets) to `astro dev` via miniflare, so the
    // request + SongRank flows can be exercised locally against wrangler.jsonc.
    platformProxy: { enabled: true },
    // Custom worker entry that adds scheduled() for the hourly SongRank digest (src/worker.ts),
    // delegating all fetch handling to the adapter's own handler.
    workerEntryPoint: { path: 'src/worker.ts' },
  }),
});
