/**
 * THE BOLT — admin sign-in. One admin login, stored in D1 (`admin_config`, row id 1).
 *
 * Ported from the Next site's lib/admin-auth.ts, on Web Crypto instead of node:crypto, with two
 * hardening changes:
 *   - passwords are PBKDF2-SHA256 (100k iterations, the Workers ceiling), not a single HMAC;
 *   - with no stored login, the first one is created from the ADMIN_BOOTSTRAP_PASSWORD secret.
 *     The Next site fell back to "admin / changeme" in production; here that fallback exists
 *     only under `astro dev`. Without the secret, production sign-in stays closed.
 *
 * Sessions are a signed cookie: base64url(username).expiry.hmac(secret, "username:expiry").
 * The secret rotates whenever credentials change, which signs every session out.
 */
import type { D1Like, Env } from './env';

export const SESSION_COOKIE = 'bolt_admin';
export const SESSION_TTL_S = 60 * 60 * 24; // 24 hours
const ITERATIONS = 100_000;
const DEV_PASSWORD = 'changeme';

const enc = new TextEncoder();

function hex(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
  return s;
}
function randomHex(bytes = 32): string {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)));
}
function b64url(s: string): string {
  return btoa(String.fromCharCode(...enc.encode(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
function unb64url(s: string): string {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
/** Constant-time compare of two equal-length hex strings. */
function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function pbkdf2(password: string, salt: string, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations },
    key,
    256
  );
  return hex(bits);
}

async function hmac(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(payload)));
}

export interface AdminConfig {
  username: string;
  pw_hash: string;
  salt: string;
  iterations: number;
  secret: string;
  is_default: number;
}

async function writeConfig(db: D1Like, c: AdminConfig): Promise<void> {
  await db
    .prepare(
      `INSERT INTO admin_config (id, username, pw_hash, salt, iterations, secret, is_default, updated_at)
       VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7)
       ON CONFLICT (id) DO UPDATE SET username = ?1, pw_hash = ?2, salt = ?3, iterations = ?4,
         secret = ?5, is_default = ?6, updated_at = ?7`
    )
    .bind(c.username, c.pw_hash, c.salt, c.iterations, c.secret, c.is_default, Math.floor(Date.now() / 1000))
    .run();
}

/**
 * The stored login, created on first use from ADMIN_BOOTSTRAP_PASSWORD (or the dev fallback).
 * Null when there is no login and nothing to bootstrap from — sign-in is closed.
 */
export async function getAdminConfig(env: Env, dev = import.meta.env.DEV): Promise<AdminConfig | null> {
  const db = env.DB;
  if (!db) return null;
  const row = await db
    .prepare('SELECT username, pw_hash, salt, iterations, secret, is_default FROM admin_config WHERE id = 1')
    .first<AdminConfig>();
  if (row) return row;

  const bootstrap = env.ADMIN_BOOTSTRAP_PASSWORD || (dev ? DEV_PASSWORD : '');
  if (!bootstrap) return null;
  const salt = randomHex();
  const config: AdminConfig = {
    username: env.ADMIN_USERNAME?.trim() || 'admin',
    pw_hash: await pbkdf2(bootstrap, salt, ITERATIONS),
    salt,
    iterations: ITERATIONS,
    secret: randomHex(),
    is_default: env.ADMIN_BOOTSTRAP_PASSWORD ? 0 : 1,
  };
  await writeConfig(db, config);
  return config;
}

export async function verifyCredentials(
  config: AdminConfig,
  username: string,
  password: string
): Promise<boolean> {
  // Always hash, so a wrong username costs the same time as a wrong password.
  const hash = await pbkdf2(password, config.salt, config.iterations);
  return username === config.username && sameHex(hash, config.pw_hash);
}

/** Replace the login. Rotates the session secret, signing everyone out. */
export async function updateCredentials(env: Env, username: string, password: string): Promise<void> {
  if (!env.DB) throw new Error('The admin database (DB) is not bound.');
  const salt = randomHex();
  await writeConfig(env.DB, {
    username: username.trim(),
    pw_hash: await pbkdf2(password, salt, ITERATIONS),
    salt,
    iterations: ITERATIONS,
    secret: randomHex(),
    is_default: 0,
  });
}

export async function createSessionToken(config: AdminConfig, nowS = Math.floor(Date.now() / 1000)): Promise<string> {
  const expiry = nowS + SESSION_TTL_S;
  const sig = await hmac(config.secret, `${config.username}:${expiry}`);
  return `${b64url(config.username)}.${expiry}.${sig}`;
}

export async function verifySessionToken(
  config: AdminConfig,
  token: string,
  nowS = Math.floor(Date.now() / 1000)
): Promise<boolean> {
  try {
    const [userB64, expStr, sig] = token.split('.');
    if (!userB64 || !expStr || !sig) return false;
    const expiry = Number(expStr);
    if (!Number.isInteger(expiry) || expiry < nowS) return false;
    const username = unb64url(userB64);
    if (username !== config.username) return false;
    return sameHex(sig, await hmac(config.secret, `${username}:${expiry}`));
  } catch {
    return false;
  }
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

/** The signed-in admin's config, or null. Use at the top of every admin page and endpoint. */
export async function currentAdmin(env: Env, request: Request): Promise<AdminConfig | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const config = await getAdminConfig(env);
  if (!config) return null;
  return (await verifySessionToken(config, token)) ? config : null;
}

export function sessionCookie(token: string, secure: boolean): string {
  return [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${SESSION_TTL_S}`,
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}
