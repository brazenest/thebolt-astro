import { describe, it, expect } from 'vitest';
import {
  createSessionToken,
  getAdminConfig,
  readCookie,
  verifyCredentials,
  verifySessionToken,
  SESSION_TTL_S,
  type AdminConfig,
} from './admin-auth';

/** Fake D1 holding the single admin_config row. */
function fakeDb() {
  let row: AdminConfig | null = null;
  return {
    get row() {
      return row;
    },
    prepare(query: string) {
      let bound: unknown[] = [];
      return {
        bind(...v: unknown[]) {
          bound = v;
          return this;
        },
        async run() {
          if (query.includes('INSERT INTO admin_config')) {
            const [username, pw_hash, salt, iterations, secret, is_default] = bound as [string, string, string, number, string, number];
            row = { username, pw_hash, salt, iterations, secret, is_default };
          }
          return {};
        },
        async all<T>() {
          return { results: [] as T[] };
        },
        async first<T>() {
          return row as T | null;
        },
      };
    },
  };
}

describe('admin login', () => {
  it('stays closed in production with no stored login and no bootstrap secret', async () => {
    expect(await getAdminConfig({ DB: fakeDb() }, false)).toBeNull();
  });

  it('bootstraps from ADMIN_BOOTSTRAP_PASSWORD and verifies it', async () => {
    const db = fakeDb();
    const config = (await getAdminConfig({ DB: db, ADMIN_BOOTSTRAP_PASSWORD: 'correct horse' }, false))!;
    expect(config.username).toBe('admin');
    expect(config.is_default).toBe(0);
    expect(config.pw_hash).not.toContain('correct');
    expect(await verifyCredentials(config, 'admin', 'correct horse')).toBe(true);
    expect(await verifyCredentials(config, 'admin', 'wrong')).toBe(false);
    expect(await verifyCredentials(config, 'root', 'correct horse')).toBe(false);
    // Second read returns the stored row, not a fresh bootstrap.
    expect((await getAdminConfig({ DB: db }, false))!.salt).toBe(config.salt);
  });

  it('dev falls back to changeme, flagged as default', async () => {
    const config = (await getAdminConfig({ DB: fakeDb() }, true))!;
    expect(config.is_default).toBe(1);
    expect(await verifyCredentials(config, 'admin', 'changeme')).toBe(true);
  });
});

describe('sessions', () => {
  const config: AdminConfig = { username: 'admin', pw_hash: '', salt: '', iterations: 1, secret: 'a'.repeat(64), is_default: 0 };

  it('round-trips, expires, and rejects tampering or a rotated secret', async () => {
    const now = 1_800_000_000;
    const token = await createSessionToken(config, now);
    expect(await verifySessionToken(config, token, now)).toBe(true);
    expect(await verifySessionToken(config, token, now + SESSION_TTL_S + 1)).toBe(false);
    const [u, , sig] = token.split('.');
    expect(await verifySessionToken(config, `${u}.${now + 999_999}.${sig}`, now)).toBe(false);
    expect(await verifySessionToken({ ...config, secret: 'b'.repeat(64) }, token, now)).toBe(false);
    expect(await verifySessionToken(config, 'garbage', now)).toBe(false);
  });

  it('reads one cookie out of a header', () => {
    const req = new Request('https://x/', { headers: { cookie: 'a=1; bolt_admin=tok.en; b=2' } });
    expect(readCookie(req, 'bolt_admin')).toBe('tok.en');
    expect(readCookie(req, 'missing')).toBeNull();
  });
});
