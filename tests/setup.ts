/**
 * Vitest setup.
 *
 * Tests must never read the developer's real .env or touch a real database, so
 * the environment is pinned here to deterministic, obviously-fake values.
 *
 * Next's ambient types (via the generated next-env.d.ts) declare
 * process.env.NODE_ENV as readonly, so assignments go through a mutable view.
 */
const env = process.env as Record<string, string | undefined>;

/**
 * Hard stop, before anything else runs.
 *
 * These tests truncate `users`, `reports`, `consultations` and several other
 * tables in `beforeEach`. They must only ever run against the throwaway PGlite
 * database in .pgdata/test. Now that DATABASE_URL points at a real hosted
 * instance in .env.local, and Vite loads .env files before setup files, a
 * future edit to the line below would silently redirect every one of those
 * deletes at production. Refusing to start is the only safe failure mode.
 */
if ((process.env.DATABASE_URL ?? '').trim() !== '') {
  throw new Error(
    'Refusing to run the test suite with DATABASE_URL set.\n' +
      'These tests delete rows. They are only safe against the local PGlite\n' +
      'database in .pgdata/test.\n\n' +
      'Unset DATABASE_URL for the test run, for example:\n' +
      '  $env:DATABASE_URL=""; npm test\n',
  );
}

env.NODE_ENV = 'test';
env.DATABASE_URL = '';
env.PGLITE_DATA_DIR = '.pgdata/test';
env.MIGRATIONS_DIR = 'src/database/migrations';

// These must match the names `src/lib/env.ts` actually reads, or the modules
// under test silently fall back to development defaults.
env.AUTH_SECRET = 'test-only-auth-secret-not-for-production-use-000';
// 32 bytes, base64url. Required for any encryption at rest to work.
env.DATA_ENCRYPTION_KEY = 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc';
