/**
 * PII-free hashing (Web Crypto — runs in Workers and Node 20+). We never store a raw IP: the
 * rate limiter and the ranks ledger key off a salted SHA-256 of it, so the ledger can't be
 * used to reconstruct who rated what.
 */
const enc = new TextEncoder();

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(input));
  const b = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < b.length; i++) hex += b[i].toString(16).padStart(2, '0');
  return hex;
}

/** Stable, non-reversible handle for a client IP. Salted so it isn't a bare IP hash. */
export async function ipHashOf(ip: string | null): Promise<string> {
  return (await sha256Hex(`bolt-ip:${ip ?? 'unknown'}`)).slice(0, 32);
}
