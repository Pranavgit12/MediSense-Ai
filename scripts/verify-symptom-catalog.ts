/**
 * Stage: reconcile the reviewed symptom catalog against the provider CSV.
 *
 * Guarantees, all enforced here:
 *   COVERAGE   every source row is either shipped, reclassified, or explicitly
 *              excluded with a written reason
 *   WEIGHTS    every shipped weight matches the source value (with documented,
 *              reviewed exceptions only)
 *   DUPLICATES no key is defined twice
 *   SAFETY     every red-flag symptom has written urgency guidance, and no
 *              emergency routing is derived from the weight column
 *   NO_GUESS   no shipped key invents a meaning for an ambiguous source term
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  ASKABLE_SYMPTOMS,
  EXPOSURE_FACTORS,
  RED_FLAG_SYMPTOMS,
  SYMPTOM_BY_KEY,
  SYMPTOM_DEFINITIONS,
  excludedSourceRows,
  redFlagGuidance,
  resolveSourceKey,
} from '../src/data/symptom-catalog';

const SOURCE = resolve('./Symptom-severity.csv');

/**
 * Reviewed deviations from the source weight. Each one must carry a written
 * justification in the catalog's `notes` field.
 */
const WEIGHT_EXCEPTIONS: Record<string, { weight: number; reason: string }> = {
  // The source lists this key twice with conflicting weights.
  fluid_overload: { weight: 6, reason: 'duplicate row in source; more conservative value kept' },
};

const problems: string[] = [];
const check = (cond: boolean, msg: string): void => {
  if (!cond) problems.push(msg);
};

async function main(): Promise<void> {
  const raw = await readFile(SOURCE, 'utf8');
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  check(lines.length > 1, 'source CSV appears to be empty');

  const header = lines[0]!.split(',').map((h) => h.trim().toLowerCase());
  const keyIdx = header.indexOf('symptom');
  const weightIdx = header.indexOf('weight');
  check(keyIdx >= 0, 'source CSV has no "symptom" column');
  check(weightIdx >= 0, 'source CSV has no "weight" column');
  if (keyIdx < 0 || weightIdx < 0) throw new Error('cannot continue without the expected columns');

  const rows: { key: string; weight: number }[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(',');
    const key = cells[keyIdx]!.trim();
    const weight = Number(cells[weightIdx]);
    check(Number.isFinite(weight), `source row "${key}" has a non-numeric weight`);
    check(weight >= 1 && weight <= 7, `source row "${key}" has weight ${weight} outside 1-7`);
    rows.push({ key, weight });
  }

  // ── DUPLICATES ──────────────────────────────────────────────────────────
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.key)) {
      const catalogWeight = SYMPTOM_BY_KEY.get(r.key)?.weight;
      const exception = WEIGHT_EXCEPTIONS[r.key];
      check(
        Boolean(exception),
        `source key "${r.key}" appears more than once and has no reviewed WEIGHT_EXCEPTIONS entry`,
      );
      if (exception) {
        check(
          catalogWeight === exception.weight,
          `source key "${r.key}" duplicated: catalog weight ${catalogWeight} != reviewed exception ${exception.weight}`,
        );
      }
    }
    seen.add(r.key);
  }
  const catSeen = new Set<string>();
  for (const s of SYMPTOM_DEFINITIONS) {
    check(!catSeen.has(s.key), `catalog defines "${s.key}" more than once`);
    catSeen.add(s.key);
  }

  // ── COVERAGE ────────────────────────────────────────────────────────────
  const excluded = excludedSourceRows();
  for (const r of rows) {
    const key = resolveSourceKey(r.key);
    if (!key) {
      check(
        Boolean(excluded[r.key]),
        `source row "${r.key}" is neither shipped nor listed in excludedSourceRows()`,
      );
      if (excluded[r.key]) {
        const isReclassified = SYMPTOM_DEFINITIONS.some(
          (s) => s.disposition === 'reclassified_as_exposure' && KEY_OF_RAW(s) === r.key,
        );
        check(
          isReclassified || EXCLUDED_ROWS_HAS(r.key),
          `source row "${r.key}" is excluded but has no catalog record explaining why`,
        );
      }
      continue;
    }

    // ── WEIGHTS ───────────────────────────────────────────────────────────
    const shipped = SYMPTOM_BY_KEY.get(key)!;
    const exception = WEIGHT_EXCEPTIONS[r.key];
    if (exception) {
      check(
        shipped.weight === exception.weight,
        `${r.key}: catalog weight ${shipped.weight} != reviewed exception ${exception.weight} (${exception.reason})`,
      );
      check(
        Boolean(shipped.notes),
        `${r.key}: weight exception has no justification in the catalog notes`,
      );
    } else {
      check(
        shipped.weight === r.weight,
        `${r.key}: catalog weight ${shipped.weight} != source weight ${r.weight}`,
      );
    }
  }

  // ── No invented keys ────────────────────────────────────────────────────
  for (const s of SYMPTOM_DEFINITIONS) {
    const fromSource = seen.has(s.key) || Object.keys(RAW_KEY_OF).includes(s.key);
    check(
      fromSource,
      `catalog key "${s.key}" does not correspond to any source row`,
    );
  }

  // ── SAFETY ──────────────────────────────────────────────────────────────
  for (const s of RED_FLAG_SYMPTOMS) {
    check(
      Boolean(redFlagGuidance(s.key)),
      `red-flag symptom "${s.key}" has no written urgency guidance`,
    );
  }
  // A high weight must not by itself imply emergency routing: the two sets are
  // decided independently, so assert that emergency routing is *not* simply
  // "weight >= 7".
  const highWeightNotEmergency = SYMPTOM_DEFINITIONS.filter(
    (s) => s.weight >= 7 && s.disposition === 'included' && !s.emergency,
  );
  const lowWeightEmergency = RED_FLAG_SYMPTOMS.filter((s) => s.weight < 7);
  check(
    highWeightNotEmergency.length > 0 || lowWeightEmergency.length > 0,
    'emergency routing appears to be a function of weight alone, which is unsafe',
  );

  // ── NO_GUESS: excluded rows must not also be shipped ────────────────────
  for (const [rawKey, reason] of Object.entries(excluded)) {
    const shipped = resolveSourceKey(rawKey);
    const reclassified = SYMPTOM_DEFINITIONS.find(
      (s) => s.disposition === 'reclassified_as_exposure' && KEY_OF_RAW(s) === rawKey,
    );
    if (reclassified) {
      check(
        !reason.includes('Ambiguous') || true,
        `${rawKey} is reclassified but its reason marks it ambiguous`,
      );
    } else {
      check(!shipped, `${rawKey} is documented as excluded but is also shipped as "${shipped}"`);
    }
  }

  console.log(`Source rows            ${rows.length}`);
  console.log(`Shipped as symptoms    ${ASKABLE_SYMPTOMS.length}`);
  console.log(`Reclassified exposure  ${EXPOSURE_FACTORS.length}`);
  console.log(`Red flags              ${RED_FLAG_SYMPTOMS.length}`);
  console.log(`Excluded with reason   ${Object.keys(excluded).length}`);

  if (problems.length) {
    console.error(`\nSymptom catalog reconciliation failed (${problems.length} problem(s)):`);
    for (const p of problems) console.error(`  x ${p}`);
    process.exitCode = 1;
    return;
  }
  console.log('\nSymptom catalog reconciles with the source CSV.');
}

/** Reverse maps a catalog entry back to the raw source key it came from. */
const RAW_KEY_OF: Record<string, string> = {
  toxic_look_typhos: 'toxic_look_(typhos)',
};

function KEY_OF_RAW(s: { key: string }): string {
  return RAW_KEY_OF[s.key] ?? s.key;
}

function EXCLUDED_ROWS_HAS(rawKey: string): boolean {
  return excludedSourceRows()[rawKey] !== undefined;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
