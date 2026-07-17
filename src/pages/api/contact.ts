/**
 * THE BOLT — contact inquiry → inbox.
 *
 * v1's /api/feedback contact branch, rebuilt on the v2 server stack: rate limit → honeypot →
 * Turnstile → validate → Resend, with the visitor's address as reply-to. One inbox receives
 * every desk; the category rides the subject line and filters route it.
 */
import type { APIRoute } from 'astro';
import { getEnv } from '../../lib/server/env';
import { json, str } from '../../lib/server/http';
import { checkRateLimit } from '../../lib/server/ratelimit';
import { turnstileConfigured, verifyTurnstile } from '../../lib/server/turnstile';
import { emailConfigured, resolveTo, sendMail } from '../../lib/server/email';
import { composeContact } from '../../lib/server/mail-format';
import { ipHashOf } from '../../lib/server/hash';

export const prerender = false;

// The desks the dialog offers; anything else collapses to the catch-all.
const CATEGORIES = [
  'Listener Comments & Questions',
  'Artist / Label Submissions',
  'Advertising',
  'Press & PR',
  'Other / General',
];

export const POST: APIRoute = async ({ request, locals }) => {
  const env = getEnv(locals);
  const ip = request.headers.get('cf-connecting-ip');
  const ipHash = await ipHashOf(ip);

  if (!(await checkRateLimit(env, `contact:${ipHash}`, 5, 60))) {
    return json({ ok: false, error: 'Too many messages. Please slow down.' }, 429);
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    /* fall through to validation */
  }

  // Honeypot: a filled hidden field means a bot. Pretend success, send nothing.
  if (str(body.website, 200)) return json({ ok: true });

  const name = str(body.name, 120);
  const email = str(body.email, 200);
  const company = str(body.company, 200);
  const message = str(body.message, 4000);
  const rawCategory = str(body.category, 80);
  const category = CATEGORIES.includes(rawCategory) ? rawCategory : 'Other / General';

  if (!name || !email || !message) {
    return json({ ok: false, error: 'Missing or invalid fields.' }, 400);
  }

  if (turnstileConfigured(env)) {
    const token = str(body.token, 4000);
    if (!token) return json({ ok: false, error: 'Please complete the verification.' }, 422);
    if (!(await verifyTurnstile(env, token, ip))) {
      return json({ ok: false, error: 'Verification failed. Please try again.' }, 403);
    }
  }

  const mail = composeContact({ category, name, email, company, message });
  const to = resolveTo(env);
  if (!emailConfigured(env, to)) {
    // Dev / unconfigured → optimistic success; nothing delivered.
    return json({ ok: true, delivered: false });
  }

  try {
    await sendMail(env, {
      to: to as string,
      subject: mail.subject,
      text: mail.text,
      replyTo: email,
    });
    return json({ ok: true, delivered: true });
  } catch (err) {
    console.error(`[contact] delivery failed: ${err instanceof Error ? err.message : err}`);
    return json({ ok: false, error: 'Could not send right now. Please try again later.' }, 502);
  }
};
