/**
 * TLS decision for Postgres connections.
 *
 * This is a security control, so the cases that matter are the ones where
 * getting it wrong leaks a connection carrying health data: a managed host
 * reached in plaintext, or an unparseable URL silently treated as local.
 */
import { describe, expect, it } from 'vitest';

import { resolveSsl } from '../src/database/client';

/** The encrypted default, which also means "do not verify the provider's chain". */
function isEncrypted(result: boolean | object): boolean {
  return typeof result === 'object' && (result as { rejectUnauthorized?: boolean }).rejectUnauthorized === false;
}

describe('resolveSsl', () => {
  it('encrypts every hosted database, even in development', () => {
    // These are the free hosts this app is expected to be pointed at. All of
    // them refuse a plaintext connection, and none of them should ever be
    // reached in the clear just because someone is running locally.
    for (const url of [
      'postgresql://user:pw@db.xyzproject.supabase.co:5432/postgres',
      'postgresql://user:pw@ep-cool-name.us-east-2.aws.neon.tech/postgres',
      'postgresql://user:pw@myinstance.rds.amazonaws.com:5432/medisense',
      'postgresql://user:pw@reports.example.com:5432/medisense',
    ]) {
      expect(isEncrypted(resolveSsl(url))).toBe(true);
    }
  });

  it('does not require TLS for a genuinely local server', () => {
    // A developer container or a local Postgres has no certificate to present,
    // and demanding one would break local development for no security gain:
    // the bytes never leave the machine.
    for (const url of [
      'postgresql://postgres:postgres@localhost:5432/postgres',
      'postgresql://postgres:postgres@127.0.0.1:5432/postgres',
      'postgresql://postgres:postgres@db:5432/postgres',
      'postgresql://postgres:postgres@host.docker.internal:5432/postgres',
    ]) {
      expect(resolveSsl(url)).toBe(false);
    }
  });

  it('fails safe on a URL it cannot parse', () => {
    // Anything unrecognised is treated as remote and encrypted. The failure mode
    // is a connection that will not open, not one that opens in the clear.
    expect(isEncrypted(resolveSsl('not-a-url'))).toBe(true);
    expect(isEncrypted(resolveSsl(''))).toBe(true);
  });

  it('does not mistake a lookalike host for a local one', () => {
    // A subdomain of a local-looking name, or a host that merely contains
    // "localhost", is still remote.
    for (const url of [
      'postgresql://user:pw@localhost.evil.example.com:5432/db',
      'postgresql://user:pw@evil-localhost.example.com:5432/db',
    ]) {
      expect(isEncrypted(resolveSsl(url))).toBe(true);
    }
  });
});
