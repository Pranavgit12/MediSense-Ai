import { Kysely, PostgresDialect } from 'kysely';
import type { Database } from './schema';
import { assertProductionSafety, getEnv } from '../lib/env';
import { PGliteDialect, type PGliteLike } from './pglite-dialect';

export type DB = Kysely<Database>;

/**
 * The connection is cached on `globalThis`, not in a module-level variable.
 *
 * Next.js bundles each server entry point (page render, server action, route
 * handler) separately, and in development each bundle gets its own module
 * registry. A module-level cache would therefore build one PGlite instance per
 * bundle, and because PGlite allows a single writer per data directory the
 * second instance aborts the process, turning every server action into a 500.
 * One global slot means every bundle in the process shares one connection.
 */
interface DbGlobal {
  __medisenseDb?: Promise<DB>;
  __medisenseDialect?: 'pglite' | 'postgres' | null;
}

const store = globalThis as typeof globalThis & DbGlobal;

/**
 * Decide whether to require TLS for a Postgres connection.
 *
 * Previously this was `isProd`, which meant a hosted database was contacted in
 * plaintext whenever the app ran locally. That is wrong for a service holding
 * health records, and it is also simply broken against the common free hosts:
 * Supabase, Neon and RDS all refuse an unencrypted connection, so pointing
 * DATABASE_URL at a managed instance during development would fail outright
 * rather than being a local-only concern.
 *
 * The rule is that any host which is not plainly local gets TLS. Local PGlite
 * has no socket at all, so this only comes into play once a real URL is set.
 * Certificate validation is left off because the managed hosts present
 * certificates that node-postgres cannot verify without the provider's CA root
 * bundle; the connection is still encrypted, which is what prevents a readable
 * connection.
 *
 * Exported for testing. The alternative is a live connection attempt, which
 * cannot assert anything about the *rejected* cases without a server that
 * refuses plaintext.
 */
export function resolveSsl(databaseUrl: string): boolean | object {
  const encrypted = { rejectUnauthorized: false } as const;

  let host: string;
  try {
    host = new URL(databaseUrl).hostname.toLowerCase();
  } catch {
    // An unparseable URL says nothing about where it points, so it gets the
    // encrypted default. Failing closed means the worst outcome is a connection
    // that will not open, never one that opens in the clear.
    return encrypted;
  }
  if (!host) return encrypted;

  const isLocal =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '[::1]' ||
    host === 'host.docker.internal' ||
    host.endsWith('.local') ||
    // A hostname with no dot in it can only be resolved by a local search
    // domain: Docker's embedded DNS, an /etc/hosts entry, or a corporate
    // resolver. There is no such thing as a public single-label DNS name, so
    // this is the case that covers a Compose service simply called `db`, which
    // is otherwise the most common way to run Postgres locally.
    !host.includes('.');

  return isLocal ? false : encrypted;
}

/**
 * Whether this process is one of many short-lived instances rather than a single
 * long-lived server.
 *
 * The distinction decides how large a connection pool may safely be. On Vercel,
 * Netlify or Lambda every warm function instance is a separate process with its
 * own pool, and the platform scales them horizontally without limit. A pool of 10
 * is then 10 connections *per instance*: a handful of concurrent requests spread
 * across instances exhausts a managed database's connection limit, and every route
 * that touches the database starts failing with "too many clients" while
 * statically prerendered pages keep serving. That asymmetry is what makes it look
 * like one broken page rather than an outage.
 */
function isServerlessHost(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.NETLIFY ||
      process.env.FUNCTIONS_WORKER_RUNTIME,
  );
}

/**
 * Connections to open per process.
 *
 * One on a serverless host, because the platform owns the concurrency and the
 * database does not. Ten on a normal server, which is a deliberate cap on how many
 * queries a single box can have in flight. Override with DATABASE_POOL_MAX when
 * the managed database has headroom to spare.
 *
 * Exported for testing. Asserting this needs no database, whereas the alternative
 * is standing up a serverless host to watch a pool exhaust itself.
 */
export function poolSize(env: ReturnType<typeof getEnv>, isServerless = isServerlessHost()): number {
  if (env.databasePoolMax !== null) return env.databasePoolMax;
  return isServerless ? 1 : 10;
}

async function createDb(): Promise<DB> {
  const env = getEnv();
  assertProductionSafety(env);

  if (env.databaseUrl) {
    store.__medisenseDialect = 'postgres';
    const pg = await import('pg');
    const pool = new pg.Pool({
      connectionString: env.databaseUrl,
      max: poolSize(env),
      ssl: resolveSsl(env.databaseUrl),
      statement_timeout: 20_000,
      // Fail fast rather than hanging until the platform's own timeout, so a
      // saturated database surfaces as an error we can name rather than a request
      // that hangs until it is killed from outside.
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 10_000,
    });
    // Never log the connection string: it carries credentials.
    pool.on('error', () => undefined);
    return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  }

  store.__medisenseDialect = 'pglite';
  const { PGlite } = await import('@electric-sql/pglite');
  const { vector } = await import('@electric-sql/pglite/vector');
  const pglite = (await PGlite.create({
    dataDir: env.pgliteDataDir,
    extensions: { vector },
  })) as unknown as PGliteLike;

  return new Kysely<Database>({ dialect: new PGliteDialect(pglite) });
}

export function getDb(): Promise<DB> {
  if (!store.__medisenseDb) {
    const pending = createDb();
    store.__medisenseDb = pending;
    // Never cache a failed start-up. Otherwise one transient failure (a stale
    // PGlite lock, for example) makes every later request fail with no retry.
    void pending.catch(() => {
      if (store.__medisenseDb === pending) {
        store.__medisenseDb = undefined;
        store.__medisenseDialect = null;
      }
    });
  }
  return store.__medisenseDb;
}

export function activeDialect(): 'pglite' | 'postgres' | null {
  return store.__medisenseDialect ?? null;
}

export async function closeDb(): Promise<void> {
  if (!store.__medisenseDb) return;
  const pending = store.__medisenseDb;
  store.__medisenseDb = undefined;
  store.__medisenseDialect = null;
  await (await pending).destroy();
}

/**
 * Whether an error is a unique-constraint violation.
 *
 * PostgreSQL reports this as SQLSTATE 23505, and PGlite surfaces the same code.
 * Callers that must treat "someone else inserted this row first" as an ordinary
 * outcome need this to tell that apart from a genuine fault: the insert throws,
 * it does not return an empty result, so an `if (!inserted)` check alone would
 * never run and the race would reach the user as an error.
 */
export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { code?: unknown; cause?: { code?: unknown } };
  return candidate.code === '23505' || candidate.cause?.code === '23505';
}
