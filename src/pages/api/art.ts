/** GET /api/art?src=<AzuraCast art URL> — album art via R2. See lib/server/art.ts. */
import type { APIRoute } from 'astro';
import { getEnv } from '../../lib/server/env';
import { serveArt } from '../../lib/server/art';

export const prerender = false;

export const GET: APIRoute = ({ locals, url }) => serveArt(getEnv(locals), url.searchParams.get('src'));
