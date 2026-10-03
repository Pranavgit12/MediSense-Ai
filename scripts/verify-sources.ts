/**
 * Stage: verify every citation we ship.
 *
 * Three independent checks, all of which must pass:
 *
 *   1. LICENCE     - the source registry still permits redistribution of the
 *                    text we store, and the host is an NLM host.
 *   2. LIVE        - the URL returns 2xx right now. A dead link is a hard fail.
 *   3. HARVESTED   - the URL is present in the harvested corpus, so the text
 *                    we attribute to it actually came from a reviewed fetch.
 *
 * Check 3 is what stops a citation from pointing at a page whose content we
 * never ingested.
 *
 * Exits non-zero when any check fails, so it is usable in CI.
 */
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { isLicensedMedlinePlusUrl } from '../src/medical/nlm';
import { intakeDecision } from '../src/data/source-registry';
import { PUBLISHER_LICENSES } from '../src/data/harvest-spec';

const OUT_DIR = resolve('./data/generated');
const UA = 'Mozilla/5.0 (compatible; MediSense/0.1; citation-verifier)';

interface LabTestsFile {
  tests: {
    normalizedName: string;
    defaultUnit: string | null;
    sourceSlug: string;
    sourceUrl: string;
    license: string;
  }[];
  referenceRanges: {
    normalizedName: string;
    unit: string | null;
    refText: string;
    reviewStatus: string;
    sourceUrl: string;
  }[];
}
interface CorpusFile {
  publisher: { publisher: string; license: string };
  entries: { slug: string; url: string; license: string; publisher: string; summary: string }[];
}

type Status = 'ok' | 'fail';
interface Row {
  status: Status;
  where: string;
  url: string;
  detail: string;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function head(url: string): Promise<{ status: number; finalUrl: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': UA, range: 'bytes=0-2047' },
    });
    // Drain the body so the socket can be reused/closed.
    await res.arrayBuffer().catch(() => undefined);
    return { status: res.status, finalUrl: res.url };
  } finally {
    clearTimeout(timer);
  }
}

async function main(): Promise<void> {
  const publisher = PUBLISHER_LICENSES[0]!;
  const corpus = await readJson<CorpusFile>(join(OUT_DIR, 'medical-corpus.json'));
  const corpusUrls = new Map(corpus.entries.map((e) => [e.url, e.slug]));

  console.log(`Corpus: ${corpus.entries.length} entries from ${corpus.publisher.publisher} (${corpus.publisher.license})`);

  // 1. Every corpus entry must carry a redistributable licence.
  const rows: Row[] = [];
  for (const e of corpus.entries) {
    const okLicence =
      isLicensedMedlinePlusUrl(e.url) &&
      intakeDecision(publisher.slug, e.url).action === 'ingest_text' &&
      e.license === publisher.license;
    rows.push({
      status: okLicence ? 'ok' : 'fail',
      where: `corpus:${e.slug}`,
      url: e.url,
      detail: okLicence ? e.license : 'licence gate rejects redistribution',
    });
  }

  // 2. Every citation used by the lab dataset must be live AND harvested.
  const lab = await readJson<LabTestsFile>(join(OUT_DIR, 'lab-tests.json'));
  const cited = new Set<string>();
  for (const t of lab.tests ?? []) if (t.sourceUrl) cited.add(t.sourceUrl);
  for (const r of lab.referenceRanges ?? []) if (r.sourceUrl) cited.add(r.sourceUrl);

  const seen = new Set<string>();
  for (const url of [...cited].sort()) {
    if (seen.has(url)) continue;
    seen.add(url);
    const names = [...(lab.tests ?? []), ...(lab.referenceRanges ?? [])]
      .filter((x) => x.sourceUrl === url)
      .map((x) => x.normalizedName);
    const where = `lab-tests:${names.slice(0, 3).join(', ')}`;

    if (!isLicensedMedlinePlusUrl(url)) {
      rows.push({ status: 'fail', where, url, detail: 'host is not an NLM host' });
      continue;
    }
    const decision = intakeDecision(publisher.slug, url);
    if (decision.action !== 'ingest_text') {
      rows.push({ status: 'fail', where, url, detail: `licence: ${decision.reason}` });
      continue;
    }
    let live: { status: number; finalUrl: string };
    try {
      live = await head(url);
    } catch (err) {
      rows.push({ status: 'fail', where, url, detail: `fetch error: ${(err as Error).message}` });
      continue;
    }
    if (live.status < 200 || live.status >= 300) {
      rows.push({ status: 'fail', where, url, detail: `HTTP ${live.status}` });
      continue;
    }
    if (live.finalUrl !== url) {
      rows.push({ status: 'fail', where, url, detail: `redirects to ${live.finalUrl}` });
      continue;
    }
    if (!corpusUrls.has(url)) {
      rows.push({
        status: 'fail',
        where,
        url,
        detail: 'live but NOT in the harvested corpus (text would be uncited)',
      });
      continue;
    }
    rows.push({ status: 'ok', where, url, detail: `live, harvested as ${corpusUrls.get(url)}` });
  }

  // 3. Internal consistency: each test's sourceSlug must be the corpus entry
  //    that actually holds its sourceUrl, and the licence must match. Without
  //    this, a test can cite a live URL while naming a corpus record that was
  //    never fetched for it.
  for (const t of lab.tests ?? []) {
    const corpusSlug = corpusUrls.get(t.sourceUrl);
    if (!corpusSlug) {
      rows.push({
        status: 'fail',
        where: `lab-tests:${t.normalizedName}`,
        url: t.sourceUrl,
        detail: 'sourceUrl is not present in the harvested corpus',
      });
      continue;
    }
    if (t.sourceSlug !== corpusSlug) {
      rows.push({
        status: 'fail',
        where: `lab-tests:${t.normalizedName}`,
        url: t.sourceUrl,
        detail: `sourceSlug "${t.sourceSlug}" does not match corpus slug "${corpusSlug}" for this URL`,
      });
      continue;
    }
    if (t.license !== corpus.publisher.license) {
      rows.push({
        status: 'fail',
        where: `lab-tests:${t.normalizedName}`,
        url: t.sourceUrl,
        detail: `licence "${t.license}" differs from corpus licence "${corpus.publisher.license}"`,
      });
      continue;
    }
    rows.push({
      status: 'ok',
      where: `lab-tests:${t.normalizedName}`,
      url: t.sourceUrl,
      detail: `consistent with corpus record "${corpusSlug}"`,
    });
  }

  const failures = rows.filter((r) => r.status === 'fail');
  for (const r of rows.filter((x) => x.status === 'fail')) {
    console.error(`  x ${r.where}\n    ${r.url}\n    ${r.detail}`);
  }
  console.log(`\n${rows.length - failures.length}/${rows.length} citation checks passed.`);
  if (failures.length) {
    console.error(`${failures.length} citation check(s) failed.`);
    process.exitCode = 1;
  }
}
main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
