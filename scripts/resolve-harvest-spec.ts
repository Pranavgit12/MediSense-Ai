/**
 * Resolves and PINS the MedlinePlus URL for every topic in the harvest spec.
 *
 * Workflow (deliberately two steps, with a human in the middle):
 *   1. `npx tsx scripts/resolve-harvest-spec.ts --write` queries the NLM web
 *      service for every topic and rewrites `expectedUrl` to the URL the
 *      service actually returned.
 *   2. A reviewer reads the printed diff and commits the change.
 *
 * After that, `harvest-corpus.ts` asserts that the expected URL is still what
 * the service returns, so a future upstream move is caught instead of silently
 * swapping the source under a citation.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { searchHealthTopics } from '../src/medical/nlm';
import type { HarvestSpec } from '../src/data/harvest-spec';

const SPEC_SOURCE = resolve('./src/data/harvest-spec.ts');
const SPEC_JSON = join(resolve('./data/generated'), 'harvest-spec.json');

const write = process.argv.includes('--write');
const BATCH = Number(process.env.HNS_BATCH ?? 4);

async function main(): Promise<void> {
  const specs: HarvestSpec[] = JSON.parse(await readFile(SPEC_JSON, 'utf8'));

  const resolved = new Map<string, { url: string; title: string }>();
  let cursor = 0;
  const workers = Array.from({ length: Math.min(BATCH, specs.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= specs.length) return;
      const spec = specs[i]!;
      try {
        const res = await searchHealthTopics(spec.query, { retmax: 5 });
        const doc = res.documents[0];
        if (doc) resolved.set(spec.slug, { url: doc.url, title: doc.title });
        else console.error(`  x ${spec.slug}: no results for "${spec.query}"`);
      } catch (err) {
        console.error(`  x ${spec.slug}: ${(err as Error).message}`);
      }
    }
  });
  await Promise.all(workers);

  const changes: { slug: string; from: string | null; to: string }[] = [];
  const unchanged: { slug: string; url: string }[] = [];
  for (const spec of specs) {
    const r = resolved.get(spec.slug);
    if (!r) continue;
    if (spec.expectedUrl === r.url) unchanged.push({ slug: spec.slug, url: r.url });
    else changes.push({ slug: spec.slug, from: spec.expectedUrl, to: r.url });
  }

  console.log(`\n--- ${changes.length} URL(s) to review, ${unchanged.length} already correct ---\n`);
  for (const c of changes) {
    console.log(`${c.slug}`);
    console.log(`  - ${c.from ?? '(none)'}`);
    console.log(`  + ${c.to}`);
  }

  if (!write) {
    console.log('\nDry run. Re-run with --write to pin these URLs into src/data/harvest-spec.ts');
    return;
  }

  for (const spec of specs) {
    const r = resolved.get(spec.slug);
    if (r) spec.expectedUrl = r.url;
  }

  // Rewrite only the expectedUrl literals so the diff stays reviewable.
  let source = await readFile(SPEC_SOURCE, 'utf8');
  for (const spec of specs) {
    const r = resolved.get(spec.slug);
    if (!r) continue;
    const blockRe = new RegExp(
      `(slug: '${spec.slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}',[\\s\\S]{0,400}?expectedUrl: )'[^']*'`,
    );
    source = source.replace(blockRe, `$1'${r.url}'`);
  }
  await writeFile(SPEC_SOURCE, source, 'utf8');
  await writeFile(SPEC_JSON, JSON.stringify(specs, null, 2), 'utf8');

  console.log(`\nPinned ${changes.length} URL(s) into src/data/harvest-spec.ts and data/generated/harvest-spec.json`);
  console.log('Review the diff, then re-run `npm run db:verify` to confirm every citation is live.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
