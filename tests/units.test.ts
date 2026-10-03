import { describe, expect, it } from 'vitest';
import {
  areUnitsCompatible,
  canonicalUnit,
  convertValue,
  describeUnit,
  lookupUnit,
  UNIT_REGISTRY,
} from '../src/medical/units';

describe('lookupUnit', () => {
  it('resolves a unit to its canonical form', () => {
    expect(lookupUnit('g/dL')?.canonical).toBe('g/dL');
    expect(lookupUnit('fL')?.canonical).toBe('fL');
  });

  it('is case insensitive', () => {
    expect(lookupUnit('G/DL')?.canonical).toBe('g/dL');
    expect(lookupUnit('MG/DL')?.canonical).toBe('mg/dL');
  });

  it('tolerates surrounding whitespace and non-breaking spaces', () => {
    expect(lookupUnit('  mg/dL  ')?.canonical).toBe('mg/dL');
    expect(lookupUnit('\u00a0mg/dL\u00a0')?.canonical).toBe('mg/dL');
  });

  it('returns null for an unknown or empty unit rather than guessing', () => {
    expect(lookupUnit('furlongs')).toBeNull();
    expect(lookupUnit('')).toBeNull();
    expect(lookupUnit(null)).toBeNull();
    expect(lookupUnit(undefined)).toBeNull();
  });
});

describe('canonicalUnit', () => {
  it('resolves the common lab spellings', () => {
    expect(canonicalUnit('10*3/uL')).toBe('10^3/uL');
    expect(canonicalUnit('10^3/uL')).toBe('10^3/uL');
    expect(canonicalUnit('K/uL')).toBe('10^3/uL');
    expect(canonicalUnit('%')).toBe('%');
  });

  it('preserves a unit it does not recognise instead of dropping it', () => {
    // Losing the unit would silently break range comparison downstream.
    expect(canonicalUnit('mIU/L')).toBe('mIU/L');
  });

  it('returns null only for genuinely absent input', () => {
    expect(canonicalUnit(null)).toBeNull();
    expect(canonicalUnit('   ')).toBeNull();
  });
});

describe('areUnitsCompatible', () => {
  it('accepts two spellings of the same unit', () => {
    expect(areUnitsCompatible('10*3/uL', '10^3/uL')).toBe(true);
    expect(areUnitsCompatible('g/dL', 'G/dL')).toBe(true);
  });

  it('rejects different dimensions', () => {
    expect(areUnitsCompatible('g/dL', 'fL')).toBe(false);
    expect(areUnitsCompatible('g/dL', '%')).toBe(false);
  });

  it('accepts a pure metric relabeling but refuses a mixed rescaling', () => {
    // g/dL -> mg/dL is a clean 1000x prefix change, so it is safe to relate.
    expect(areUnitsCompatible('g/dL', 'mg/dL')).toBe(true);
    // mg/dL -> g/L mixes a 1000x prefix change with a 10x denominator change.
    // That is the shape of the classic factor-of-100 report error, so we refuse.
    expect(areUnitsCompatible('mg/dL', 'g/L')).toBe(false);
  });

  it('is permissive when either side is unknown, so it never blocks a comparison', () => {
    // A missing unit must not be reported as a *mismatch*; the caller decides.
    expect(areUnitsCompatible(null, 'g/dL')).toBe(true);
    expect(areUnitsCompatible('g/dL', null)).toBe(true);
    expect(areUnitsCompatible(null, null)).toBe(true);
  });

  it('accepts units that are convertible within the same dimension', () => {
    expect(areUnitsCompatible('10^3/uL', 'x10^9/L')).toBe(true);
    expect(areUnitsCompatible('U/L', 'U/mL')).toBe(true);
  });
});

describe('convertValue', () => {
  it('converts between compatible units', () => {
    // 1 mg/dL = 10 mg/L.
    const r = convertValue(1, 'mg/dL', 'mg/L');
    expect(r).not.toBeNull();
    expect(r?.value).toBeCloseTo(10, 9);
  });

  it('converts to a coarser prefix', () => {
    // 1 g/dL = 1000 mg/dL.
    const r = convertValue(1, 'g/dL', 'mg/dL');
    expect(r?.value).toBeCloseTo(1000, 9);
  });

  it('returns a null result rather than guessing for an unknown unit', () => {
    expect(convertValue(1, 'g/dL', 'furlongs')).toBeNull();
  });

  it('reports whether a conversion was actually applied', () => {
    const r = convertValue(5, 'mg/dL', 'g/L');
    expect(r?.converted).toBe(true);
    const same = convertValue(5, 'mg/dL', 'mg/dL');
    expect(same?.converted).toBe(false);
    expect(same?.value).toBe(5);
  });
});

describe('describeUnit', () => {
  it('spells a unit out in plain language for a non-expert', () => {
    const d = describeUnit('10^3/uL').toLowerCase();
    expect(d).toMatch(/thousand|cells|micro/);
  });

  it('degrades gracefully for an unknown or absent unit', () => {
    expect(describeUnit(null)).toBeTypeOf('string');
    expect(describeUnit('zorks')).toBeTypeOf('string');
  });
});

describe('UNIT_REGISTRY', () => {
  it('has no duplicate canonical units', () => {
    const seen = new Set<string>();
    for (const u of UNIT_REGISTRY) {
      expect(seen.has(u.canonical)).toBe(false);
      expect(u.canonical).toMatch(/\S/);
      seen.add(u.canonical);
    }
  });

  it('gives every unit a non-empty plain-language description', () => {
    for (const u of UNIT_REGISTRY) {
      expect(u.plain.length, `${u.canonical} needs a description`).toBeGreaterThan(0);
    }
  });
});
