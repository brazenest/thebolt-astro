/**
 * THE BOLT — song request → inbox.
 *
 * Flow: rate limit → honeypot → Turnstile → validate → Resend delivery. Accepts JSON (the
 * enhanced client) or form-encoded (the no-JS <form> fallback). Absent email config (dev) →
 * optimistic success so the form is testable offline; nothing is delivered.
 */
import type { APIRoute } from 'astro';
import { getEnv } from '../../lib/server/env';
import { json, str } from '../../lib/server/http';
import { checkRateLimit } from '../../lib/server/ratelimit';
import { turnstileConfigured, verifyTurnstile } from '../../lib/server/turnstile';
import { emailConfigured, resolveTo, sendMail } from '../../lib/server/email';
import { composeRequest } from '../../lib/server/mail-format';
import { ipHashOf } from '../../lib/server/hash';

export const prerender = false;

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const ct = request.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    try {
      return (await request.json()) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  try {
    const fd = await request.formData();
    return Object.fromEntries(fd.entries());
  } catch {
    return {};
  }
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = getEnv(locals);
  const ip = request.headers.get('cf-connecting-ip');
  const ipHash = await ipHashOf(ip);

  if (!(await checkRateLimit(env, `req:${ipHash}`, 8, 60))) {
    return json({ ok: false, error: 'Too many requests. Please slow down.' }, 429);
  }

  const body = await readBody(request);

  // Honeypot: a filled hidden field means a bot. Pretend success, send nothing.
  if (str(body.website, 200)) return json({ ok: true });

  const track = str(body.song ?? body.track, 200);
  const artist = str(body.artist, 200);
  if (!track) return json({ ok: false, error: 'Please enter a song.' }, 400);

  if (turnstileConfigured(env)) {
    const token = str(body.token ?? body['cf-turnstile-response'], 4000);
    if (!token) return json({ ok: false, error: 'Please complete the verification.' }, 422);
    if (!(await verifyTurnstile(env, token, ip))) {
      return json({ ok: false, error: 'Verification failed. Please try again.' }, 403);
    }
  }

  const mail = composeRequest(track, artist);
  const to = resolveTo(env);
  if (!emailConfigured(env, to)) {
    // Dev / unconfigured → optimistic success; nothing delivered.
    return json({ ok: true, delivered: false });
  }

  try {
    await sendMail(env, { to: to as string, subject: mail.subject, text: mail.text });
    return json({ ok: true, delivered: true });
  } catch {
    return json({ ok: false, error: 'Could not send right now. Please try again later.' }, 502);
  }
};
