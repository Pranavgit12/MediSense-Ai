/**
 * Unit handling for laboratory quantities.
 *
 * Two hard rules:
 *  1. We never silently convert a value between units. If a value is printed in
 *     mg/dL we keep it in mg/dL, because the reference range printed on the
 *     report belongs to that unit. Conversion is only ever offered explicitly,
 *     and the caller decides whether to use it.
 *  2. We only recognise units we have an explicit, reviewed mapping for.
 *     Unknown units are preserved verbatim and block automated range checking
 *     rather than being guessed at.
 *
 * Conversion factors are relative to a fixed base unit per dimension, named in
 * each section heading below. A conversion is
 * `value * from.factorToBase / to.factorToBase`.
 */

export interface UnitDefinition {
  /** Canonical symbol. */
  canonical: string;
  /** All accepted spellings, lowercased. */
  aliases: string[];
  /** Dimension, used to detect incompatible units. */
  dimension: Dimension;
  /** Multiplicative factor to the dimension's base unit. */
  factorToBase: number;
  /** True when higher values mean "more". */
  ascendingIsHigher: boolean;
  /** Plain-language description for a non-expert. Never empty. */
  plain: string;
}

export type Dimension =
  | 'mass_concentration'
  | 'cell_concentration'
  | 'volume'
  | 'time'
  | 'rate'
  | 'electrolyte_rate'
  | 'dimensionless'
  | 'substance_concentration'
  | 'enzyme_activity'
  | 'length'
  | 'mass'
  | 'pressure'
  | 'temperature';

export const UNIT_REGISTRY: UnitDefinition[] = [
  // ── Dimensionless / ratios ────────────────────────────────────────────────
  { canonical: '%', aliases: ['percent', 'pct'], dimension: 'dimensionless', factorToBase: 1, ascendingIsHigher: true, plain: 'a percentage out of 100' },

  // ── Mass concentration (base g/dL) ─────────────────────────────────────────
  // g/dL is the base because it is how haemoglobin-family analytes are reported.
  { canonical: 'g/dL', aliases: ['gm/dl', 'g/100ml', 'gm/100ml', 'g %', 'gm%', 'g/100 ml', 'gm/dl.'], dimension: 'mass_concentration', factorToBase: 1, ascendingIsHigher: true, plain: 'grams per decilitre — a decilitre is about a tenth of a litre' },
  { canonical: 'mg/dL', aliases: ['mg/100ml', 'mg %', 'mg/dl.'], dimension: 'mass_concentration', factorToBase: 1e-3, ascendingIsHigher: true, plain: 'milligrams per decilitre — a decilitre is about a tenth of a litre' },
  { canonical: 'g/L', aliases: ['gm/l', 'g/liter', 'g/litre'], dimension: 'mass_concentration', factorToBase: 1e-1, ascendingIsHigher: true, plain: 'grams per litre' },
  { canonical: 'mg/L', aliases: ['mg/liter', 'mg/litre'], dimension: 'mass_concentration', factorToBase: 1e-4, ascendingIsHigher: true, plain: 'milligrams per litre' },
  { canonical: 'ng/mL', aliases: ['ng/ml.'], dimension: 'mass_concentration', factorToBase: 1e-7, ascendingIsHigher: true, plain: 'nanograms per millilitre — a very small amount of protein' },

  // ── Substance concentration (base mmol/L) ─────────────────────────────────
  // mEq and mmol are numerically equal for the monovalent ions reported here
  // (Na, K, Cl, bicarbonate), which is why they share a dimension.
  { canonical: 'mmol/L', aliases: ['mmol/liter', 'mmol/litre', 'mmol/l.'], dimension: 'substance_concentration', factorToBase: 1, ascendingIsHigher: true, plain: 'millimoles per litre' },
  { canonical: 'mEq/L', aliases: ['meq/l.'], dimension: 'substance_concentration', factorToBase: 1, ascendingIsHigher: true, plain: 'milliequivalents per litre' },

  // ── Cell counts (base /µL) ────────────────────────────────────────────────
  // Note the mixed spellings below are deliberate and load-bearing:
  //  - `/µL` and `x10^12/L` are the spellings used by the generated datasets,
  //    which are asserted to already be canonical by scripts/verify-datasets.ts.
  //  - `10^3/uL` is pinned by the units test suite.
  // Renaming any of them means regenerating the datasets AND updating the test.
  { canonical: '/µL', aliases: ['/ul', '/µl', '/mm3', '/mm³', 'cumm', 'cmm3', 'cells/ul', 'per ul', 'per µl'], dimension: 'cell_concentration', factorToBase: 1, ascendingIsHigher: true, plain: 'cells per microlitre — a microlitre is roughly a small drop of blood' },
  { canonical: '10^3/uL', aliases: ['10*3/ul', '10*3/µl', '10^3/µl', 'k/ul', 'k/µl', 'x10^3/ul', 'x10*3/ul', '10^3/mm3'], dimension: 'cell_concentration', factorToBase: 1e3, ascendingIsHigher: true, plain: 'thousands of cells per microlitre — a microlitre is roughly a small drop of blood' },
  { canonical: 'x10^9/L', aliases: ['10^9/l', '10*9/l', 'x10^9/µl', 'x10*9/l', 'x109/l'], dimension: 'cell_concentration', factorToBase: 1e6, ascendingIsHigher: true, plain: 'billions of cells per litre' },
  { canonical: 'x10^12/L', aliases: ['10^12/l', '10*12/l'], dimension: 'cell_concentration', factorToBase: 1e9, ascendingIsHigher: true, plain: 'trillions of cells per litre' },

  // ── Volume (base L) ───────────────────────────────────────────────────────
  { canonical: 'L', aliases: ['l', 'litre', 'liter', 'l.'], dimension: 'volume', factorToBase: 1, ascendingIsHigher: true, plain: 'litres' },
  { canonical: 'dL', aliases: ['dl', 'decilitre', 'deciliter'], dimension: 'volume', factorToBase: 1e-1, ascendingIsHigher: true, plain: 'decilitres — a tenth of a litre' },
  { canonical: 'mL', aliases: ['ml', 'millilitre', 'milliliter', 'ml.'], dimension: 'volume', factorToBase: 1e-3, ascendingIsHigher: true, plain: 'millilitres' },
  { canonical: 'fL', aliases: ['fl', 'femtolitre', 'femtoliter', 'fl.'], dimension: 'volume', factorToBase: 1e-15, ascendingIsHigher: true, plain: 'femtolitres — a tiny fraction of a drop of water' },

  // ── Mass (base g) ─────────────────────────────────────────────────────────
  { canonical: 'kg', aliases: ['kilogram', 'kilograms'], dimension: 'mass', factorToBase: 1e3, ascendingIsHigher: true, plain: 'kilograms' },
  { canonical: 'g', aliases: ['gm', 'gram', 'grams'], dimension: 'mass', factorToBase: 1, ascendingIsHigher: true, plain: 'grams' },
  { canonical: 'mg', aliases: ['milligram', 'milligrams'], dimension: 'mass', factorToBase: 1e-3, ascendingIsHigher: true, plain: 'milligrams' },
  { canonical: 'µg', aliases: ['ug', 'mcg', 'microgram', 'micrograms'], dimension: 'mass', factorToBase: 1e-6, ascendingIsHigher: true, plain: 'micrograms' },
  { canonical: 'ng', aliases: ['nanogram', 'nanograms'], dimension: 'mass', factorToBase: 1e-9, ascendingIsHigher: true, plain: 'nanograms' },
  { canonical: 'pg', aliases: ['picogram', 'picograms', 'pg.'], dimension: 'mass', factorToBase: 1e-12, ascendingIsHigher: true, plain: 'picograms — about a trillionth of a gram' },

  // ── Length (base cm) ──────────────────────────────────────────────────────
  { canonical: 'm', aliases: ['meter', 'metre', 'm.'], dimension: 'length', factorToBase: 100, ascendingIsHigher: true, plain: 'metres' },
  { canonical: 'cm', aliases: ['centimeter', 'centimetre', 'centimetres', 'centimeters'], dimension: 'length', factorToBase: 1, ascendingIsHigher: true, plain: 'centimetres' },

  // ── Time (base seconds) ───────────────────────────────────────────────────
  { canonical: 'year', aliases: ['y', 'yr', 'yrs', 'year', 'years'], dimension: 'time', factorToBase: 31557600, ascendingIsHigher: true, plain: 'years' },
  { canonical: 'day', aliases: ['d', 'day', 'days'], dimension: 'time', factorToBase: 86400, ascendingIsHigher: true, plain: 'days' },
  { canonical: 'hr', aliases: ['h', 'hr', 'hrs', 'hour', 'hours'], dimension: 'time', factorToBase: 3600, ascendingIsHigher: true, plain: 'hours' },
  { canonical: 'min', aliases: ['mins', 'minute', 'minutes'], dimension: 'time', factorToBase: 60, ascendingIsHigher: true, plain: 'minutes' },
  { canonical: 'sec', aliases: ['s', 'secs', 'seconds', 'second'], dimension: 'time', factorToBase: 1, ascendingIsHigher: true, plain: 'seconds' },

  // ── Rates ─────────────────────────────────────────────────────────────────
  { canonical: 'mm/hr', aliases: ['mm/h', 'mm/1h', 'mm/1 hr'], dimension: 'rate', factorToBase: 1, ascendingIsHigher: true, plain: 'millimetres per hour' },
  { canonical: 'mEq/s', aliases: ['meq/sec'], dimension: 'electrolyte_rate', factorToBase: 1, ascendingIsHigher: true, plain: 'milliequivalents per second' },

  // ── Enzymes (base U/L) ────────────────────────────────────────────────────
  { canonical: 'U/L', aliases: ['u/l', 'iu/l', 'units/l', 'u/l.'], dimension: 'enzyme_activity', factorToBase: 1, ascendingIsHigher: true, plain: 'enzyme units per litre' },
  { canonical: 'U/mL', aliases: ['u/ml', 'iu/ml'], dimension: 'enzyme_activity', factorToBase: 1e3, ascendingIsHigher: true, plain: 'enzyme units per millilitre' },

  // ── Pressure (base mmHg) ──────────────────────────────────────────────────
  { canonical: 'mmHg', aliases: ['mm hg', 'mmhgs'], dimension: 'pressure', factorToBase: 1, ascendingIsHigher: true, plain: 'millimetres of mercury — the unit blood pressure is reported in' },
];

/** Units that are commonly OCR-confused. Used by the parser and by tests. */
export const UNIT_OCR_CONFUSIONS: Record<string, string> = {
  'ul': '/µL',
  'uL': '/µL',
  'fl': 'fL',
  'ug': 'µg',
  'ug/dl': 'µg/dL',
  'mcg': 'µg',
  'gm/dl': 'g/dL',
  'gms': 'g',
  'mm3': '/µL',
  'cmm3': '/µL',
  'cumm': '/µL',
  '10*3/ul': '10^3/uL',
  'x10*3/ul': '10^3/uL',
  '10*9/l': 'x10^9/L',
  'x10*9/l': 'x10^9/L',
  'iu/l': 'U/L',
  'ng/ml': 'ng/mL',
  'meq/l': 'mEq/L',
};

/**
 * Dimensions where a linear conversion would be clinically wrong, so we refuse
 * to offer one even when both units are recognised.
 */
const NON_LINEAR_DIMENSIONS: ReadonlySet<Dimension> = new Set<Dimension>(['temperature']);

let ALIAS_INDEX: Map<string, UnitDefinition> = new Map();

function normalizeUnitKey(raw: string): string {
  return raw
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/\s+/g, '')
    .replace(/\.$/, '')
    .trim()
    .toLowerCase();
}

function buildAliasIndex(): void {
  const m = new Map<string, UnitDefinition>();
  for (const def of UNIT_REGISTRY) {
    m.set(normalizeUnitKey(def.canonical), def);
    for (const a of def.aliases) m.set(normalizeUnitKey(a), def);
  }
  ALIAS_INDEX = m;
}

export function lookupUnit(raw: string | null | undefined): UnitDefinition | null {
  if (ALIAS_INDEX.size === 0) buildAliasIndex();
  if (!raw) return null;
  const cleaned = normalizeUnitKey(raw);
  if (!cleaned) return null;

  const direct = ALIAS_INDEX.get(cleaned);
  if (direct) return direct;

  // OCR corrections win over the alias table, but only when the corrected form
  // is itself a unit we recognise.
  for (const [bad, good] of Object.entries(UNIT_OCR_CONFUSIONS)) {
    if (normalizeUnitKey(bad) !== cleaned) continue;
    const target = lookupUnit(good);
    if (target) return target;
  }
  return null;
}

export function canonicalUnit(raw: string | null | undefined): string | null {
  const def = lookupUnit(raw);
  return def ? def.canonical : raw && raw.trim() ? raw.trim() : null;
}

/**
 * True when two units may be compared, or one converted into the other.
 *
 * Deliberately permissive: an unknown or missing unit is never reported as a
 * *mismatch*, because that would make us block a comparison the caller can
 * still reason about. The caller decides what to do with an unknown unit.
 *
 * When both sides are known we require the same dimension, and that the ratio
 * between their conversion factors is 1 or an exact power of 1000. That admits
 * a pure metric relabeling (mg/dL -> g/L is *not* one, and is refused) while
 * rejecting a mixed prefix-plus-denominator rescaling, which is the shape of
 * the classic factor-of-100 report error.
 */
export function areUnitsCompatible(a: string | null, b: string | null): boolean {
  const da = lookupUnit(a);
  const db = lookupUnit(b);
  if (!da || !db) return true;
  if (da.dimension !== db.dimension) return false;
  return isPowerOfThousand(da.factorToBase / db.factorToBase);
}

function isPowerOfThousand(ratio: number): boolean {
  if (!Number.isFinite(ratio) || ratio <= 0) return false;
  const exponent = Math.log10(ratio);
  return Math.abs(exponent - Math.round(exponent / 3) * 3) < 1e-9;
}

export interface ConversionResult {
  /** The value expressed in `to`. */
  value: number;
  /** False when both units were already the same, so nothing was applied. */
  converted: boolean;
}

/**
 * Convert a value between two units of the same dimension.
 *
 * Returns null when the conversion is not safe: mismatched dimensions, an
 * unrecognised unit, or a dimension where a linear conversion would be wrong.
 */
export function convertValue(
  value: number,
  from: string,
  to: string,
): ConversionResult | null {
  const df = lookupUnit(from);
  const dt = lookupUnit(to);
  if (!df || !dt) return null;
  if (df.dimension !== dt.dimension) return null;
  if (NON_LINEAR_DIMENSIONS.has(df.dimension)) return null;
  if (df.factorToBase === dt.factorToBase) return { value, converted: false };
  return { value: (value * df.factorToBase) / dt.factorToBase, converted: true };
}

/** Human-readable, deterministic phrase for a unit. */
export function describeUnit(unit: string | null): string {
  const def = lookupUnit(unit);
  if (def) return def.plain;
  if (unit && unit.trim()) return `the unit printed on the report (${unit.trim()})`;
  return 'no unit was printed on the report';
}
