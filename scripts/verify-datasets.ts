/**
 * Stage: verify the generated datasets.
 *
 * The corpus itself is checked by `scripts/verify-sources.ts` (licence, live
 * URL, harvested, consistent). This script checks the things that must be true
 * of every shipped dataset regardless of where its text came from:
 *
 *   SHAPE    - required fields present, counts non-zero
 *   RANGES   - refLow < refHigh, age windows sane, units present
 *   STATUS   - no reference range is accidentally marked clinician-approved
 *   PII      - the synthetic corpus contains no realistic identifiers
 *   PARSE    - the deterministic parser round-trips a representative share of
 *              the synthetic reports
 *   NO-PII   - every synthetic record id uses the SYN- prefix
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseLabReport } from '../src/medical/report-parser';
import { canonicalUnit } from '../src/medical/units';
import { LAB_TEST_RECORDS, REFERENCE_RANGES } from '../src/data/lab-tests';

const OUT_DIR = resolve('./data/generated');
const REPORT_DIR = join(OUT_DIR, 'sample-reports');

/** Every generated sample report carries this many analytes. */
const ANALYTES_PER_REPORT = 14;

const problems: string[] = [];
function check(cond: boolean, msg: string): void {
  if (!cond) problems.push(msg);
}

interface CorpusEntry {
  slug: string;
  url: string;
  license: string;
  summary: string;
  sections: { heading: string; body: string }[];
}
interface CorpusFile {
  entries: CorpusEntry[];
  publisher: { license: string };
}
interface LabFile {
  tests: { normalizedName: string; defaultUnit: string | null; sourceUrl: string }[];
  referenceRanges: {
    normalizedName: string;
    unit: string;
    refLow: number | null;
    refHigh: number | null;
    refText: string;
    reviewStatus: string;
    reviewedBy: string | null;
  }[];
}
interface CbcRecord {
  synthetic: boolean;
  id: string;
  layout: string;
  reportDate: string;
  sex: string;
  ageYears: number;
  results: { name: string; value: number; unit: string; displayRef: string; flagged: boolean }[];
}

/**
 * Values that look like real identifiers rather than obvious placeholders.
 * The NANP 555-0100..555-0199 block is reserved for fiction, so it is allowed.
 */
const PII_PATTERNS: { label: string; re: RegExp }[] = [
  { label: 'SSN-like 9-digit run', re: /\b\d{3}-\d{2}-\d{4}\b/ },
  { label: '16-digit card number', re: /\b(?:\d[ -]?){15,16}\b/ },
  { label: 'email address', re: /[\w.+-]+@[\w-]+\.[\w.]+/ },
];

/** Matches a plausible 10-digit NANP number that is NOT in the reserved 555-01xx block. */
const REAL_PHONE_RE = /(?:^|[^\d])(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/g;

function looksLikeRealPhone(text: string): string | null {
  for (const m of text.matchAll(REAL_PHONE_RE)) {
    const digits = m[0].replace(/\D/g, '');
    const national = digits.length === 11 ? digits.slice(1) : digits;
    if (national.length !== 10) continue;
    if (national.startsWith('55501')) continue; // reserved for fiction
    return m[0].trim();
  }
  return null;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function main(): Promise<void> {
  // ── Corpus shape ────────────────────────────────────────────────────────
  const corpus = await readJson<CorpusFile>(join(OUT_DIR, 'medical-corpus.json'));
  check(corpus.entries.length > 0, 'medical-corpus.json has no entries');
  for (const e of corpus.entries) {
    check(Boolean(e.slug), `corpus entry with empty slug (${e.url})`);
    check(e.summary.length >= 200, `corpus:${e.slug} summary is only ${e.summary.length} chars`);
    check(e.sections.length > 0, `corpus:${e.slug} has no sections`);
    check(
      e.license === corpus.publisher.license,
      `corpus:${e.slug} licence differs from the publisher licence`,
    );
  }

  // ── Lab tests ───────────────────────────────────────────────────────────
  const lab = await readJson<LabFile>(join(OUT_DIR, 'lab-tests.json'));
  check(lab.tests.length > 0, 'lab-tests.json has no tests');
  const testNames = new Set(lab.tests.map((t) => t.normalizedName));
  for (const t of lab.tests) {
    check(Boolean(t.sourceUrl), `lab test "${t.normalizedName}" has no sourceUrl`);
    if (t.defaultUnit) {
      check(
        canonicalUnit(t.defaultUnit) === t.defaultUnit,
        `lab test "${t.normalizedName}" default unit "${t.defaultUnit}" does not normalise to itself`,
      );
    }
  }
  for (const r of lab.referenceRanges) {
    check(
      testNames.has(r.normalizedName),
      `reference range for "${r.normalizedName}" has no matching test record`,
    );
    check(r.refText.length > 0, `reference range for "${r.normalizedName}" has empty refText`);
    if (r.refLow !== null && r.refHigh !== null) {
      check(r.refLow < r.refHigh, `reference range for "${r.normalizedName}" has refLow >= refHigh`);
    }
    // Nothing may ship as clinician-approved until a clinician has signed it.
    check(
      r.reviewStatus !== 'clinician_approved' || Boolean(r.reviewedBy),
      `reference range for "${r.normalizedName}" is marked approved with no reviewer`,
    );
  }

  // In-code data must agree with the generated file.
  check(
    LAB_TEST_RECORDS.length === lab.tests.length,
    `LAB_TEST_RECORDS (${LAB_TEST_RECORDS.length}) != lab-tests.json tests (${lab.tests.length})`,
  );
  check(
    REFERENCE_RANGES.length === lab.referenceRanges.length,
    `REFERENCE_RANGES (${REFERENCE_RANGES.length}) != lab-tests.json ranges (${lab.referenceRanges.length})`,
  );

  // ── Synthetic CBC records: PII + shape ──────────────────────────────────
  const cbc = await readJson<CbcRecord[]>(join(OUT_DIR, 'cbc-synthetic.json'));
  check(Array.isArray(cbc), 'cbc-synthetic.json is not an array');
  check(cbc.length > 0, 'cbc-synthetic.json has no records');
  const ids = new Set<string>();
  for (const rec of cbc) {
    check(rec.synthetic === true, `cbc record "${rec.id}" is not flagged synthetic`);
    check(rec.id.startsWith('SYN-'), `cbc record "${rec.id}" is not SYN-prefixed`);
    check(!ids.has(rec.id), `duplicate cbc record id "${rec.id}"`);
    ids.add(rec.id);
    check(rec.results.length > 0, `cbc record "${rec.id}" has no results`);
    for (const r of rec.results) {
      check(Number.isFinite(r.value), `cbc record "${rec.id}" has non-numeric value for ${r.name}`);
      check(canonicalUnit(r.unit) === r.unit, `cbc record "${rec.id}" unit "${r.unit}" is not canonical`);
    }
  }

  // ── Sample reports: PII + parser round-trip ─────────────────────────────
  // The filename encodes the source record id, so extraction can be compared
  // against the generator's own ground truth instead of a loose lower bound.
  const byId = new Map(cbc.map((r) => [r.id, r]));
  const files = (await readdir(REPORT_DIR)).filter((f) => f.endsWith('.txt'));
  check(files.length > 0, 'sample-reports/ contains no .txt documents');
  let parsedCount = 0;
  let totalResults = 0;
  let allResultsOk = true;
  const layoutsSeen = new Set<string>();

  for (const f of files) {
    const text = await readFile(join(REPORT_DIR, f), 'utf8');
    for (const { label, re } of PII_PATTERNS) {
      const m = re.exec(text);
      if (m) {
        check(false, `sample report ${f} looks like it contains a ${label}: ${JSON.stringify(m[0])}`);
      }
    }
    const phone = looksLikeRealPhone(text);
    if (phone) {
      check(false, `sample report ${f} contains a non-reserved phone number: ${JSON.stringify(phone)}`);
    }

    // Patient/lab identifiers are expected in a report, but they must be
    // obviously synthetic placeholders rather than realistic codes.
    for (const m of text.matchAll(/\b(?:MRN|UHID|Accession No)\s*[:#]?\s*([A-Z0-9-]{4,})\b/gi)) {
      const id = m[1]!;
      if (!/^SYN-/i.test(id)) {
        check(false, `sample report ${f} has a non-synthetic identifier: ${JSON.stringify(m[0])}`);
      }
    }

    const parsed = parseLabReport(text);
    const recordId = /-(syn-cbc-\d+)\.txt$/i.exec(f)?.[1];
    const source = recordId ? byId.get(recordId.toUpperCase()) : undefined;
    if (recordId) {
      check(
        Boolean(source),
        `sample report ${f} does not map to a known synthetic record (${recordId})`,
      );
    }

    if (parsed.results.length === 0) {
      check(false, `sample report ${f} produced no results`);
      continue;
    }
    parsedCount++;
    if (source) layoutsSeen.add(source.layout);

    for (const r of parsed.results) {
      if (r.value === null) continue;
      totalResults++;
      if (r.normalizedName === null) {
        check(false, `sample report ${f}: result "${r.name}" has no normalized name`);
        allResultsOk = false;
      }
    }

    // Ground-truth comparison: nothing printed may be dropped.
    if (source) {
      check(
        parsed.results.length === source.results.length,
        `sample report ${f}: parsed ${parsed.results.length} results but the source record has ${source.results.length}`,
      );
      const wanted = new Map(source.results.map((r) => [r.name.toLowerCase(), r]));
      for (const r of parsed.results) {
        if (!r.normalizedName) continue;
        const hit = [...wanted.values()].find(
          (w) => w.name.toLowerCase() === r.normalizedName!.toLowerCase(),
        );
        if (!hit) continue;
        // Allow the printed display rounding the generator itself used.
        const tolerance = Math.max(Math.abs(hit.value) * 0.005, 0.011);
        check(
          Math.abs(r.value! - hit.value) <= tolerance,
          `sample report ${f}: ${r.normalizedName} parsed as ${r.value} but source value is ${hit.value}`,
        );
      }
    }
  }
  check(
    parsedCount === files.length,
    `only ${parsedCount}/${files.length} sample reports parsed successfully`,
  );
  check(totalResults > 0, 'no numeric results parsed from the sample reports');
  check(
    layoutsSeen.size >= 8,
    `only ${layoutsSeen.size} report layouts were exercised by the sample reports (expected 8)`,
  );

  // ── Report ──────────────────────────────────────────────────────────────
  if (problems.length) {
    console.error(`Dataset verification failed (${problems.length} problem(s)):`);
    for (const p of problems) console.error(`  x ${p}`);
    process.exitCode = 1;
    return;
  }
  console.log('Dataset verification passed.');
  const expectedResults = files.length * ANALYTES_PER_REPORT;
  console.log(`  corpus entries         ${corpus.entries.length}`);
  console.log(`  lab tests              ${lab.tests.length}`);
  console.log(`  reference ranges       ${lab.referenceRanges.length}`);
  console.log(`  synthetic CBC records  ${cbc.length}`);
  console.log(`  sample reports parsed  ${parsedCount}/${files.length}`);
  console.log(`  layouts exercised     ${layoutsSeen.size}`);
  console.log(
    `  results extracted     ${totalResults}/${expectedResults} (${ANALYTES_PER_REPORT} analytes x ${files.length} reports)`,
  );
  console.log(`  unmapped result names  ${allResultsOk ? 0 : '>0'}`);
  console.log(`  PII patterns matched   0`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
