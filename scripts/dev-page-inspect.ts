/** Dev-only: list tables actually created by the migration. */
import { sql } from 'kysely';
import { getDb, closeDb } from '../src/database/client';

async function main() {
  const db = await getDb();
  const rows = await sql<{ table_name: string }>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name
  `.execute(db);
  console.log(rows.rows.map((r) => r.table_name).join('\n'));
}
main().then(closeDb);
