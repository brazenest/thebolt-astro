/** JSON response + untrusted-input coercion helpers for the transactional endpoints. */

export function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/** Trim + length-cap an untrusted value to a string; non-strings become "". */
export function str(v: unknown, max = 500): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}
