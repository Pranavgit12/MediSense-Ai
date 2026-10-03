import { describe, expect, it } from 'vitest';
import {
  determineStatus,
  extractFlag,
  extractReferenceRange,
  isAttentionStatus,
  isNonAnalyteLine,
  parseNumeric,
  repairNumericToken,
  statusPhrase,
  type StatusInput,
} from '../src/medical/report-parser';

/**
 * Safety-contract tests for lab interpretation. A regression here can tell a
 * patient their results are fine when they are not, or vice versa, so these
 * assertions are deliberately strict about the failure direction.
 */
const range = (over: Partial<StatusInput> = {}): StatusInput => ({
  value: 14,
  referenceLow: 13,
  referenceHigh: 17,
  reportedFlag: null,
  ...over,
});

describe('determineStatus', () => {
  it('reports normal for a value inside the printed interval', () => {
    expect(determineStatus(range()).status).toBe('normal');
  });

  it('reports low and high from the printed interval', () => {
    expect(determineStatus(range({ value: 11 })).status).toBe('low');
    expect(determineStatus(range({ value: 20 })).status).toBe('high');
  });

  it('treats a value exactly on a boundary as normal', () => {
    expect(determineStatus(range({ value: 13 })).status).toBe('normal');
    expect(determineStatus(range({ value: 17 })).status).toBe('normal');
  });

  it('returns unknown when no interval and no flag are available', () => {
    expect(
      determineStatus({ value: 14, referenceLow: null, referenceHigh: null, reportedFlag: null }).status,
    ).toBe('unknown');
  });

  it('returns unknown for a non-finite value instead of guessing', () => {
    expect(determineStatus(range({ value: Number.NaN })).status).toBe('unknown');
  });

  describe('critical statuses are only ever inherited from the lab', () => {
    it('adopts critical_low from a printed LL flag', () => {
      expect(determineStatus(range({ value: 5, reportedFlag: 'LL' })).status).toBe('critical_low');
    });

    it('adopts critical_high from a printed HH flag', () => {
      expect(determineStatus(range({ value: 30, reportedFlag: 'HH' })).status).toBe('critical_high');
    });

    it('never invents critical_low from a large deviation alone', () => {
      // A very large deviation with no LL flag must stay "low". Claiming a
      // value is critical on our own authority is an unverified clinical claim.
      const r = determineStatus(range({ value: 1, reportedFlag: null }));
      expect(r.status).toBe('low');
      expect(r.status).not.toBe('critical_low');
    });

    it('never invents critical_high from a large deviation alone', () => {
      const r = determineStatus(range({ value: 60, reportedFlag: null }));
      expect(r.status).toBe('high');
      expect(r.status).not.toBe('critical_high');
    });

    it('does not report critical with no printed interval to interpret', () => {
      // Without a range there is nothing to be "critical" relative to.
      const r = determineStatus({ value: 5, referenceLow: null, referenceHigh: null, reportedFlag: 'LL' });
      expect(r.status).toBe('unknown');
      expect(r.status).not.toBe('critical_low');
    });
  });

  describe('never contradicts the issuing lab', () => {
    it('does not report normal when the lab printed LL but the value looks in range', () => {
      const r = determineStatus(range({ value: 14, reportedFlag: 'LL' }));
      expect(r.status).toBe('critical_low');
    });

    it('does not report normal when the lab printed HH but the value looks in range', () => {
      const r = determineStatus(range({ value: 14, reportedFlag: 'HH' }));
      expect(r.status).toBe('critical_high');
    });

    it('honours a printed L flag even when the value looks in range', () => {
      expect(determineStatus(range({ value: 14, reportedFlag: 'L' })).status).toBe('low');
    });

    it('honours a printed H flag even when the value looks in range', () => {
      expect(determineStatus(range({ value: 14, reportedFlag: 'H' })).status).toBe('high');
    });

    it('suppresses a meaningless deviation when it trusts a flag over the range', () => {
      expect(determineStatus(range({ value: 14, reportedFlag: 'LL' })).deviation).toBeNull();
    });
  });

  it('handles a one-sided minimum-only interval', () => {
    expect(determineStatus({ value: 40, referenceLow: 40, referenceHigh: null, reportedFlag: null }).status).toBe(
      'normal',
    );
    expect(determineStatus({ value: 10, referenceLow: 40, referenceHigh: null, reportedFlag: null }).status).toBe(
      'low',
    );
  });

  it('handles a one-sided ceiling-only interval', () => {
    expect(determineStatus({ value: 100, referenceLow: null, referenceHigh: 200, reportedFlag: null }).status).toBe(
      'normal',
    );
    expect(determineStatus({ value: 400, referenceLow: null, referenceHigh: 200, reportedFlag: null }).status).toBe(
      'high',
    );
  });

  it('expresses deviation as a signed fraction of the range span', () => {
    expect(determineStatus(range({ value: 11 })).deviation).toBeCloseTo(-0.5, 5);
    expect(determineStatus(range({ value: 19 })).deviation).toBeCloseTo(0.5, 5);
    expect(determineStatus(range()).deviation).toBe(0);
  });
});

describe('extractFlag', () => {
  it('recognises every flag a lab can print', () => {
    expect(extractFlag('Hemoglobin 11.2 g/dL L').flag).toBe('L');
    expect(extractFlag('Hemoglobin 19.2 g/dL H').flag).toBe('H');
    expect(extractFlag('Platelets 12 /uL LL').flag).toBe('LL');
    expect(extractFlag('Platelets 900 /uL HH').flag).toBe('HH');
    expect(extractFlag('Sodium 140 mmol/L N').flag).toBe('N');
  });

  it('is case insensitive, because some labs print lowercase flags', () => {
    expect(extractFlag('Hemoglobin 11.2 g/dL l').flag).toBe('L');
    expect(extractFlag('Platelets 12 /uL ll').flag).toBe('LL');
  });

  it('reads a flag in a pipe-column layout', () => {
    expect(extractFlag('Hemoglobin | 11.2 | g/dL | L').flag).toBe('L');
  });

  it('removes the flag from the returned line', () => {
    expect(extractFlag('Hemoglobin 11.2 g/dL L').rest).toBe('Hemoglobin 11.2 g/dL');
  });

  it('does not treat a unit as a flag', () => {
    // A trailing "L" in "mmol/L" or "U/L" is a unit, not a flag.
    expect(extractFlag('Sodium 140 mmol/L').flag).toBeNull();
    expect(extractFlag('ALT 55 U/L').flag).toBeNull();
  });

  it('does not treat a trailing percent or digit as a flag', () => {
    expect(extractFlag('Hematocrit 45 %').flag).toBeNull();
    expect(extractFlag('Platelets 250').flag).toBeNull();
  });

  it('requires the flag to be the final token', () => {
    expect(extractFlag('L Hemoglobin 11.2 g/dL').flag).toBeNull();
  });
});

describe('extractReferenceRange', () => {
  it('reads a two-sided range', () => {
    const { reference } = extractReferenceRange('Hemoglobin 14.2 g/dL 13.5 - 17.5');
    expect(reference).not.toBeNull();
    expect(reference?.low).toBe(13.5);
    expect(reference?.high).toBe(17.5);
    expect(reference?.form).toBe('range');
  });

  it('reads an en-dash range', () => {
    const { reference } = extractReferenceRange('Hemoglobin 14.2 g/dL 13.5 \u2013 17.5');
    expect(reference?.low).toBe(13.5);
    expect(reference?.high).toBe(17.5);
  });

  it('swaps an OCR-reversed range rather than emitting low > high', () => {
    const { reference } = extractReferenceRange('Hemoglobin 14.2 g/dL 17.5 - 13.5');
    expect(reference?.low).toBe(13.5);
    expect(reference?.high).toBe(17.5);
  });

  it('reads a one-sided ceiling and reports it as less_than', () => {
    const { reference } = extractReferenceRange('Total Cholesterol 180 mg/dL < 200');
    expect(reference?.low).toBeNull();
    expect(reference?.high).toBe(200);
    expect(reference?.form).toBe('less_than');
  });

  it('reads a one-sided floor and reports it as greater_than', () => {
    const { reference } = extractReferenceRange('Calcium 8.1 mg/dL > 7.0');
    expect(reference?.low).toBe(7.0);
    expect(reference?.high).toBeNull();
    expect(reference?.form).toBe('greater_than');
  });

  it('does not invert the direction of a one-sided bound', () => {
    // Regression: ">" used to match the "less than" branch, turning a printed
    // floor into a ceiling. That flagged a normal calcium of 8.1 as HIGH.
    const floor = extractReferenceRange('Calcium 8.1 mg/dL > 7.0').reference;
    expect(floor?.form).toBe('greater_than');
    expect(floor?.low).toBe(7.0);

    const ceiling = extractReferenceRange('Calcium 8.1 mg/dL < 10.5').reference;
    expect(ceiling?.form).toBe('less_than');
    expect(ceiling?.high).toBe(10.5);

    // The value is above the printed floor, so it must be in range.
    expect(
      determineStatus({ value: 8.1, referenceLow: floor?.low ?? null, referenceHigh: null, reportedFlag: null })
        .status,
    ).toBe('normal');
  });

  it('handles an unspaced one-sided bound', () => {
    const { reference } = extractReferenceRange('Sodium 140 mmol/L >135');
    expect(reference?.form).toBe('greater_than');
    expect(reference?.low).toBe(135);
  });

  it('reads a bracketed range and leaves no residue in the line', () => {
    const { reference, rest } = extractReferenceRange('Hemoglobin 14.2 g/dL [13.5 - 17.5]');
    expect(reference?.low).toBe(13.5);
    expect(rest).not.toMatch(/13\.5|17\.5/);
  });

  it('does not treat a phone number as a reference range', () => {
    // A 10-digit number can split as a bogus 3/4-digit "range".
    expect(extractReferenceRange('Phone: 080-4279040').reference).toBeNull();
  });

  it('does not treat a date as a reference range', () => {
    // "12-05-2020" must not yield an interval of 5-12.
    expect(extractReferenceRange('Collected: 12-05-2020').reference).toBeNull();
  });

  it('does not treat an accession number as a reference range', () => {
    expect(extractReferenceRange('Accession No: 1234567890').reference).toBeNull();
  });

  it('still accepts an unspaced interval, for OCR resilience', () => {
    const { reference } = extractReferenceRange('Hemoglobin 14.2 g/dL 13.5-17.5');
    expect(reference?.low).toBe(13.5);
    expect(reference?.high).toBe(17.5);
  });

  it('does not invent a range from a bare number', () => {
    expect(extractReferenceRange('Hemoglobin 14.2 g/dL').reference).toBeNull();
  });

  it('recognises a textual result such as Negative', () => {
    const { reference } = extractReferenceRange('Urine glucose: Negative');
    expect(reference?.form).toBe('textual');
  });
});

describe('parseNumeric', () => {
  it('strips thousands separators', () => {
    expect(parseNumeric('11,000')).toBe(11000);
    expect(parseNumeric('150,000')).toBe(150000);
  });

  it('handles Indian digit grouping', () => {
    expect(parseNumeric('1,20,000')).toBe(120000);
  });

  it('handles a leading decimal point', () => {
    expect(parseNumeric('.72')).toBe(0.72);
  });

  it('handles a trailing decimal point', () => {
    expect(parseNumeric('14.')).toBe(14);
  });

  it('handles a leading minus sign', () => {
    expect(parseNumeric('-3.2')).toBe(-3.2);
  });

  it('strips comparison operators and scientific notation', () => {
    expect(parseNumeric('<400')).toBe(400);
    expect(parseNumeric('1.5e3')).toBe(1500);
  });

  it('returns null for text rather than coercing it to a number', () => {
    expect(parseNumeric('Negative')).toBeNull();
    expect(parseNumeric('')).toBeNull();
    expect(parseNumeric('   ')).toBeNull();
  });
});

describe('repairNumericToken', () => {
  it('repairs the O-for-0 confusion OCR produces, preserving grouping', () => {
    expect(repairNumericToken('1O,OOO')).toBe('10,000');
  });

  it('repairs a decimal comma read from a decimal point', () => {
    expect(repairNumericToken('14,2')).toBe('14.2');
  });

  it('leaves a thousands separator alone', () => {
    expect(repairNumericToken('11,000')).toBe('11,000');
  });

  it('leaves a real analyte name untouched', () => {
    // "SODIUM" contains only characters in the OCR alphabet; it must not be
    // mangled into digits.
    expect(repairNumericToken('SODIUM')).toBe('SODIUM');
    expect(repairNumericToken('Bilirubin')).toBe('Bilirubin');
  });

  it('leaves a token with no digits at all untouched', () => {
    expect(repairNumericToken('Negative')).toBe('Negative');
  });
});

describe('isAttentionStatus', () => {
  it('treats every out-of-range and critical status as attention-worthy', () => {
    expect(isAttentionStatus('low')).toBe(true);
    expect(isAttentionStatus('high')).toBe(true);
    expect(isAttentionStatus('critical_low')).toBe(true);
    expect(isAttentionStatus('critical_high')).toBe(true);
  });

  it('does not treat normal or unknown as attention-worthy', () => {
    expect(isAttentionStatus('normal')).toBe(false);
    expect(isAttentionStatus('unknown')).toBe(false);
  });
});

describe('statusPhrase', () => {
  it('uses no alarming language for a normal result', () => {
    expect(statusPhrase('normal', true).toLowerCase()).not.toMatch(
      /critical|danger|severe|alarm|emergency|urgent/i,
    );
  });

  it('says plainly when no reference range was printed', () => {
    expect(statusPhrase('unknown', false)).toMatch(/did not print a reference range/i);
  });

  it('distinguishes a critical result from a merely out-of-range one', () => {
    expect(statusPhrase('critical_high', true)).not.toBe(statusPhrase('high', true));
  });
});

describe('isNonAnalyteLine', () => {
  it.each([
    'Page 1 of 2',
    'Printed on: 2026-01-02',
    'Phone: 080-4279040',
    'Name: Jane Doe',
    'Sample: Whole blood',
    'Comments: Please note',
    'https://example.com/report',
    'CONFIDENTIAL - FOR DOCTOR USE ONLY',
    '-------------------------------------',
  ])('rejects header/metadata line %j', (line) => {
    expect(isNonAnalyteLine(line)).toBe(true);
  });

  it('keeps a real analyte line', () => {
    expect(isNonAnalyteLine('Hemoglobin 14.2 g/dL 13.5 - 17.5')).toBe(false);
    expect(isNonAnalyteLine('WBC 6.2 10^3/uL 4.0 - 11.0')).toBe(false);
  });
});
