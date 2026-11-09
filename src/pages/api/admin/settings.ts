/**
 * Admin credentials. POST { currentPassword, username, newPassword, confirmPassword } replaces
 * the login; the session secret rotates, so every session (this one too) is signed out.
 * Same rules and messages as the Next site's /api/admin/settings.
 */
import type { APIRoute } from 'astro';
import { getEnv } from '../../../lib/server/env';
import { json, str } from '../../../lib/server/http';
import { checkRateLimit } from '../../../lib/server/ratelimit';
import { ipHashOf } from '../../../lib/server/hash';
import {
  clearedSessionCookie,
  currentAdmin,
  updateCredentials,
  verifyCredentials,
} from '../../../lib/server/admin-auth';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = getEnv(locals);
  const admin = await currentAdmin(env, request);
  if (!admin) return json({ ok: false, error: 'Signed out. Sign in again.' }, 401);

  // The current-password check is a password oracle too — limit it like sign-in.
  const ipHash = await ipHashOf(request.headers.get('cf-connecting-ip'));
  if (!(await checkRateLimit(env, `login:${ipHash}`, 10, 300))) {
    return json({ ok: false, error: 'Too many attempts. Try again in a few minutes.' }, 429);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'Malformed request.' }, 400);
  }
  const pw = (v: unknown) => (typeof v === 'string' ? v.slice(0, 200) : '');
  const username = str(body.username, 100);
  const currentPassword = pw(body.currentPassword);
  const newPassword = pw(body.newPassword);
  const confirmPassword = pw(body.confirmPassword);

  if (!currentPassword || !username || !newPassword || !confirmPassword) {
    return json({ ok: false, error: 'All fields are required.' }, 400);
  }
  if (username.length < 3 || username.length > 64) {
    return json({ ok: false, error: 'Username must be 3–64 characters.' }, 400);
  }
  if (newPassword.length < 8) {
    return json({ ok: false, error: 'New password must be at least 8 characters.' }, 400);
  }
  if (newPassword !== confirmPassword) {
    return json({ ok: false, error: 'Passwords do not match.' }, 400);
  }
  if (!(await verifyCredentials(admin, admin.username, currentPassword))) {
    return json({ ok: false, error: 'Current password is incorrect.' }, 403);
  }

  await updateCredentials(env, username, newPassword);
  return new Response(JSON.stringify({ ok: true, mustReLogin: true }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'set-cookie': clearedSessionCookie(),
    },
  });
};
