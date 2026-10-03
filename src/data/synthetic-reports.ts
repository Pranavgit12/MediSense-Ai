/**
 * Synthetic report / CBC corpus generator.
 *
 * ── No real patient data is used anywhere in this file. ─────────────────────
 *
 * Everything is produced by a seeded PRNG (mulberry32) from fixed clinically
 * plausible distributions. Names come from `FICTIONAL_FIRST_NAMES` /
 * `FICTIONAL_LAST_NAMES`, which are deliberately generic, and every identifier
 * is a synthetic counter prefixed `SYN-`. Nothing is derived from, sampled from,
 * or approximated to any real person or real lab result.
 *
 * Why synthetic: we need many report *layouts* to test the OCR/parser
 * pipeline, and we need CBC results that include out-of-range values. Using real
 * patient reports would be both a privacy violation and a licensing problem.
 *
 * The value range is a *demonstration* range, chosen to exercise the parser.
 * The JSON output is explicitly marked `synthetic: true` and the parser refuses
 * to treat synthetic reference ranges as clinical guidance.
 */

export interface SyntheticCbcValue {
  name: string;
  printedName: string;
  value: number;
  unit: string;
  decimals: number;
}

export interface SyntheticCbcRecord {
  synthetic: true;
  id: string;
  layout: ReportLayoutId;
  reportDate: string;
  sex: 'male' | 'female';
  ageYears: number;
  /** All values are generated; no real reference intervals are asserted. */
  results: { name: string; value: number; unit: string; displayRef: string; flagged: boolean }[];
  scenario: 'normal' | 'low_hb' | 'infection' | 'thrombocytopenia' | 'leukocytosis' | 'dehydration';
}

export type ReportLayoutId =
  | 'wide_table'
  | 'colon_units'
  | 'bracketed_refs'
  | 'pipe_columns'
  | 'two_column_split'
  | 'lab_style_dense'
  | 'mobile_screenshot_text'
  | 'ocr_noisy';

export const REPORT_LAYOUTS: ReportLayoutId[] = [
  'wide_table',
  'colon_units',
  'bracketed_refs',
  'pipe_columns',
  'two_column_split',
  'lab_style_dense',
  'mobile_screenshot_text',
  'ocr_noisy',
];

/** Generic placeholders only. */
const FICTIONAL_FIRST_NAMES = ['Sample', 'Test', 'Demo', 'Fixture', 'Example', 'Placeholder', 'Synthetic'];
const FICTIONAL_LAST_NAMES = ['Patient', 'Subject', 'Record', 'Case', 'Fixture', 'Sample', 'Anon'];
const FICTIONAL_LABS = [
  'NORTHBRIDGE PATHOLOGY SERVICES',
  'CIVIC DIAGNOSTIC CENTRE',
  'SYNTHETIC LAB SERVICES (DEMO DATA)',
  'HARBOURSIDE CLINICAL LABORATORY',
  'MERIDIAN HEALTH LABS',
];
const FICTIONAL_DOCTORS = ['Dr. A. Reviewer', 'Dr. R. Sample', 'Dr. M. Placeholder', 'Dr. K. Fixture'];

/** Deterministic PRNG so a given seed always yields the same dataset. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number, mean: number, sd: number): number {
  // Box-Muller
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round = (n: number, d: number) => Number(n.toFixed(d));

interface AnalyteSpec {
  name: string;
  printed: string[];
  unit: string;
  decimals: number;
  /** Baseline for "normal" scenario, and the demo reference interval. */
  base: number;
  sd: number;
  lo: number;
  hi: number;
  shiftable: boolean;
}

const ANALYTES: AnalyteSpec[] = [
  { name: 'Hemoglobin', printed: ['Hemoglobin', 'Hb', 'Haemoglobin'], unit: 'g/dL', decimals: 1, base: 14.5, sd: 1.4, lo: 13.0, hi: 17.0, shiftable: true },
  { name: 'Red Blood Cell Count', printed: ['RBC Count', 'RBC', 'Red Blood Cell Count'], unit: 'x10^12/L', decimals: 2, base: 4.9, sd: 0.45, lo: 4.5, hi: 5.9, shiftable: true },
  { name: 'White Blood Cell Count', printed: ['WBC Count', 'WBC', 'Total Leucocyte Count'], unit: '/µL', decimals: 0, base: 7000, sd: 1800, lo: 4000, hi: 11000, shiftable: true },
  { name: 'Platelet Count', printed: ['Platelets', 'Platelet Count', 'PLT Count'], unit: '/µL', decimals: 0, base: 260000, sd: 60000, lo: 150000, hi: 410000, shiftable: true },
  { name: 'Hematocrit', printed: ['Hematocrit (PCV)', 'PCV', 'Hematocrit'], unit: '%', decimals: 1, base: 44, sd: 4.2, lo: 40, hi: 50, shiftable: true },
  { name: 'MCV', printed: ['MCV', 'Mean Corpuscular Volume'], unit: 'fL', decimals: 1, base: 89, sd: 5.5, lo: 83, hi: 101, shiftable: true },
  { name: 'MCH', printed: ['MCH', 'Mean Corpuscular Hemoglobin'], unit: 'pg', decimals: 1, base: 29.5, sd: 2.2, lo: 27, hi: 32, shiftable: true },
  { name: 'MCHC', printed: ['MCHC', 'Mean Corpuscular Hb Concentration'], unit: 'g/dL', decimals: 1, base: 33.2, sd: 0.9, lo: 31.5, hi: 34.5, shiftable: false },
  { name: 'RDW', printed: ['RDW-CV', 'RDW', 'Red Cell Distribution Width'], unit: '%', decimals: 1, base: 13.2, sd: 1.0, lo: 11.6, hi: 14.4, shiftable: true },
  { name: 'Neutrophils', printed: ['Neutrophils', 'Neutrophils %'], unit: '%', decimals: 0, base: 60, sd: 8, lo: 40, hi: 70, shiftable: true },
  { name: 'Lymphocytes', printed: ['Lymphocytes', 'Lymphocytes %'], unit: '%', decimals: 0, base: 30, sd: 6, lo: 20, hi: 40, shiftable: true },
  { name: 'Monocytes', printed: ['Monocytes', 'Monocytes %'], unit: '%', decimals: 0, base: 6, sd: 1.5, lo: 2, hi: 10, shiftable: true },
  { name: 'Eosinophils', printed: ['Eosinophils', 'Eosinophils %'], unit: '%', decimals: 0, base: 3, sd: 1.2, lo: 1, hi: 6, shiftable: true },
  { name: 'Basophils', printed: ['Basophils', 'Basophils %'], unit: '%', decimals: 0, base: 1, sd: 0.5, lo: 0, hi: 1, shiftable: false },
];

const pick = <T>(rand: () => number, arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;

function scenarioFor(index: number): SyntheticCbcRecord['scenario'] {
  const cycle: SyntheticCbcRecord['scenario'][] = [
    'normal', 'normal', 'normal', 'low_hb', 'normal', 'infection',
    'normal', 'thrombocytopenia', 'normal', 'leukocytosis', 'normal', 'dehydration',
  ];
  return cycle[index % cycle.length]!;
}

function applyScenario(spec: AnalyteSpec, scenario: SyntheticCbcRecord['scenario'], rand: () => number): number {
  if (!spec.shiftable) return spec.base;
  switch (scenario) {
    case 'low_hb':
      if (spec.name === 'Hemoglobin') return clamp(gaussian(rand, 11.0, 0.6), 8.5, 12.4);
      if (spec.name === 'Hematocrit') return clamp(gaussian(rand, 34, 2), 28, 38);
      if (spec.name === 'Red Blood Cell Count') return clamp(gaussian(rand, 4.0, 0.2), 3.4, 4.4);
      if (spec.name === 'MCV' || spec.name === 'MCH') return clamp(gaussian(rand, 78, 4), 68, 88);
      if (spec.name === 'RDW') return clamp(gaussian(rand, 16.5, 1.2), 14.8, 19);
      return spec.base;
    case 'infection':
      if (spec.name === 'White Blood Cell Count') return clamp(gaussian(rand, 13200, 900), 11500, 16000);
      if (spec.name === 'Neutrophils') return clamp(gaussian(rand, 76, 4), 71, 84);
      if (spec.name === 'Lymphocytes') return clamp(gaussian(rand, 17, 3), 11, 22);
      return spec.base;
    case 'thrombocytopenia':
      if (spec.name === 'Platelet Count') return clamp(gaussian(rand, 92000, 12000), 55000, 135000);
      return spec.base;
    case 'leukocytosis':
      if (spec.name === 'White Blood Cell Count') return clamp(gaussian(rand, 19500, 2500), 15000, 26000);
      if (spec.name === 'Lymphocytes') return clamp(gaussian(rand, 45, 5), 41, 54);
      return spec.base;
    case 'dehydration':
      if (spec.name === 'Hematocrit') return clamp(gaussian(rand, 53, 2), 50.5, 57);
      if (spec.name === 'Hemoglobin') return clamp(gaussian(rand, 16.8, 0.7), 15.6, 18);
      return spec.base;
    case 'normal':
    default:
      return spec.base;
  }
}

function isoDate(rand: () => number, index: number): string {
  // Deterministic spread across ~14 months so trend tests have real spacing.
  const day = Math.floor(rand() * 28) + 1;
  const monthOffset = Math.floor(index / 20) % 14;
  const d = new Date(Date.UTC(2025, 7 + monthOffset, day));
  return d.toISOString().slice(0, 10);
}

export function buildSyntheticCbcDataset(count: number, seed = 20260926): SyntheticCbcRecord[] {
  const rand = mulberry32(seed);
  const out: SyntheticCbcRecord[] = [];

  for (let i = 0; i < count; i += 1) {
    const sex: 'male' | 'female' = rand() > 0.5 ? 'male' : 'female';
    const ageYears = Math.floor(18 + rand() * 62);
    const scenario = scenarioFor(i);
    const layout = REPORT_LAYOUTS[i % REPORT_LAYOUTS.length]!;

    const results = ANALYTES.map((spec) => {
      const raw = applyScenario(spec, scenario, rand);
      const noise = spec.sd === 0 ? 0 : gaussian(rand, 0, spec.sd * 0.28);
      const value = round(clamp(raw + noise, spec.lo * 0.55, spec.hi * 1.45), spec.decimals);
      const flagged = value < spec.lo || value > spec.hi;
      return {
        name: spec.name,
        value,
        unit: spec.unit,
        displayRef: `${spec.lo.toLocaleString('en-US')} - ${spec.hi.toLocaleString('en-US')}`,
        flagged,
      };
    });

    out.push({
      synthetic: true,
      id: `SYN-CBC-${String(i + 1).padStart(4, '0')}`,
      layout,
      reportDate: isoDate(rand, i),
      sex,
      ageYears,
      results,
      scenario,
    });
  }

  return out;
}

// ── Text rendering ──────────────────────────────────────────────────────────

export interface GeneratedDocument {
  id: string;
  meta: {
    synthetic: true;
    recordId: string;
    layout: ReportLayoutId;
    scenario: SyntheticCbcRecord['scenario'];
    expectedReportType: string;
    expectedOutOfRange: string[];
  };
  text: string;
}

const withThousands = (n: number) => Math.round(n).toLocaleString('en-US');

function printedRef(spec: AnalyteSpec, decimals: number): [string, string] {
  return [
    spec.lo.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
    spec.hi.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
  ];
}

function findSpec(name: string): AnalyteSpec {
  return ANALYTES.find((a) => a.name === name)!;
}

/** OCR damage: digit/letter swaps, stray spacing, dropped characters. */
function degrade(text: string, rand: () => number): string {
  return text
    .split('')
    .map((ch) => {
      const roll = rand();
      if (roll > 0.985 && /\d/.test(ch)) {
        const swaps: Record<string, string> = { '0': 'O', '1': 'l', '5': 'S', '8': 'B', '6': 'G', '2': 'Z' };
        return swaps[ch] ?? ch;
      }
      if (roll > 0.99 && ch === ' ') return '  ';
      return ch;
    })
    .join('');
}

function headerBlock(r: SyntheticCbcRecord, rand: () => number, includePhone: boolean): string {
  const lab = pick(rand, FICTIONAL_LABS);
  const name = `${pick(rand, FICTIONAL_FIRST_NAMES)} ${pick(rand, FICTIONAL_LAST_NAMES)}`;
  const mm = r.reportDate.slice(5, 7);
  const dd = r.reportDate.slice(8, 10);
  const yyyy = r.reportDate.slice(0, 4);
  const lines = [
    lab,
    `UHID: SYN-${r.id.replace(/\D/g, '')}   Accession No: SYN-ACC-${r.id.replace(/\D/g, '')}`,
  ];
  // 555-0100..555-0199 is the block reserved for fictional use (NANP 555-01xx),
  // so the fixture can never collide with a real subscriber's number.
  if (includePhone) lines.push(`Phone: +1-555-0${100 + Math.floor(rand() * 90)}`);
  lines.push(
    `Patient Name: ${name}          Age/Sex: ${r.ageYears} / ${r.sex === 'male' ? 'Male' : 'Female'}`,
    `Referred By: ${pick(rand, FICTIONAL_DOCTORS)}`,
    `Sample Collected: ${dd}/${mm}/${yyyy}  ${String(Math.floor(rand() * 12) + 1).padStart(2, '0')}:${String(Math.floor(rand() * 60)).padStart(2, '0')} AM`,
    `Report Date: ${dd}-${mm}-${yyyy}`,
    'SYNTHETIC DEMO DATA - NOT A REAL PATIENT',
    '',
  );
  return lines.join('\n');
}

function rows(r: SyntheticCbcRecord): { printed: string; value: string; unit: string; ref: string; flag: string }[] {
  return r.results.map((res, i) => {
    const spec = findSpec(res.name);
    const [lo, hi] = printedRef(spec, spec.decimals);
    return {
      printed: spec.printed[Math.min(i % spec.printed.length, spec.printed.length - 1)]!,
      value:
        res.unit === '/µL' && spec.decimals === 0
          ? withThousands(res.value)
          : res.value.toLocaleString('en-US', { minimumFractionDigits: spec.decimals, maximumFractionDigits: spec.decimals }),
      unit: spec.unit,
      ref: `${lo} - ${hi}`,
      flag: res.flagged ? (res.value < spec.lo ? 'L' : 'H') : '',
    };
  });
}

export function renderReport(record: SyntheticCbcRecord, layout: ReportLayoutId, seed = 7): string {
  const rand = mulberry32(seed + Number(record.id.replace(/\D/g, '')) + layout.length);
  const head = headerBlock(record, rand, layout !== 'mobile_screenshot_text');
  const data = rows(record);
  const panelTitle = 'COMPLETE BLOOD COUNT (CBC) WITH DIFFERENTIAL';

  const table = (): string => {
    switch (layout) {
      case 'wide_table':
        return [
          panelTitle,
          'Test Name'.padEnd(30) + 'Result'.padStart(10) + 'Unit'.padStart(12) + 'Reference Range'.padStart(20) + '  Flag',
          ...data.map((d) =>
            d.printed.padEnd(30) +
            d.value.padStart(10) +
            d.unit.padStart(12) +
            d.ref.padStart(20) +
            (d.flag ? `   ${d.flag}` : '    '),
          ),
        ].join('\n');
      case 'colon_units':
        return [
          panelTitle,
          ...data.map((d) => `${d.printed}: ${d.value} ${d.unit} (Ref: ${d.ref})${d.flag ? ` ${d.flag}` : ''}`),
        ].join('\n');
      case 'bracketed_refs':
        return [
          panelTitle,
          ...data.map((d) => `${d.printed}  ${d.value} ${d.unit}  [${d.ref}]${d.flag ? `  ${d.flag}` : ''}`),
        ].join('\n');
      case 'pipe_columns':
        return [
          panelTitle,
          'TEST|VALUE|UNIT|REFERENCE RANGE|FLAG',
          ...data.map((d) => [d.printed, d.value, d.unit, d.ref, d.flag].join('|')),
        ].join('\n');
      case 'two_column_split':
        return [
          panelTitle,
          ...data.flatMap((d) => [`${d.printed}`, `  ${d.value} ${d.unit}   ${d.ref}${d.flag ? `  ${d.flag}` : ''}`]),
        ].join('\n');
      case 'lab_style_dense':
        return [
          panelTitle,
          `Test\tResult\tUnit\tBiological Ref.\tFlag`,
          ...data.map((d) => `${d.printed}\t${d.value}\t${d.unit}\t${d.ref}\t${d.flag}`),
          'Method: Automated analyser, EDTA whole blood',
        ].join('\n');
      case 'mobile_screenshot_text':
        return [
          panelTitle,
          ...data.map((d) => `${d.printed}  ${d.value}${d.unit}  (${d.ref})`),
        ].join('\n');
      case 'ocr_noisy':
      default: {
        const raw = [
          panelTitle,
          'Test Name       Result      Unit       Reference Range',
          ...data.map((d) => `${d.printed}  ${d.value}  ${d.unit}  ${d.ref}${d.flag ? ` ${d.flag}` : ''}`),
        ].join('\n');
        return degrade(raw, rand);
      }
    }
  };

  return `${head}${table()}\n\n-- End of report --\nConfidential: for doctor's use only.`;
}

export function buildSyntheticReportText(records: SyntheticCbcRecord[], seed = 7): GeneratedDocument[] {
  return records.map((r) => ({
    id: `${r.layout}-${r.id.toLowerCase()}`,
    meta: {
      synthetic: true,
      recordId: r.id,
      layout: r.layout,
      scenario: r.scenario,
      expectedReportType: 'cbc_with_diff',
      expectedOutOfRange: r.results.filter((x) => x.flagged).map((x) => x.name),
    },
    text: renderReport(r, r.layout, seed),
  }));
}
