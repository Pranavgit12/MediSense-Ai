/**
 * Pool sizing on a serverless host.
 *
 * This is the failure that made the deployed app return 500 on every page while
 * the landing page kept working. Each warm Vercel function is a separate process
 * with its own connection pool, so `max: 10` means ten connections per instance
 * rather than ten for the deployment. A managed Postgres has a hard connection
 * limit, a handful of concurrent instances exhaust it, and every route that runs
 * SQL fails with "too many clients already" — while statically prerendered pages,
 * which never open a connection, are unaffected. That asymmetry is what made it
 * look like a single broken page rather than an outage.
 *
 * The bug was invisible locally and while sign-in still existed: an anonymous
 * visitor was redirected to /login before any query ran, so nothing ever opened a
 * pool until after a session existed.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { poolSize } from '../src/database/client';
import { getEnv, resetEnvCache } from '../src/lib/env';

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
  resetEnvCache();
});

describe('pool size', () => {
  it('opens a single connection per instance on a serverless host', () => {
    expect(poolSize(getEnv(), true)).toBe(1);
  });

  it('keeps headroom on a long-lived server', () => {
    expect(poolSize(getEnv(), false)).toBe(10);
  });

  it('lets an explicit setting win over the host default', () => {
    // A provider with connection headroom to spare, or a server that really is
    // the only process talking to the database.
    process.env.DATABASE_POOL_MAX = '25';
    resetEnvCache();
    expect(poolSize(getEnv(), true)).toBe(25);
    expect(poolSize(getEnv(), false)).toBe(25);
  });

  it('falls back to the host default when the setting is absent', () => {
    delete process.env.DATABASE_POOL_MAX;
    resetEnvCache();
    expect(getEnv().databasePoolMax).toBeNull();
    expect(poolSize(getEnv(), true)).toBe(1);
  });

  it('recognises the hosts that scale horizontally', () => {
    delete process.env.DATABASE_POOL_MAX;
    for (const marker of ['VERCEL', 'AWS_LAMBDA_FUNCTION_NAME', 'NETLIFY']) {
      resetEnvCache();
      const before = process.env[marker];
      process.env[marker] = '1';
      resetEnvCache();
      // One argument, so the host is detected from the environment rather than
      // passed in. This is the path the running server actually takes.
      expect(poolSize(getEnv()), `${marker} should be treated as serverless`).toBe(1);
      if (before === undefined) delete process.env[marker];
      else process.env[marker] = before;
    }
  });

  it('treats a plain server as not serverless', () => {
    delete process.env.DATABASE_POOL_MAX;
    resetEnvCache();
    for (const marker of ['VERCEL', 'AWS_LAMBDA_FUNCTION_NAME', 'NETLIFY']) {
      delete process.env[marker];
    }
    resetEnvCache();
    expect(poolSize(getEnv())).toBe(10);
  });
});
