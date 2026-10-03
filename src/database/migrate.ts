/**
 * Migration runner: forwards-only, one SQL file per version.
 *
 * Deliberately not Kysely's Migrator so the same code path runs identically in
 * `npm run db:migrate`, in production deploys, and inside vitest. The .sql files
 * stay the single source of truth for the schema.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { sql } from 'kysely';
import { getEnv } from '../lib/env';
import type { DB } from './client';

export interface MigrationResult {
  applied: string[];
  alreadyApplied: string[];
}

export async function runMigrations(db: DB, migrationsDir?: string): Promise<MigrationResult> {
  const env = getEnv();
  const dir = resolve(migrationsDir ?? env.migrationsDir);

  await sql`
    CREATE TABLE IF NOT EXISTS schema_meta (
      key   text PRIMARY KEY,
      value text NOT NULL
    )
  `.execute(db);

  const applied = await sql<{ value: string }>`
    SELECT value FROM schema_meta WHERE key = 'applied_migrations'
  `.execute(db);
  const appliedList: string[] = applied.rows[0]?.value
    ? (JSON.parse(applied.rows[0].value) as string[])
    : [];

  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const fresh: string[] = [];

  for (const file of files) {
    if (appliedList.includes(file)) continue;
    const sqlText = await readFile(join(dir, file), 'utf8');

    // Migration files contain DO $$ blocks, CREATE EXTENSION and multiple
    // statements per file, so they cannot go through the extended query
    // protocol that Kysely's executeQuery() uses. Split and run them raw.
    try {
      for (const statement of splitSqlStatements(sqlText)) {
        await sql.raw(statement).execute(db);
      }
    } catch (err) {
      throw new Error(
        `Migration ${file} failed: ${(err as Error).message}\n` +
          `The migration is partially applied. Fix forward with a new migration; never edit an applied one.`,
      );
    }
    fresh.push(file);
  }

  if (fresh.length) {
    const next = [...appliedList, ...fresh];
    await sql`
      INSERT INTO schema_meta (key, value) VALUES ('applied_migrations', ${JSON.stringify(next)})
      ON CONFLICT (key) DO UPDATE SET value = excluded.value
    `.execute(db);
  }

  return { applied: fresh, alreadyApplied: appliedList };
}

/**
 * Split a SQL file into individual statements.
 *
 * Handles the two things that break naive splitting:
 *   1. `$$ ... $$` dollar-quoted bodies (used by our DO blocks)
 *   2. quoted literals containing `;` or `--`
 */
export function splitSqlStatements(input: string): string[] {
  const statements: string[] = [];
  let buf = '';
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarTag: string | null = null;

  while (i < input.length) {
    const ch = input[i]!;
    const next = input[i + 1]!;

    if (inLineComment) {
      buf += ch;
      if (ch === '\n') inLineComment = false;
      i += 1;
      continue;
    }
    if (inBlockComment) {
      buf += ch;
      if (ch === '*' && next === '/') {
        buf += next;
        i += 2;
        inBlockComment = false;
        continue;
      }
      i += 1;
      continue;
    }
    if (dollarTag) {
      if (ch === '$' && input.startsWith(dollarTag, i)) {
        buf += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      buf += ch;
      i += 1;
      continue;
    }
    if (inSingle) {
      buf += ch;
      if (ch === "'") {
        if (next === "'") {
          buf += next;
          i += 2;
          continue;
        }
        inSingle = false;
      }
      i += 1;
      continue;
    }
    if (inDouble) {
      buf += ch;
      if (ch === '"') {
        if (next === '"') {
          buf += next;
          i += 2;
          continue;
        }
        inDouble = false;
      }
      i += 1;
      continue;
    }

    if (ch === '-' && next === '-') {
      inLineComment = true;
      buf += ch;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      buf += ch;
      i += 1;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      buf += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      buf += ch;
      i += 1;
      continue;
    }
    if (ch === '$') {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(input.slice(i));
      if (m) {
        dollarTag = m[0];
        buf += m[0];
        i += m[0].length;
        continue;
      }
    }
    if (ch === ';') {
      const trimmed = buf.trim();
      if (trimmed) statements.push(trimmed);
      buf = '';
      i += 1;
      continue;
    }
    buf += ch;
    i += 1;
  }

  const tail = buf.trim();
  if (tail) statements.push(tail);
  return statements.filter((s) => s.length > 0);
}
