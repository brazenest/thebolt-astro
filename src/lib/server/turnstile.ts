/**
 * Cloudflare Turnstile server-side verification (siteverify). Skips verification — returns
 * true — when TURNSTILE_SECRET_KEY is unset, so local dev and any unconfigured environment
 * keep working. Callers check turnstileConfigured() first to tell "missing token" (422) apart
 * from "verification failed" (403).
 */
import type { Env } from './env';

export function turnstileConfigured(env: Env): boolean {
  return Boolean(env.TURNSTILE_SECRET_KEY);
}

export async function verifyTurnstile(env: Env, token: string, ip: string | null): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) return true;
  if (!token) return false;
  try {
    const form = new FormData();
    form.append('secret', env.TURNSTILE_SECRET_KEY);
    form.append('response', token);
    if (ip) form.append('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
