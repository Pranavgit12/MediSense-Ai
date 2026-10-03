/**
 * `npm run db:reset`
 *
 * DESTRUCTIVE. Drops the schema and rebuilds it from the migrations, then seeds
 * the curated knowledge base. Any reports, answers, and accounts in the target
 * database are lost, so a confirmation flag is required.
 *
 *   npm run db:reset -- --yes
 *
 * PGlite and PostgreSQL are both handled: the schema is dropped rather than the
 * data directory, so the same code path works in development and in CI.
 */
import { getDb, closeDb, activeDialect } from '../src/database/client';
import { runMigrations } from '../src/database/migrate';
import { sql } from 'kysely';
import { spawnSync } from 'node:child_process';

const confirmed = process.argv.includes('--yes') || process.env.CONFIRM_RESET === 'yes';

async function main(): Promise<void> {
  await getDb();
  const dialect = activeDialect();
  const db = await getDb();

  if (!confirmed) {
    console.error(
      [
        '',
        'This deletes ALL data in the current database and rebuilds it.',
        `  dialect : ${dialect ?? 'unknown'}`,
        '',
        'Re-run with:  npm run db:reset -- --yes',
        '',
      ].join('\n'),
    );
    process.exitCode = 1;
    return;
  }

  console.log(`dropping schema (${activeDialect()}) ...`);
  await db.transaction().execute(async (trx) => {
    await sql`DROP SCHEMA IF EXISTS public CASCADE`.execute(trx);
    await sql`CREATE SCHEMA public`.execute(trx);
  });
  console.log('schema dropped.');

  // The connection caches prepared statements against the old schema.
  await closeDb();

  const { applied } = await runMigrations(await getDb());
  console.log(`applied ${applied.length} migration(s).`);

  // Seed in a child process so the rebuilt connection is used cleanly.
  const seed = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/seed.ts'], {
    stdio: 'inherit',
    env: process.env,
  });
  if (seed.status !== 0) {
    throw new Error(`seed failed with status ${String(seed.status)}`);
  }
}

main()
  .then(closeDb)
  .catch(async (err) => {
    console.error(err);
    await closeDb();
    process.exitCode = 1;
  });
