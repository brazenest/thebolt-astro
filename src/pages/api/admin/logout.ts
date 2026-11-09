/** Admin sign-out: clear the session cookie. */
import type { APIRoute } from 'astro';
import { clearedSessionCookie } from '../../../lib/server/admin-auth';

export const prerender = false;

export const POST: APIRoute = () =>
  new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'set-cookie': clearedSessionCookie(),
    },
  });
