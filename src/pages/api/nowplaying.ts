/**
 * THE BOLT — now-playing proxy.
 *
 * The browser polls this (never AzuraCast directly): solves CORS, hides the upstream URL,
 * and is the ONE place the backend shape is translated to the client contract. It must never
 * 5xx — on any upstream failure it returns a valid degraded snapshot so the UI can fall back
 * to the station identity while the stream plays on.
 *
 *   - AZURACAST_BASE_URL set   → fetch + normalise; on failure, degraded snapshot.
 *   - unset                    → server mock (keeps dev/preview demoable).
 *
 * Output goes through parseBoltSnapshot (the whitelist gate) so no rotation-shaped key can
 * reach a client. A short public cache + stale-while-revalidate lets Cloudflare collapse
 * every listener into one origin hit — cheaper than SSE, and no per-listener connection.
 */
import type { APIRoute } from 'astro';
import { normalizeBoltAzuracast, type AzuracastPayload } from '../../lib/nowplaying/azuracast';
import { mockBoltSnapshot } from '../../lib/nowplaying/mock';
import { parseBoltSnapshot } from '../../lib/nowplaying/schema';
import { signNonce } from '../../lib/nowplaying/nonce';
import type { BoltSnapshot } from '../../lib/nowplaying/types';

export const prerender = false;

interface RuntimeEnv {
  AZURACAST_BASE_URL?: string;
  AZURACAST_BOLT_SHORTCODE?: string;
  RANK_SECRET?: string;
}

function getEnv(locals: App.Locals): RuntimeEnv {
  const runtime = (locals as { runtime?: { env?: RuntimeEnv } }).runtime;
  return runtime?.env ?? {};
}

function json(body: BoltSnapshot, maxAge: number): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // One origin hit fans out to every listener; SWR keeps it fresh without a stampede.
      'cache-control': `public, max-age=${maxAge}, stale-while-revalidate=10`,
    },
  });
}

async function upstream(env: RuntimeEnv, nowMs: number): Promise<BoltSnapshot> {
  const base = env.AZURACAST_BASE_URL?.replace(/\/$/, '');
  if (!base) return mockBoltSnapshot(nowMs);

  const shortcode = env.AZURACAST_BOLT_SHORTCODE || 'bolt';
  const degraded: BoltSnapshot = { nowPlaying: null, recent: [], live: false, nonce: null };
  try {
    const res = await fetch(`${base}/api/nowplaying/${shortcode}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return degraded;
    return normalizeBoltAzuracast((await res.json()) as AzuracastPayload);
  } catch {
    return degraded;
  }
}

export const GET: APIRoute = async ({ locals }) => {
  const env = getEnv(locals);
  const nowMs = Date.now();
  const snapshot = await upstream(env, nowMs);

  // Sign a rank nonce for the current track. Secret required in prod; a fixed dev secret keeps
  // local SongRank working under `astro dev`.
  const secret = env.RANK_SECRET || (import.meta.env.DEV ? 'dev-insecure-secret' : '');
  if (snapshot.nowPlaying && secret) {
    snapshot.nonce = await signNonce(snapshot.nowPlaying, secret, Math.floor(nowMs / 1000));
  }

  // The whitelist gate: rebuild from known fields only. Even the mock and normaliser can't
  // leak a rotation-shaped key past here. Degraded snapshots cache very briefly.
  const clean = parseBoltSnapshot(snapshot);
  return json(clean, clean.live ? 5 : 3);
};
