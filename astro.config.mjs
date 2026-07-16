// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// The Bolt — thebolt.stream, a ClubFM station. Deploy target: Cloudflare Workers via the
// Cloudflare adapter. Pages are static by default; API routes (request, rank, nowplaying
// proxy) opt into on-demand rendering with `export const prerender = false`.
export default defineConfig({
  site: 'https://thebolt.stream',
  trailingSlash: 'never',
  adapter: cloudflare(),
});
