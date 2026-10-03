/**
 * A real Kysely dialect for PGlite.
 *
 * Why this exists: `PostgresDialect` speaks the `pg` Pool protocol and calls
 * `pool.connect()` to obtain a connection. PGlite is an embedded single-connection
 * engine whose `query()` returns a promise directly and has no `connect()`. Passing
 * PGlite to `PostgresDialect` therefore fails at the first query, so PGlite needs a
 * purpose-built dialect.
 *
 * PGlite is PostgreSQL 16.4 compiled to WASM, so reusing Kysely's Postgres
 * compiler/adapter/introspector is correct; only the driver differs.
 */
import {
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type DatabaseConnection,
  type DatabaseIntrospector,
  type Dialect,
  type Driver,
  type Kysely,
  type QueryResult,
  type TransactionSettings,
} from 'kysely';

/** The subset of the PGlite API this dialect relies on. */
export interface PGliteLike {
  query<TRow = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: TRow[]; affectedRows?: number }>;
  exec(query: string): Promise<unknown>;
  close(): Promise<void>;
  waitReady: Promise<void>;
}

class PGliteConnection implements DatabaseConnection {
  readonly #pglite: PGliteLike;
  /** Depth of open transactions, so nested Kysely `transaction()` calls work. */
  #txDepth = 0;

  constructor(pglite: PGliteLike) {
    this.#pglite = pglite;
  }

  async executeQuery<R>(compiledQuery: {
    sql: string;
    parameters: readonly unknown[];
    query?: unknown;
  }): Promise<QueryResult<R>> {
    const params = [...compiledQuery.parameters] as unknown[];
    const res = await this.#pglite.query<Record<string, unknown>>(compiledQuery.sql, params);
    const affected = BigInt(res.affectedRows ?? 0);
    return {
      rows: res.rows as R[],
      numAffectedRows: affected,
      numChangedRows: affected,
      // PGlite returns a result set in full; there is no separate result object.
      ...({} as Record<string, never>),
    };
  }

  /**
   * PGlite has no streaming protocol. Returning an empty async iterator is
   * preferable to throwing, so callers that probe for stream support degrade
   * gracefully instead of crashing.
   */
  streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    const empty: AsyncIterableIterator<QueryResult<R>> = {
      next: () => Promise.resolve({ done: true, value: undefined as never }),
      [Symbol.asyncIterator]() {
        return this;
      },
    };
    return empty;
  }

  async beginTransaction(): Promise<void> {
    // PGlite runs on a single connection, so a nested BEGIN would fail. Guard it.
    this.#txDepth += 1;
    if (this.#txDepth === 1) await this.#pglite.exec('BEGIN');
  }

  async commitTransaction(): Promise<void> {
    if (this.#txDepth === 0) throw new Error('commitTransaction without beginTransaction');
    this.#txDepth -= 1;
    if (this.#txDepth === 0) await this.#pglite.exec('COMMIT');
  }

  async rollbackTransaction(): Promise<void> {
    if (this.#txDepth === 0) throw new Error('rollbackTransaction without beginTransaction');
    this.#txDepth = 0;
    await this.#pglite.exec('ROLLBACK');
  }
}

class PGliteDriver implements Driver {
  readonly #pglite: PGliteLike;
  #connection: PGliteConnection | null = null;

  constructor(pglite: PGliteLike) {
    this.#pglite = pglite;
  }

  async init(): Promise<void> {
    await this.#pglite.waitReady;
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    this.#connection ??= new PGliteConnection(this.#pglite);
    return this.#connection;
  }

  async beginTransaction(
    connection: DatabaseConnection,
    _settings: TransactionSettings,
  ): Promise<void> {
    await (connection as PGliteConnection).beginTransaction();
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    await (connection as PGliteConnection).commitTransaction();
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    await (connection as PGliteConnection).rollbackTransaction();
  }

  async releaseConnection(): Promise<void> {
    // PGlite owns its single connection; there is no pool to release into.
  }

  async destroy(): Promise<void> {
    await this.#pglite.close();
  }
}

export class PGliteDialect implements Dialect {
  readonly #pglite: PGliteLike;

  constructor(pglite: PGliteLike) {
    this.#pglite = pglite;
  }

  createDriver(): Driver {
    return new PGliteDriver(this.#pglite);
  }

  createQueryCompiler(): PostgresQueryCompiler {
    return new PostgresQueryCompiler();
  }

  createAdapter(): PostgresAdapter {
    return new PostgresAdapter();
  }

  createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
    return new PostgresIntrospector(db);
  }
}
