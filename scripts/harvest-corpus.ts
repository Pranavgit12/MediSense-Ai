/**
 * Stage: ingest the medical knowledge corpus from MedlinePlus.
 *
 * Two ingestion paths, both licence-gated and both title-guarded:
 *
 *   A. `searchHealthTopics()`  - the NLM web service (documented public API).
 *      Used for topic pages that the healthTopics database indexes.
 *
 *   B. `fetchPinnedPage()`     - direct GET of a pinned, reviewed URL.
 *      Used for /lab-tests/ pages, which the healthTopics database does not
 *      index. Only medlineplus.gov over HTTPS is permitted, and the page title
 *      must match the reviewed keyword set.
 *
 * Design guarantees:
 *   - Nothing is written unless its licence allows redistribution.
 *   - A URL mismatch or title mismatch is a hard failure, never a silent swap.
 *   - A failed fetch is recorded as failed and is NOT written to the corpus, so
 *     a later run cannot promote a half-empty page into the knowledge base.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { isLicensedMedlinePlusUrl, searchHealthTopics } from '../src/medical/nlm';
import { fetchPinnedPage, pinnedTitleMatches } from '../src/medical/medlineplus-page';
import { intakeDecision } from '../src/data/source-registry';
import type { HarvestSpec } from '../src/data/harvest-spec';
import { PUBLISHER_LICENSES, titleMatches } from '../src/data/harvest-spec';

const OUT_DIR = resolve('./data/generated');
const SPEC_PATH = join(OUT_DIR, 'harvest-spec.json');
const CORPUS_PATH = join(OUT_DIR, 'medical-corpus.json');

const CONCURRENCY = 4;
const RETRY_DELAYS_MS = [0, 1500, 4000];
/** Minimum characters of real prose before we accept a page. */
const MIN_TEXT = 200;

export interface CorpusSource {
  slug: string;
  title: string;
  publisher: string;
  url: string;
  license: string;
  authorityNote: string;
  lastReviewed: string;
  harvestedAt: string;
  ingestedVia: 'nlm_web_service' | 'pinned_page_fetch';
  httpStatus: number;
}

export interface CorpusEntry {
  slug: string;
  conceptName: string;
  category: string;
  role: string;
  sourceSlug: string;
  title: string;
  url: string;
  publisher: string;
  license: string;
  authorityNote: string;
  lastReviewed: string;
  harvestedAt: string;
  ingestedVia: 'nlm_web_service' | 'pinned_page_fetch';
  organizationName: string;
  mesh: string;
  groupNames: string[];
  summary: string;
  sections: { heading: string; body: string }[];
  related: { title: string; url: string; summary: string }[];
}

const today = () => new Date().toISOString().slice(0, 10);

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z(])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 25);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return out;
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastErr: unknown;
  for (const delay of RETRY_DELAYS_MS) {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`${label}: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}

/** Drop MedlinePlus's own navigation furniture that survives the strip pass. */
const NOISE = [
  /Jump to the content/i,
  /Main content/i,
  /^\s*Sections?\s*$/i,
  /Current [^:]*:\s*$/i,
  /Last Updated:?/i,
  /URL of this page:?/i,
  /^\s*Print\s*$/i,
  /^\s*Share\s*$/i,
  /Topics in the News/i,
  /National Library of Medicine$/i,
];

function cleanProse(text: string): string {
  return text
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (!t) return false;
      return !NOISE.some((re) => re.test(t));
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

type Success = { ok: true; entry: CorpusEntry };
type Failure = { ok: false; slug: string; reason: string };

export async function harvest(): Promise<{ ok: number; failed: { slug: string; reason: string }[] }> {
  const specs = JSON.parse(await readFile(SPEC_PATH, 'utf8')) as HarvestSpec[];
  const publisher = PUBLISHER_LICENSES[0]!;
  const harvestedAt = new Date().toISOString();

  const results = await mapWithConcurrency<HarvestSpec, Success | Failure>(specs, CONCURRENCY, async (spec) => {
    const fail = (reason: string): Failure => ({ ok: false, slug: spec.slug, reason });

    if (!isLicensedMedlinePlusUrl(spec.expectedUrl)) {
      return fail(`pinned URL host is not an NLM host: ${spec.expectedUrl}`);
    }

    const decision = intakeDecision(publisher.slug, spec.expectedUrl);
    if (decision.action === 'reject') return fail(`licence gate rejected the source: ${decision.reason}`);
    if (decision.action === 'cite_only') {
      return fail(`licence allows citation only, not text ingestion: ${decision.reason}`);
    }

    let entry: CorpusEntry | null = null;

    // ── Path A: NLM web service (structured, preferred) ────────────────────
    try {
      const res = await withRetry(() => searchHealthTopics(spec.query, { retmax: 8 }), `search "${spec.query}"`);
      const doc = res.documents.find((d) => d.url === spec.expectedUrl);
      if (doc) {
        if (!titleMatches(spec, doc.title)) {
          return fail(
            `title guard failed for ${spec.expectedUrl}: service title "${doc.title}" contains none of [${spec.titleKeywords.join(', ')}]`,
          );
        }
        if (doc.fullSummary.length < MIN_TEXT) {
          return fail(`service summary too short (${doc.fullSummary.length} chars) for ${spec.expectedUrl}`);
        }
        entry = {
          slug: spec.slug,
          conceptName: spec.conceptName,
          category: spec.category,
          role: spec.role,
          sourceSlug: publisher.slug,
          title: doc.title,
          url: doc.url,
          publisher: publisher.publisher,
          license: publisher.license,
          authorityNote: publisher.authorityNote,
          lastReviewed: today(),
          harvestedAt,
          ingestedVia: 'nlm_web_service',
          organizationName: doc.organizationName,
          mesh: doc.mesh,
          groupNames: doc.groupNames,
          summary: cleanProse(doc.fullSummary),
          sections: splitSentences(doc.fullSummary).map((body, i) => ({ heading: `Summary ${i + 1}`, body })),
          related: [],
        };
      }
    } catch (err) {
      // Fall through to the pinned-page path.
      if (process.env.HNS_DEBUG) console.warn(`  ~ ${spec.slug}: search path unavailable (${(err as Error).message})`);
    }

    // ── Path B: pinned page fetch (for pages the search DB does not index) ──
    if (!entry) {
      const page = await withRetry(() => fetchPinnedPage(spec.expectedUrl), `fetch ${spec.expectedUrl}`).catch(
        () => null,
      );
      if (!page) {
        return fail(`could not fetch pinned URL ${spec.expectedUrl} (search path did not supply it either)`);
      }
      if (!pinnedTitleMatches(page.url, page.title, spec.titleKeywords)) {
        return fail(
          `title guard failed for ${page.url}: page title "${page.title}" contains none of [${spec.titleKeywords.join(', ')}]`,
        );
      }
      const text = cleanProse(page.text);
      if (text.length < MIN_TEXT) {
        return fail(`extracted text too short (${text.length} chars) from ${page.url}`);
      }
      entry = {
        slug: spec.slug,
        conceptName: spec.conceptName,
        category: spec.category,
        role: spec.role,
        sourceSlug: publisher.slug,
        title: page.title || page.h1,
        url: page.url,
        publisher: publisher.publisher,
        license: publisher.license,
        authorityNote: publisher.authorityNote,
        lastReviewed: today(),
        harvestedAt,
        ingestedVia: 'pinned_page_fetch',
        organizationName: 'U.S. National Library of Medicine',
        mesh: '',
        groupNames: [],
        summary: text,
        sections: page.sections.length
          ? page.sections.map((s) => ({ heading: s.heading, body: s.body }))
          : splitSentences(text).map((body, i) => ({ heading: `Section ${i + 1}`, body })),
        related: [],
      };
    }

    // Related enrichment: additional citations for the same concept.
    const related: CorpusEntry['related'] = [];
    for (const q of spec.relatedQueries ?? []) {
      try {
        const r = await withRetry(() => searchHealthTopics(q, { retmax: 3 }), `related "${q}"`);
        for (const d of r.documents) {
          if (d.url === entry.url || !d.fullSummary) continue;
          if (!d.fullSummary.includes('MedlinePlus')) continue;
          related.push({ title: d.title, url: d.url, summary: d.fullSummary });
          if (related.length >= 2) break;
        }
      } catch {
        // Best-effort; the primary citation stands alone.
      }
      if (related.length >= 2) break;
    }
    entry.related = related;

    return { ok: true, entry };
  });

  const entries: CorpusEntry[] = [];
  const failed: { slug: string; reason: string }[] = [];
  for (const r of results) {
    if (r.ok) entries.push(r.entry);
    else {
      failed.push({ slug: r.slug, reason: r.reason });
      console.error(`  x ${r.slug}: ${r.reason}`);
    }
  }

  entries.sort((a, b) => a.slug.localeCompare(b.slug));
  const corpus = {
    generatedAt: harvestedAt,
    publisher: {
      slug: publisher.slug,
      publisher: publisher.publisher,
      license: publisher.license,
      licensed: publisher.licensed,
      redistribution_allowed: publisher.redistribution_allowed,
      authorityNote: publisher.authorityNote,
    },
    entries,
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(CORPUS_PATH, JSON.stringify(corpus, null, 2), 'utf8');

  return { ok: entries.length, failed };
}

if (process.argv[1] && /harvest-corpus/.test(process.argv[1])) {
  harvest()
    .then(({ ok, failed }) => {
      console.log(`\nHarvested ${ok} MedlinePlus topics -> data/generated/medical-corpus.json`);
      if (failed.length) {
        console.error(`Failed: ${failed.length}`);
        process.exitCode = 1;
      }
    })
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    });
}
