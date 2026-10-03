/**
 * `npm run db:migrate`
 *
 * Applies every unapplied SQL file in src/database/migrations, in filename
 * order, and records what ran in schema_meta.
 */
import { getDb, closeDb, activeDialect } from '../src/database/client';
import { runMigrations } from '../src/database/migrate';

async function main(): Promise<void> {
  const db = await getDb();
  console.log(`dialect: ${activeDialect()}`);

  const { applied, alreadyApplied } = await runMigrations(db);

  if (alreadyApplied.length) {
    console.log(`already applied: ${alreadyApplied.join(', ')}`);
  }
  if (!applied.length) {
    console.log('nothing to do; schema is up to date.');
    return;
  }
  for (const f of applied) console.log(`applied: ${f}`);
  console.log(`\n${applied.length} migration(s) applied.`);
}

main()
  .then(closeDb)
  .catch(async (err) => {
    console.error(err);
    await closeDb();
    process.exitCode = 1;
  });
