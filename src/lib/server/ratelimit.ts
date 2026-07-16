/**
 * Fixed-window rate limiter over a KV namespace. Fails OPEN: when RATE_LIMIT is unbound (local
 * dev, or a project without the binding) every request is allowed — a limiter is never allowed
 * to take an endpoint down. Read-then-write, so counts are approximate under a burst; that's
 * fine for a spam-flood guard.
 */
import type { Env } from './env';

export async function checkRateLimit(
  env: Env,
  key: string,
  limit = 10,
  windowSec = 60
): Promise<boolean> {
  const kv = env.RATE_LIMIT;
  if (!kv) return true;
  try {
    const bucket = Math.floor(Date.now() / 1000 / windowSec);
    const k = `rl:${key}:${bucket}`;
    const current = Number((await kv.get(k)) ?? '0');
    if (current >= limit) return false;
    // KV requires expirationTtl >= 60; window + 60 covers the bucket with margin.
    await kv.put(k, String(current + 1), { expirationTtl: windowSec + 60 });
    return true;
  } catch {
    return true;
  }
}
