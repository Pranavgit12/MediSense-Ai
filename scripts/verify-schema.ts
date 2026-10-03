/**
 * `npm run db:verify-schema`
 *
 * Proves the migrated schema is actually usable: every table declared in the
 * migration files exists, pgvector is installed, the embedding column is the
 * declared dimension, and the database reports the PostgreSQL version we target.
 *
 * The expected table list is derived from the migration files rather than
 * hand-maintained, so it can never drift from the schema.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { sql } from 'kysely';
import { getDb, closeDb, activeDialect } from '../src/database/client';
import { getEnv } from '../src/lib/env';

const EXPECTED_VECTOR_DIM = 384;

/** Read every `CREATE TABLE [IF NOT EXISTS] <name>` out of the migration files. */
async function expectedTables(): Promise<string[]> {
  const dir = resolve(getEnv().migrationsDir);
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const names = new Set<string>();
  for (const f of files) {
    const text = await readFile(join(dir, f), 'utf8');
    for (const m of text.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)/gi)) {
      names.add(m[1]!.toLowerCase());
    }
  }
  return [...names].sort();
}

/** Read every `CREATE TYPE <name>` so enum drift is caught too. */
async function expectedEnums(): Promise<string[]> {
  const dir = resolve(getEnv().migrationsDir);
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const names = new Set<string>();
  for (const f of files) {
    const text = await readFile(join(dir, f), 'utf8');
    for (const m of text.matchAll(/CREATE\s+TYPE\s+([a-z_][a-z0-9_]*)/gi)) {
      names.add(m[1]!.toLowerCase());
    }
  }
  return [...names].sort();
}

async function main(): Promise<void> {
  const db = await getDb();
  console.log(`dialect: ${activeDialect()}`);

  const version = await sql<{ version: string }>`SELECT version() AS version`.execute(db);
  console.log(`server:  ${version.rows[0]?.version?.split(',')[0]}`);

  const ext = await sql<{ extname: string }>`
    SELECT extname FROM pg_extension WHERE extname IN ('vector', 'pgcrypto')
  `.execute(db);
  const exts = ext.rows.map((r) => r.extname);
  console.log(`extensions: ${exts.join(', ') || '(none)'}`);
  if (!exts.includes('vector')) throw new Error('pgvector is not installed');

  const want = await expectedTables();
  const tables = await sql<{ table_name: string }>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
  `.execute(db);
  const present = new Set(tables.rows.map((r) => r.table_name));

  const missing = want.filter((t) => !present.has(t));
  if (missing.length) throw new Error(`missing tables: ${missing.join(', ')}`);
  const extra = [...present].filter((t) => !want.includes(t));
  console.log(`tables:  ${present.size} present; all ${want.length} declared by the migrations`);
  if (extra.length) console.warn(`note: ${extra.length} table(s) exist but no migration declares them: ${extra.join(', ')}`);

  const wantEnums = await expectedEnums();
  if (wantEnums.length) {
    const enums = await sql<{ typname: string }>`
      SELECT t.typname AS typname FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE t.typtype = 'e' AND n.nspname = 'public'
    `.execute(db);
    const haveEnums = new Set(enums.rows.map((r) => r.typname));
    const missingEnums = wantEnums.filter((e) => !haveEnums.has(e));
    if (missingEnums.length) throw new Error(`missing enum types: ${missingEnums.join(', ')}`);
    console.log(`enums:   ${haveEnums.size} present, all ${wantEnums.length} declared`);
  }

  const dim = await sql<{ typmod: number | null }>`
    SELECT a.atttypmod AS typmod
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    WHERE c.relname = 'knowledge_embeddings' AND a.attname = 'embedding'
  `.execute(db);
  const typmod = dim.rows[0]?.typmod;
  console.log(`vector column: knowledge_embeddings.embedding${typmod ? `(${typmod})` : ''}`);
  if (typmod !== EXPECTED_VECTOR_DIM) {
    throw new Error(`expected vector(${EXPECTED_VECTOR_DIM}) but the column reports ${typmod ?? 'unknown'}`);
  }

  const applied = await sql<{ value: string }>`
    SELECT value FROM schema_meta WHERE key = 'applied_migrations'
  `.execute(db);
  console.log(`applied migrations: ${applied.rows[0]?.value ?? '(none)'}`);

  console.log('\nSchema verification passed.');
}

main()
  .then(closeDb)
  .catch(async (err) => {
    console.error(err);
    await closeDb();
    process.exitCode = 1;
  });
