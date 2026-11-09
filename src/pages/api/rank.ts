/**
 * THE BOLT — SongRank vote → D1 ledger.
 *
 * One tap, so it will get botted. Protection is the HMAC nonce the now-playing payload carries:
 * the POST must echo it, and we re-verify the signature + expiry with RANK_SECRET, so a vote can
 * only land on the track that was actually on air, and only for the nonce's short window. On top
 * of that, a fixed-window rate limit on hash(ip)+trackKey caps floods. No email here — ranks are
 * batched into the hourly digest (see lib/server/digest.ts).
 */
import type { APIRoute } from 'astro';
import { getEnv } from '../../lib/server/env';
import { json } from '../../lib/server/http';
import { checkRateLimit } from '../../lib/server/ratelimit';
import { ipHashOf } from '../../lib/server/hash';
import { verifyNonce } from '../../lib/nowplaying/nonce';
import type { RankNonce } from '../../lib/nowplaying/types';
import { insertRank } from '../../lib/server/ranks-db';

export const prerender = false;

function isNonce(n: unknown): n is RankNonce {
  if (!n || typeof n !== 'object') return false;
  const o = n as Record<string, unknown>;
  return typeof o.trackKey === 'string' && typeof o.exp === 'number' && typeof o.sig === 'string';
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = getEnv(locals);
  const ip = request.headers.get('cf-connecting-ip');

  let body: { value?: unknown; nonce?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: 'Malformed request.' }, 400);
  }

  const value = Number(body.value);
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    return json({ ok: false, error: 'Invalid rating.' }, 400);
  }
  if (!isNonce(body.nonce)) return json({ ok: false, error: 'Missing authorisation.' }, 400);
  const nonce = body.nonce;

  // Mirror the proxy's secret resolution so a dev-signed nonce verifies under `astro dev`.
  const secret = env.RANK_SECRET || (import.meta.env.DEV ? 'dev-insecure-secret' : '');
  const nowSec = Math.floor(Date.now() / 1000);
  if (!secret || !(await verifyNonce(nonce, secret, nowSec))) {
    return json({ ok: false, error: 'Could not verify this rating.' }, 403);
  }

  const ipHash = await ipHashOf(env, ip);
  if (!(await checkRateLimit(env, `rank:${ipHash}:${nonce.trackKey}`, 4, 60))) {
    return json({ ok: false, error: 'Slow down.' }, 429);
  }

  const db = env.DB;
  if (!db) return json({ ok: true, stored: false }); // dev without D1 — accept, persist nothing

  try {
    await insertRank(db, { trackKey: nonce.trackKey, value, ipHash, at: nowSec });
    return json({ ok: true, stored: true });
  } catch {
    return json({ ok: false, error: 'Could not record right now.' }, 502);
  }
};
