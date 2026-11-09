/** Admin sign-in → signed session cookie. Rate-limited per IP against password guessing. */
import type { APIRoute } from 'astro';
import { getEnv } from '../../../lib/server/env';
import { json, str } from '../../../lib/server/http';
import { checkRateLimit } from '../../../lib/server/ratelimit';
import { ipHashOf } from '../../../lib/server/hash';
import {
  createSessionToken,
  getAdminConfig,
  sessionCookie,
  verifyCredentials,
} from '../../../lib/server/admin-auth';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, url }) => {
  const env = getEnv(locals);
  const ipHash = await ipHashOf(request.headers.get('cf-connecting-ip'));
  if (!(await checkRateLimit(env, `login:${ipHash}`, 10, 300))) {
    return json({ ok: false, error: 'Too many attempts. Try again in a few minutes.' }, 429);
  }

  let body: { username?: unknown; password?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: 'Malformed request.' }, 400);
  }
  const username = str(body.username, 100);
  const password = typeof body.password === 'string' ? body.password.slice(0, 200) : '';
  if (!username || !password) {
    return json({ ok: false, error: 'Username and password required.' }, 400);
  }

  const config = await getAdminConfig(env);
  if (!config) {
    return json({ ok: false, error: 'Admin sign-in isn’t set up on this deployment.' }, 503);
  }
  if (!(await verifyCredentials(config, username, password))) {
    return json({ ok: false, error: 'Wrong username or password.' }, 401);
  }

  const token = await createSessionToken(config);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'set-cookie': sessionCookie(token, url.protocol === 'https:'),
    },
  });
};
