/**
 * `npm run db:check`
 *
 * Read-only. Reports what the app is actually connected to and whether the
 * database is usable, without changing anything.
 *
 * This exists because the first thing you do with a new database is check it,
 * and the tool that would otherwise tell you is `db:migrate`, which *applies
 * schema changes*. Running a migration to find out whether you can reach the
 * host is a bad way to find out, and against a half-finished connection string
 * it will either fail confusingly or, worse, succeed against the wrong
 * database.
 */
import { sql } from 'kysely';

import { getDb, closeDb, activeDialect } from '../src/database/client';

/** Tables the app expects to exist once migrations have been applied. */
const REQUIRED_TABLES = [
  'users',
  'sessions',
  'reports',
  'report_pages',
  'lab_results',
  'symptom_sessions',
  'symptom_answers',
  'consultations',
  'user_consents',
  'rate_limits',
  'audit_logs',
  'schema_meta',
];

async function main(): Promise<void> {
  // The dialect is only set while the connection is being built, so this has to
  // happen before it is read. Asking first always returns null.
  const db = await getDb();
  const dialect = activeDialect();
  console.log(`dialect : ${dialect}`);

  if (dialect === 'pglite') {
    console.log(
      '\nThis is the local embedded database in ./.pgdata.\n' +
        'Nothing is being checked on a hosted instance, because DATABASE_URL is\n' +
        'empty or unread. If you expected a hosted database, check that\n' +
        'DATABASE_URL is set in .env.local and that the script loaded it.',
    );
  }

  const server = await sql<{ version: string; database: string; user: string }>`
    SELECT version() AS version, current_database() AS database, current_user AS "user"
  `.execute(db);
  const info = server.rows[0]!;
  console.log(`\nserver   : ${info.version.split(' on ')[0]}`);
  console.log(`database : ${info.database}`);
  console.log(`user     : ${info.user}`);

  // pgvector backs the retrieval path. A missing extension is not fatal, but
  // worth knowing before the first query that needs it.
  const vector = await sql<{ present: number }>`
    SELECT count(*)::int AS present FROM pg_extension WHERE extname = 'vector'
  `.execute(db);
  console.log(`pgvector : ${vector.rows[0]!.present ? 'installed' : 'NOT INSTALLED'}`);

  const tables = await sql<{ table_name: string }>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `.execute(db);
  const present = new Set(tables.rows.map((r) => r.table_name));
  const missing = REQUIRED_TABLES.filter((t) => !present.has(t));
  console.log(`tables   : ${present.size} present`);

  if (missing.length) {
    console.log(`\nmissing  : ${missing.join(', ')}`);
    console.log('Run `npm run db:migrate` to create them.');
  } else {
    console.log('all required tables are present.');

    const applied = await sql<{ value: string }>`
      SELECT value FROM schema_meta WHERE key = 'applied_migrations'
    `.execute(db);
    const files: string[] = applied.rows[0] ? JSON.parse(applied.rows[0].value) : [];
    console.log(`\napplied migrations (${files.length}):`);
    for (const f of files) console.log(`  ${f}`);
  }
}

main()
  .then(closeDb)
  .catch(async (err) => {
    console.error('\nCould not reach the database.\n');
    // The message from a driver can contain the connection string, which holds
    // the password, so it is reduced to its shape rather than printed raw.
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  ${message.replace(/:\/\/[^@]*@/, '://***:***@')}`);
    console.error('\nCheck:');
    console.error('  - DATABASE_URL is set in .env.local, with a real password');
    console.error('  - the password is not the literal text [YOUR-PASSWORD]');
    console.error('  - there is no trailing backslash or whitespace on the line');
    console.error('  - your network allows outbound port 5432');
    await closeDb();
    process.exitCode = 1;
  });
