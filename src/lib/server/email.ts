/**
 * Transactional email via Resend's HTTP API (plain fetch — no SDK, runs natively on Workers).
 * Outbound only; the single Resend path for the site (song requests + the hourly SongRank
 * digest). Ported from The Bolt's current implementation — same env names, same call shape.
 */
import type { Env } from './env';

/** Where listener mail lands. */
export function resolveTo(env: Env): string | undefined {
  return env.EMAIL_TO;
}

/** True when Resend is fully configured for a delivery to `to`. */
export function emailConfigured(env: Env, to: string | undefined): boolean {
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM && to);
}

export async function sendMail(
  env: Env,
  msg: { to: string; subject: string; text: string; replyTo?: string }
): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [msg.to],
      reply_to: msg.replyTo,
      subject: msg.subject,
      text: msg.text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend API ${res.status}: ${body}`);
  }
}
