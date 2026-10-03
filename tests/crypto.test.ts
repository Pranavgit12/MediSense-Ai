import { describe, expect, it } from 'vitest';

import {
  decryptString,
  decryptStringFromText,
  encryptString,
  encryptStringForText,
  generateToken,
  hashPassword,
  keyedHash,
  verifyPassword,
} from '../src/utils/crypto';

describe('password hashing', () => {
  it('produces a PHC argon2id string that verifies', async () => {
    // This guards a real regression: a wrong `version` argument makes `hash()`
    // throw, and `verify()` swallows the error, so every sign-in would silently
    // fail with no error anywhere.
    const { hash, algorithm } = await hashPassword('correct horse battery');
    expect(algorithm).toBe('argon2id');
    expect(hash.startsWith('$argon2id$v=19$')).toBe(true);
    await expect(verifyPassword(hash, 'correct horse battery')).resolves.toBe(true);
  });

  it('rejects the wrong password without throwing', async () => {
    const { hash } = await hashPassword('correct horse battery');
    await expect(verifyPassword(hash, 'wrong password')).resolves.toBe(false);
  });

  it('salts, so the same password never hashes to the same value', async () => {
    const a = await hashPassword('same password');
    const b = await hashPassword('same password');
    expect(a.hash).not.toBe(b.hash);
  });

  it('returns false rather than throwing on a malformed stored hash', async () => {
    await expect(verifyPassword('not-a-real-hash', 'anything')).resolves.toBe(false);
  });
});

describe('keyed hashes', () => {
  it('is stable and does not contain the input', () => {
    const a = keyedHash('some-token');
    expect(keyedHash('some-token')).toBe(a);
    expect(a).not.toContain('some-token');
  });

  it('differs for different inputs', () => {
    expect(keyedHash('a')).not.toBe(keyedHash('b'));
  });
});

describe('generateToken', () => {
  it('produces distinct, url-safe tokens of the requested byte length', () => {
    const a = generateToken(32);
    const b = generateToken(32);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });
});

describe('encryption at rest', () => {
  it('round-trips text', () => {
    const cipher = encryptString('haemoglobin 12.1 g/dL');
    expect(cipher.toString('utf8')).not.toContain('haemoglobin');
    expect(decryptString(cipher)).toBe('haemoglobin 12.1 g/dL');
  });

  it('produces a different ciphertext each time', () => {
    expect(encryptString('same').equals(encryptString('same'))).toBe(false);
  });

  it('returns null on tampered ciphertext rather than throwing', () => {
    const cipher = encryptString('sensitive');
    const last = cipher.length - 1;
    cipher[last] = (cipher[last] ?? 0) ^ 0xff;
    expect(decryptString(cipher)).toBeNull();
  });

  it('returns null for an empty or absent value', () => {
    expect(decryptString(null)).toBeNull();
    expect(decryptString(undefined)).toBeNull();
  });

  it('round-trips encrypted values stored in text columns', () => {
    const encrypted = encryptStringForText('patient report text');
    expect(encrypted).toMatch(/^enc:v1:/);
    expect(encrypted).not.toContain('patient report text');
    expect(decryptStringFromText(encrypted)).toBe('patient report text');
    expect(decryptStringFromText('legacy plaintext')).toBeNull();
  });
});
