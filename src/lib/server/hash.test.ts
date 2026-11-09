import { describe, it, expect } from 'vitest';
import { ipHashOf, sha256Hex } from './hash';

describe('ipHashOf', () => {
  it('is keyed: same IP, different secret → different hash; same secret → stable', async () => {
    const a = await ipHashOf({ IP_HASH_SECRET: 'k1' }, '203.0.113.7', false);
    expect(a).toHaveLength(32);
    expect(await ipHashOf({ IP_HASH_SECRET: 'k1' }, '203.0.113.7', false)).toBe(a);
    expect(await ipHashOf({ IP_HASH_SECRET: 'k2' }, '203.0.113.7', false)).not.toBe(a);
  });

  it('a keyed hash is not the public-salt hash an attacker could brute-force', async () => {
    const publicSalt = (await sha256Hex('bolt-ip:203.0.113.7')).slice(0, 32);
    expect(await ipHashOf({ IP_HASH_SECRET: 'k1' }, '203.0.113.7', false)).not.toBe(publicSalt);
    // Unset in production: still works, degraded to the public salt.
    expect(await ipHashOf({}, '203.0.113.7', false)).toBe(publicSalt);
  });
});
