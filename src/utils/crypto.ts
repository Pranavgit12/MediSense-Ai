import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { getEnv } from '../lib/env';
import type { Version as Argon2Version } from '@node-rs/argon2';

// ── Hashing / tokens ────────────────────────────────────────────────────────

export function sha256Hex(input: string | Uint8Array): string {
  return createHash('sha256')
    .update(typeof input === 'string' ? Buffer.from(input, 'utf8') : input)
    .digest('hex');
}

/**
 * Keyed hash for low-entropy values (IP addresses, user agents, session tokens).
 *
 * A plain SHA-256 of an IP address is trivially reversible via brute force, so
 * we use a server-held HMAC key instead. With DATA_ENCRYPTION_KEY/AUTH_SECRET
 * rotation, stored hashes for these low-entropy fields become unreadable,
 * which is the intended privacy property.
 */
export function keyedHash(value: string): string {
  const env = getEnv();
  const key = env.dataEncryptionKey
    ? Buffer.from(env.dataEncryptionKey, 'base64url')
    : Buffer.from(env.authSecret, 'utf8');
  return createHmac('sha256', key).update(value, 'utf8').digest('hex');
}

export function constantTimeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** URL-safe opaque token. 32 bytes = 256 bits of entropy. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function generateIdempotencyKey(): string {
  return randomBytes(16).toString('base64url');
}

// ── Password hashing (Argon2id) ─────────────────────────────────────────────

export interface PasswordHashResult {
  /** PHC-formatted string: $argon2id$v=19$m=...,t=...,p=...$salt$hash */
  hash: string;
  algorithm: 'argon2id';
}

export async function hashPassword(password: string): Promise<PasswordHashResult> {
  const env = getEnv();
  const { hash } = await import('@node-rs/argon2');
  const out = await hash(password, {
    algorithm: 2, // argon2id
    // `Version` is an ambient const enum, so its members cannot be referenced
    // under isolatedModules. The type import is fine, and `Version.V0x13` is the
    // enum value 1, which is the wire value for Argon2 version 19 (0x13).
    version: 1 as Argon2Version,
    memoryCost: env.argon2MemoryKib,
    timeCost: env.argon2Iterations,
    parallelism: env.argon2Parallelism,
  });
  return { hash: out, algorithm: 'argon2id' };
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    const { verify } = await import('@node-rs/argon2');
    return await verify(passwordHash, password, { algorithm: 2 });
  } catch {
    return false;
  }
}

// ── Envelope encryption at rest ─────────────────────────────────────────────

const ALG = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

function getDataKey(): Buffer {
  const env = getEnv();
  if (!env.dataEncryptionKey) {
    if (env.isProd) throw new Error('DATA_ENCRYPTION_KEY is required in production');
    // Deterministic development key so data survives restarts in dev.
    return createHash('sha256').update('medisense-development-only-key').digest();
  }
  const key = Buffer.from(env.dataEncryptionKey, 'base64url');
  if (key.length !== 32) {
    throw new Error('DATA_ENCRYPTION_KEY must decode to exactly 32 bytes');
  }
  return key;
}

export interface EncryptedBlob {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  authTag: Uint8Array;
  keyVersion: number;
}

const KEY_VERSION = 1;
const TEXT_CIPHER_PREFIX = 'enc:v1:';

export function encryptString(plaintext: string): Buffer {
  const key = getDataKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALG, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Layout: [1 byte keyVersion][12 byte IV][16 byte tag][ciphertext]
  return Buffer.concat([Buffer.from([KEY_VERSION]), iv, authTag, ciphertext]);
}

/** Store an encrypted payload in a text column without exposing plaintext. */
export function encryptStringForText(plaintext: string): string {
  return `${TEXT_CIPHER_PREFIX}${encryptString(plaintext).toString('base64')}`;
}

/**
 * Decrypt a payload produced by `encryptString`.
 *
 * Returns `null` for anything that cannot be decrypted with the current key:
 * absent, truncated, tampered, or written with a different key version. A
 * corrupted row must not be able to crash a request, and a failed
 * authentication tag must never be surfaced as plaintext.
 */
export function decryptString(blob: Uint8Array | Buffer | null | undefined): string | null {
  if (!blob) return null;
  try {
    const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
    if (buf.length < 1 + IV_BYTES + TAG_BYTES) return null;
    const keyVersion = buf[0]!;
    if (keyVersion !== KEY_VERSION) return null;
    const iv = buf.subarray(1, 1 + IV_BYTES);
    const authTag = buf.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
    const ciphertext = buf.subarray(1 + IV_BYTES + TAG_BYTES);
    const key = getDataKey();
    const decipher = createDecipheriv(ALG, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** Decrypt a value written by `encryptStringForText`; plaintext legacy rows are rejected. */
export function decryptStringFromText(value: string | null | undefined): string | null {
  if (!value?.startsWith(TEXT_CIPHER_PREFIX)) return null;
  return decryptString(Buffer.from(value.slice(TEXT_CIPHER_PREFIX.length), 'base64'));
}

export function isEncrypted(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array && value.length > 0;
}

// ── Redaction helpers ───────────────────────────────────────────────────────

/** Names / IDs that must never reach logs, analytics or URLs. */
const REDACT_KEYS =
  /(password|passwd|secret|token|authorization|cookie|api[_-]?key|ocr_text|raw_value|full_name|email|phone|address|date_of_birth|dob|ssn|patient_display_ref|notes)/i;

export function redactForLog(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[deep]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.length > 200 ? `${value.slice(0, 200)}…` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redactForLog(v, depth + 1));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT_KEYS.test(k) ? '[redacted]' : redactForLog(v, depth + 1);
    }
    return out;
  }
  return '[unloggable]';
}
