/**
 * Medical terminology normalisation.
 *
 * Purpose: reports print the same analyte under many different names
 * ("Total Leucocyte Count", "WBC", "White Blood Cells", "Leukocytes"). The
 * dashboard, the trend view and the knowledge retrieval all need one canonical
 * name, so every printed name is mapped here.
 *
 * `code` values are LOINC where we are confident. They are NOT authoritative
 * until `npm run db:verify` has checked them against the NLM LOINC search
 * service; unverified codes are stored but never used to make a clinical
 * claim. See `scripts/verify-sources.ts`.
 */

import { PROVENANCE, type Provenance } from '../types/medical';

export interface TestDefinition {
  /** Canonical display name. */
  canonical: string;
  /** Panel or group, used for report-type detection and UI grouping. */
  group: 'cbc' | 'differential' | 'indices' | 'inflammatory' | 'metabolic' | 'other';
  code: string | null;
  /** Recognised printed names, lowercased. Order does not matter. */
  aliases: string[];
  /** Default unit when the report omits one. */
  expectedUnit: string | null;
  /** Numerically plausible bounds, used to catch OCR/parse errors, not to judge health. */
  plausibleMin: number | null;
  plausibleMax: number | null;
  /** Printed name should be treated as a percentage of total when true. */
  isPercentage: boolean;
}

const def = (d: TestDefinition): TestDefinition => d;

/**
 * Phase 3 + Phase 4 coverage: full CBC with differential, plus ESR, HbA1c,
 * lipids, LFT, KFT and electrolytes. Each entry's aliases were taken from the
 * range of spellings seen in the sample-report corpus in `data/`.
 */
export const TEST_DEFINITIONS: TestDefinition[] = [
  // ── Core CBC ──────────────────────────────────────────────────────────────
  def({
    canonical: 'Hemoglobin',
    group: 'cbc',
    code: '718-7',
    aliases: ['hb', 'hgb', 'hemoglobin', 'haemoglobin', 'hemoglobin (hb)', 'hb (g/dl)'],
    expectedUnit: 'g/dL',
    plausibleMin: 1,
    plausibleMax: 25,
    isPercentage: false,
  }),
  def({
    canonical: 'Red Blood Cell Count',
    group: 'cbc',
    code: '789-8',
    aliases: ['rbc', 'rbc count', 'red blood cell count', 'red cell count', 'erythrocyte count', 'erythrocytes', 'r.b.c'],
    expectedUnit: 'x10^12/L',
    plausibleMin: 0.5,
    plausibleMax: 8,
    isPercentage: false,
  }),
  def({
    canonical: 'White Blood Cell Count',
    group: 'cbc',
    code: '6690-2',
    aliases: [
      'wbc', 'wbc count', 'white blood cell count', 'white cell count', 'leukocytes',
      'leucocytes', 'leukocyte count', 'total leucocyte count', 'total leukocyte count',
      'tlc', 'w.b.c', 'white blood cells',
    ],
    expectedUnit: '/µL',
    plausibleMin: 10,
    plausibleMax: 300000,
    isPercentage: false,
  }),
  def({
    canonical: 'Platelet Count',
    group: 'cbc',
    code: '777-3',
    aliases: [
      'platelets', 'platelet count', 'plt', 'plts', 'thrombocytes',
      'thrombocyte count', 'platelet count (immat. fraction)',
    ],
    expectedUnit: '/µL',
    plausibleMin: 5,
    plausibleMax: 1500000,
    isPercentage: false,
  }),
  def({
    canonical: 'Hematocrit',
    group: 'cbc',
    code: '4544-3',
    aliases: ['hct', 'pcv', 'packed cell volume', 'hematocrit', 'haematocrit', 'haematocrit (hct)'],
    expectedUnit: '%',
    plausibleMin: 5,
    plausibleMax: 80,
    isPercentage: true,
  }),

  // ── Red cell indices ──────────────────────────────────────────────────────
  def({
    canonical: 'MCV',
    group: 'indices',
    code: '787-2',
    aliases: ['mcv', 'mean corpuscular volume', 'mean cell volume'],
    expectedUnit: 'fL',
    plausibleMin: 40,
    plausibleMax: 160,
    isPercentage: false,
  }),
  def({
    canonical: 'MCH',
    group: 'indices',
    code: '785-6',
    // The abbreviated "mean corpuscular hb" form is a strict prefix of the MCHC
    // spellings, so every MCHC alias must also exist in its abbreviated form or
    // the longest-alias fallback will resolve MCHC rows to MCH.
    aliases: [
      'mch',
      'mean corpuscular hemoglobin',
      'mean corpuscular haemoglobin',
      'mean corpuscular hb',
      'mean cell haemoglobin',
      'mean cell hemoglobin',
      'mean cell hb',
    ],
    expectedUnit: 'pg',
    plausibleMin: 5,
    plausibleMax: 60,
    isPercentage: false,
  }),
  def({
    canonical: 'MCHC',
    group: 'indices',
    code: '786-4',
    aliases: [
      'mchc',
      'mean corpuscular hemoglobin concentration',
      'mean corpuscular haemoglobin concentration',
      'mean corpuscular hb concentration',
      'mean cell hb concentration',
      'mean cell hemoglobin concentration',
      'mean cell haemoglobin concentration',
    ],
    expectedUnit: 'g/dL',
    plausibleMin: 10,
    plausibleMax: 40,
    isPercentage: false,
  }),
  def({
    canonical: 'RDW',
    group: 'indices',
    code: '788-0',
    aliases: ['rdw', 'rdw-cv', 'red cell distribution width', 'red cell distribution width (cv)'],
    expectedUnit: '%',
    plausibleMin: 8,
    plausibleMax: 45,
    isPercentage: true,
  }),

  // ── Differential ──────────────────────────────────────────────────────────
  def({
    canonical: 'Neutrophils',
    group: 'differential',
    code: '770-8',
    aliases: ['neutrophils', 'neutrophil', 'neutrophils %', 'neutrophils (%)', 'neut', 'polymorphs'],
    expectedUnit: '%',
    plausibleMin: 0,
    plausibleMax: 100,
    isPercentage: true,
  }),
  def({
    canonical: 'Lymphocytes',
    group: 'differential',
    code: '736-9',
    aliases: ['lymphocytes', 'lymphocyte', 'lymphocytes %', 'lymphocytes (%)', 'lymph'],
    expectedUnit: '%',
    plausibleMin: 0,
    plausibleMax: 100,
    isPercentage: true,
  }),
  def({
    canonical: 'Monocytes',
    group: 'differential',
    code: '5905-5',
    aliases: ['monocytes', 'monocyte', 'monocytes %', 'monocytes (%)', 'mono'],
    expectedUnit: '%',
    plausibleMin: 0,
    plausibleMax: 100,
    isPercentage: true,
  }),
  def({
    canonical: 'Eosinophils',
    group: 'differential',
    code: '711-2',
    aliases: ['eosinophils', 'eosinophil', 'eosinophils %', 'eosinophils (%)', 'eosino'],
    expectedUnit: '%',
    plausibleMin: 0,
    plausibleMax: 100,
    isPercentage: true,
  }),
  def({
    canonical: 'Basophils',
    group: 'differential',
    code: '706-2',
    aliases: ['basophils', 'basophil', 'basophils %', 'basophils (%)', 'baso'],
    expectedUnit: '%',
    plausibleMin: 0,
    plausibleMax: 100,
    isPercentage: true,
  }),

  // ── Inflammatory markers ──────────────────────────────────────────────────
  def({
    canonical: 'ESR',
    group: 'inflammatory',
    code: '4537-7',
    aliases: ['esr', 'erythrocyte sedimentation rate', 'sedimentation rate', 'esr (westergren)'],
    expectedUnit: 'mm/hr',
    plausibleMin: 0,
    plausibleMax: 150,
    isPercentage: false,
  }),

  // ── Common phase-4 analytes ───────────────────────────────────────────────
  def({
    canonical: 'HbA1c',
    group: 'metabolic',
    code: '4548-4',
    aliases: ['hba1c', 'glycated haemoglobin', 'glycated hemoglobin', 'glycosylated haemoglobin', 'glycosylated hemoglobin', 'a1c'],
    expectedUnit: '%',
    plausibleMin: 3,
    plausibleMax: 20,
    isPercentage: true,
  }),
  def({
    canonical: 'Fasting Glucose',
    group: 'metabolic',
    code: '1558-6',
    aliases: ['glucose', 'fasting glucose', 'fasting blood glucose', 'fbs', 'fbg', 'blood sugar', 'glucose fasting', 'fasting blood sugar'],
    expectedUnit: 'mg/dL',
    plausibleMin: 20,
    plausibleMax: 800,
    isPercentage: false,
  }),
  def({
    canonical: 'Total Cholesterol',
    group: 'metabolic',
    code: '2093-3',
    aliases: ['cholesterol', 'total cholesterol', 'cholesterol total', 'tc', 'total cholesterol (mg/dl)'],
    expectedUnit: 'mg/dL',
    plausibleMin: 50,
    plausibleMax: 1500,
    isPercentage: false,
  }),
  def({
    canonical: 'LDL Cholesterol',
    group: 'metabolic',
    code: '13457-7',
    aliases: ['ldl', 'ldl cholesterol', 'ldl-c', 'ldl (mg/dl)', 'low density lipoprotein cholesterol'],
    expectedUnit: 'mg/dL',
    plausibleMin: 10,
    plausibleMax: 600,
    isPercentage: false,
  }),
  def({
    canonical: 'HDL Cholesterol',
    group: 'metabolic',
    code: '2085-9',
    aliases: ['hdl', 'hdl cholesterol', 'hdl-c', 'high density lipoprotein cholesterol'],
    expectedUnit: 'mg/dL',
    plausibleMin: 5,
    plausibleMax: 250,
    isPercentage: false,
  }),
  def({
    canonical: 'Triglycerides',
    group: 'metabolic',
    code: '2571-8',
    aliases: ['triglycerides', 'triglyceride', 'tgl', 'tg', 'triglycerides (mg/dl)'],
    expectedUnit: 'mg/dL',
    plausibleMin: 10,
    plausibleMax: 3000,
    isPercentage: false,
  }),
  def({
    canonical: 'ALT',
    group: 'metabolic',
    code: '1742-6',
    aliases: ['alt', 'sgpt', 'alanine aminotransferase', 'alt (sgpt)'],
    expectedUnit: 'U/L',
    plausibleMin: 1,
    plausibleMax: 5000,
    isPercentage: false,
  }),
  def({
    canonical: 'AST',
    group: 'metabolic',
    code: '1920-8',
    aliases: ['ast', 'sgot', 'aspartate aminotransferase', 'ast (sgot)'],
    expectedUnit: 'U/L',
    plausibleMin: 1,
    plausibleMax: 5000,
    isPercentage: false,
  }),
  def({
    canonical: 'Bilirubin Total',
    group: 'metabolic',
    code: '1975-2',
    aliases: ['bilirubin', 'total bilirubin', 'bilirubin total', 'bilirubin (mg/dl)', 'sbilirubin'],
    expectedUnit: 'mg/dL',
    plausibleMin: 0.05,
    plausibleMax: 100,
    isPercentage: false,
  }),
  def({
    canonical: 'Creatinine',
    group: 'metabolic',
    code: '2160-0',
    aliases: ['creatinine', 'serum creatinine', 'creat'],
    expectedUnit: 'mg/dL',
    plausibleMin: 0.1,
    plausibleMax: 30,
    isPercentage: false,
  }),
  def({
    canonical: 'Urea',
    group: 'metabolic',
    code: '6299-2',
    aliases: ['urea', 'blood urea', 'bun', 'urea (mg/dl)', 'blood urea nitrogen'],
    expectedUnit: 'mg/dL',
    plausibleMin: 1,
    plausibleMax: 300,
    isPercentage: false,
  }),
  def({
    canonical: 'Sodium',
    group: 'metabolic',
    code: '2951-2',
    aliases: ['sodium', 'na+', 'na', 'serum sodium', 'sodium (mmol/l)'],
    expectedUnit: 'mmol/L',
    plausibleMin: 90,
    plausibleMax: 200,
    isPercentage: false,
  }),
  def({
    canonical: 'Potassium',
    group: 'metabolic',
    code: '2823-3',
    aliases: ['potassium', 'k+', 'k', 'serum potassium', 'potassium (mmol/l)'],
    expectedUnit: 'mmol/L',
    plausibleMin: 1,
    plausibleMax: 10,
    isPercentage: false,
  }),
  def({
    canonical: 'TSH',
    group: 'metabolic',
    code: '3016-3',
    aliases: ['tsh', 'thyroid stimulating hormone', 'tsh (µIU/ml)', 'tsh (mui/l)', 'thyrotropin'],
    expectedUnit: 'mEq/L',
    plausibleMin: 0.001,
    plausibleMax: 500,
    isPercentage: false,
  }),
  def({
    canonical: 'Free T4',
    group: 'metabolic',
    code: '3024-7',
    aliases: ['ft4', 'free t4', 'free thyroxine', 'ft4 (ng/dl)', 'thyroxine free'],
    expectedUnit: 'g/dL',
    plausibleMin: 0.1,
    plausibleMax: 100,
    isPercentage: false,
  }),
];

// ── Lookup indexes ──────────────────────────────────────────────────────────

/** Lowercase, punctuation-collapsed key used for all alias matching. */
export function normalizeTermKey(input: string): string {
  return input
    .toLowerCase()
    .replace(/[‐-―−]/g, '-')
    .replace(/[''`]/g, '')
    .replace(/\b(blood|serum|absolute|direct|total|count|value|level|test|analysis|parameter)\b/g, ' ')
    .replace(/[^a-z0-9%^+/.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const BY_ALIAS = new Map<string, TestDefinition>();
const BY_CANONICAL = new Map<string, TestDefinition>();
for (const t of TEST_DEFINITIONS) {
  BY_CANONICAL.set(t.canonical.toLowerCase(), t);
  BY_ALIAS.set(normalizeTermKey(t.canonical), t);
  for (const a of t.aliases) BY_ALIAS.set(normalizeTermKey(a), t);
  // Also register the "name + unit" forms, e.g. "hemoglobin (hb)".
  if (t.expectedUnit) BY_ALIAS.set(normalizeTermKey(`${t.canonical} (${t.expectedUnit})`), t);
}

/**
 * Generate progressively simpler lookup candidates for a printed test name.
 *
 * Reports decorate analyte names with the unit, a percentage sign, an
 * "Absolute"/"Relative" hint and lab-specific bracketing. We peel those off one
 * layer at a time and try an exact match on each candidate before falling back
 * to containment, so "Lymphocyte % (ABS)" still resolves to Lymphocytes.
 */
export function termLookupCandidates(printedName: string): string[] {
  const out: string[] = [];
  const push = (s: string) => {
    const k = normalizeTermKey(s);
    if (k && !out.includes(k)) out.push(k);
  };

  let current = printedName;
  push(current);

  // Peel "(...)" groups and trailing unit/percent decorations repeatedly.
  for (let i = 0; i < 5; i += 1) {
    const before = current;
    current = current.replace(/\([^)]*\)/g, ' ');
    current = current.replace(/\s*[%‰]\s*$/, ' ');
    current = current.replace(
      /\s+(g\/dl|g\/l|mg\/dl|mg\/l|mmol\/l|\/ul|\/µl|u\/l|iu\/l|fL|pg|%|x10\^?3\/ul|x10\^?9\/l|mm\/hr|ng\/ml|mEq\/l|meq\/l)\s*$/i,
      ' ',
    );
    current = current.replace(/\s+/g, ' ').trim();
    if (current === before) break;
    push(current);
  }

  // Final fallback: singular/plural tolerant token.
  const last = out[out.length - 1];
  if (last && last.length >= 4) {
    for (const variant of [last.replace(/s$/, ''), `${last}s`]) {
      if (!out.includes(variant)) out.push(variant);
    }
  }

  return out;
}

export function findTestDefinition(printedName: string): TestDefinition | null {
  const candidates = termLookupCandidates(printedName);

  for (const c of candidates) {
    const d = BY_ALIAS.get(c);
    if (d) return d;
  }

  // Containment fallback, longest alias wins so that
  // "lymphocytes" never wins against "neutrophils".
  let best: { def: TestDefinition; len: number } | null = null;
  for (const c of candidates) {
    for (const [alias, d] of BY_ALIAS) {
      if (alias.length < 4) continue;
      if (c.includes(alias) && (!best || alias.length > best.len)) {
        best = { def: d, len: alias.length };
      }
    }
  }
  return best && best.len >= 4 ? best.def : null;
}

export function canonicalTestName(printedName: string): string {
  return findTestDefinition(printedName)?.canonical ?? printedName.trim();
}

export function testsInGroup(group: TestDefinition['group']): TestDefinition[] {
  return TEST_DEFINITIONS.filter((t) => t.group === group);
}

/** Analytes that, when present together, identify a CBC panel. */
export const CBC_CORE_TESTS = [
  'Hemoglobin',
  'Red Blood Cell Count',
  'White Blood Cell Count',
  'Platelet Count',
  'Hematocrit',
] as const;

/**
 * Build a deterministic per-report result key.
 * Same analyte twice on one report (e.g. absolute + percentage) is
 * disambiguated by unit rather than by array position.
 */
export function makeResultKey(normalizedName: string, unit: string | null, index: number): string {
  const unitPart = unit ? unit.replace(/[^a-z0-9]+/gi, '-').toLowerCase() : 'nounit';
  return `${normalizedName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}::${unitPart}::${index}`;
}

export interface NormalizationResult {
  normalizedName: string;
  code: string | null;
  matched: boolean;
  /** How we matched: exact alias, containment, or none. */
  matchKind: 'exact' | 'containment' | 'none';
  expectedUnit: string | null;
  isPercentage: boolean;
  provenance: Provenance;
  definition: TestDefinition | null;
}

export function normalizeTestName(printedName: string): NormalizationResult {
  const key = normalizeTermKey(printedName);
  const exact = BY_ALIAS.get(key);
  if (exact) {
    return {
      normalizedName: exact.canonical,
      code: exact.code,
      matched: true,
      matchKind: 'exact',
      expectedUnit: exact.expectedUnit,
      isPercentage: exact.isPercentage,
      provenance: PROVENANCE.COMPUTED,
      definition: exact,
    };
  }
  const contained = findTestDefinition(printedName);
  if (contained) {
    return {
      normalizedName: contained.canonical,
      code: contained.code,
      matched: true,
      matchKind: 'containment',
      expectedUnit: contained.expectedUnit,
      isPercentage: contained.isPercentage,
      provenance: PROVENANCE.COMPUTED,
      definition: contained,
    };
  }
  return {
    normalizedName: printedName.trim(),
    code: null,
    matched: false,
    matchKind: 'none',
    expectedUnit: null,
    isPercentage: false,
    provenance: PROVENANCE.COMPUTED,
    definition: null,
  };
}
