/**
 * THE BOLT — hourly SongRank digest.
 *
 * Runs from the worker's scheduled() handler (cron: 0 * * * *). Rolls up the last hour of the
 * ranks ledger and emails the station one summary — never one mail per tap. An empty hour sends
 * nothing. Never throws out of here; a cron that throws just retries noisily.
 *
 *   now → injected in tests; defaults to wall clock.
 */
import type { Env } from './env';
import { composeDigest } from './mail-format';
import { emailConfigured, resolveTo, sendMail } from './email';
import { hourlyRollup } from './ranks-db';

const HOUR_SEC = 3600;

export async function runHourlyDigest(env: Env, now: number = Date.now()): Promise<void> {
  const db = env.DB;
  if (!db) return; // no ledger bound — nothing to summarise

  const end = Math.floor(now / 1000);
  const start = end - HOUR_SEC;

  let rows;
  try {
    rows = await hourlyRollup(db, start);
  } catch (err) {
    console.error('[digest] rollup query failed:', err);
    return;
  }
  if (!rows.length) return; // no ratings this hour — no mail

  const to = resolveTo(env);
  const mail = composeDigest(rows, { start, end });

  if (!emailConfigured(env, to)) {
    console.warn('[digest] email not configured; skipping:', mail.subject);
    return;
  }
  try {
    await sendMail(env, { to: to as string, subject: mail.subject, text: mail.text });
  } catch (err) {
    console.error('[digest] Resend send failed:', err);
  }
}
