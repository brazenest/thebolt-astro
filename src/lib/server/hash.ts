/**
 * PII-free hashing (Web Crypto — runs in Workers and Node 20+). We never store a raw IP: the
 * rate limiter and the ranks ledger key off a keyed hash of it, so the ledger can't be used to
 * reconstruct who rated what.
 *
 * The IP hash is an HMAC keyed by the IP_HASH_SECRET secret. A plain salted SHA-256 isn't
 * enough: the salt sits in the source, and the whole IPv4 space is small enough to hash in
 * minutes, so every stored hash could be turned back into an address. Without the key, it can't.
 */
import type { Env } from './env';

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < b.length; i++) hex += b[i].toString(16).padStart(2, '0');
  return hex;
}

export async function sha256Hex(input: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(input)));
}

export async function hmacHex(key: string, input: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return toHex(await crypto.subtle.sign('HMAC', k, enc.encode(input)));
}

let warned = false;

/**
 * Stable, non-reversible handle for a client IP. Under `astro dev` an unset secret falls back
 * to a fixed dev key. In production an unset secret still works (nothing breaks) but the hash
 * is only as strong as a public salt, so it logs a warning: set IP_HASH_SECRET.
 */
export async function ipHashOf(env: Env, ip: string | null, dev = import.meta.env.DEV): Promise<string> {
  const input = `bolt-ip:${ip ?? 'unknown'}`;
  const key = env.IP_HASH_SECRET || (dev ? 'dev-insecure-ip-key' : '');
  if (key) return (await hmacHex(key, input)).slice(0, 32);
  if (!warned) {
    warned = true;
    console.warn('IP_HASH_SECRET is not set; IP hashes fall back to a public salt.');
  }
  return (await sha256Hex(input)).slice(0, 32);
}
