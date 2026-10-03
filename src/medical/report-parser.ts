/**
 * Deterministic laboratory report parser.
 *
 * This module contains NO model calls. It is a rules-based text parser and it is
 * the only component permitted to produce numeric values, units and reference
 * ranges. That is what makes "the LLM never invents a reference range" an
 * architectural guarantee rather than a prompt instruction.
 *
 * Everything it cannot parse is surfaced in `ParsedReport.unparsed` rather than
 * guessed at. Failing safely is the default.
 */

import {
  PROVENANCE,
  type LabResult,
  type ParsedReport,
  type Provenance,
  type ReportHeader,
  type ReportType,
  type ResultStatus,
  type ReportedFlag,
  type UnparsedLine,
} from '../types/medical';
import { canonicalUnit, describeUnit } from './units';
import {
  CBC_CORE_TESTS,
  makeResultKey,
  normalizeTestName,
  termLookupCandidates,
} from './terminology';

export const PARSER_VERSION = 'report-parser/1.3.0';
export const TERMINOLOGY_VERSION = 'terminology/1.0.0';
export const SAFETY_VERSION = 'safety-rules/1.0.0';

// ── Text normalisation ──────────────────────────────────────────────────────

const NBSP = /[\u00a0\u2009\u202f\u205f\u3000]/g;

export function collapseWhitespace(input: string): string {
  return input.replace(NBSP, ' ').replace(/\t/g, '  ').replace(/[ ]{2,}/g, ' ').trim();
}

const OCR_CHAR_FIXES: Record<string, string> = {
  O: '0',
  o: '0',
  D: '0',
  l: '1',
  I: '1',
  i: '1',
  S: '5',
  s: '5',
  B: '8',
  Z: '2',
  G: '6',
};

/**
 * Repair digits damaged by OCR. Only applied when the token is clearly numeric
 * overall, so a real analyte name like "SODIUM" is never mangled.
 */
export function repairNumericToken(token: string): string {
  if (!/\d/.test(token)) return token;
  if (!/^[0-9OolIiSsBZG,./\-\s]+$/.test(token)) return token;

  const digitish = (token.match(/[0-9OolIiSsBZG,./\-\s]/g) ?? []).length;
  const digits = (token.match(/\d/g) ?? []).length;
  if (digits === digitish) return token; // already all digits/punctuation

  let out = '';
  for (const ch of token) out += OCR_CHAR_FIXES[ch] ?? ch;

  // "10,2" (decimal comma) -> "10.2" ; "1,200" / "1,20,000" (grouping) unchanged.
  if (!out.includes('.') && (out.match(/,/g) ?? []).length === 1) {
    const [, tail = ''] = out.split(',');
    if (tail.length >= 1 && tail.length <= 2) out = out.replace(',', '.');
  }
  return out;
}

/** Parse a numeric token (with OCR repair) into a JS number, or null. */
export function parseNumeric(raw: string): number | null {
  const trimmed = raw.trim().replace(/[<>≤≥=]/g, '').trim();
  if (!trimmed) return null;
  const repaired = repairNumericToken(trimmed);
  // 7,200 -> 7200 ; 1,20,000 -> 120000 (Indian grouping)
  const cleaned = repaired.replace(/,(?=\d{3}\b)/g, '').replace(/,(?=\d{2}\b)(?=\D*$)/g, '');
  // A trailing decimal point is a common OCR artefact: "14." means 14.
  const withoutTrailingDot = /^-?\d+\.$/.test(cleaned) ? cleaned.slice(0, -1) : cleaned;
  const stripped = withoutTrailingDot.replace(/,/g, '');
  if (!/^-?\d*\.?\d+(?:[eE][-+]?\d+)?$/.test(stripped)) return null;
  const n = Number.parseFloat(stripped);
  return Number.isFinite(n) ? n : null;
}

/** Render a number the way it appeared, and a display form. */
export function displayNumber(n: number, maxDecimals = 2): string {
  if (Number.isInteger(n)) return n.toLocaleString('en-US');
  return n.toLocaleString('en-US', { maximumFractionDigits: maxDecimals });
}

// ── Reference range extraction ──────────────────────────────────────────────

export interface ExtractedReference {
  low: number | null;
  high: number | null;
  raw: string;
  /** "range" | "less_than" | "greater_than" | "about" | "textual" */
  form: 'range' | 'less_than' | 'greater_than' | 'textual';
}

const DASHES = '‐‑‒–—―−-';
const DASH_CHARS = new RegExp(`[${DASHES}]`);
const DASH_CLASS = `[${DASHES}]`;

/** Find and remove a reference interval from a line. */
export function extractReferenceRange(
  line: string,
): { reference: ExtractedReference | null; rest: string } {
  const patterns: { re: RegExp; form: ExtractedReference['form'] }[] = [
    // 13.0 - 17.0 g/dL  /  13 – 17  /  12.5 to 18
    {
      re: new RegExp(
        `(?<lo>[<>≤≥]{0,2}\\s*-?\\d[\\d,.]*)\\s*${DASH_CLASS}\\s*(?:to\\s*)?(?<hi>[<>≤≥]{0,2}\\s*-?\\d[\\d,.]*)`,
      ),
      form: 'range',
    },
    // < 5  /  <=400  /  ≤ 0.5
    { re: /(?<hi>[<≤]{1,2}\s*-?\d[\d,]*(?:\.\d+)?)/, form: 'less_than' },
    // > 400  /  ≥ 100
    { re: /(?<lo>[>≥]{1,2}\s*-?\d[\d,]*(?:\.\d+)?)/, form: 'greater_than' },
    // up to 200
    { re: /(?:up\s*to|less\s*than|below)\s*(?<hi>-?\d[\d,]*(?:\.\d+)?)/i, form: 'less_than' },
    // "(Ref: 13 - 17)" already covered above; "Ref range 130-180"
    // about / approx  (rare, but some reports use it)
    { re: /(?:approx|about|~)\s*(?<hi>-?\d[\d,]*(?:\.\d+)?)/i, form: 'range' },
  ];

  for (const { re, form } of patterns) {
    const m = re.exec(line);
    if (!m || m.index === undefined) continue;
    const raw = m[0].trim();
    // A bare single number is not a reference range.
    if (form === 'range' && !DASH_CHARS.test(raw)) continue;
    // A hyphen-joined digit group is far more often a phone number, a date, or
    // an accession number than a reference interval. Reject it before it can
    // become a bogus range.
    if (isIdentifierLikeRange(line, m.index, m[0].length)) continue;

    const groups = m.groups ?? {};
    const loRaw = groups.lo;
    const hiRaw = groups.hi;

    const lo = loRaw ? parseNumeric(loRaw) : null;
    const hi = hiRaw ? parseNumeric(hiRaw) : null;

    if (form === 'range') {
      // Handle "80-100" written backwards by OCR.
      let a = lo;
      let b = hi;
      if (a !== null && b !== null && a > b) [a, b] = [b, a];
      return { reference: { low: a, high: b, raw, form }, rest: removeSpan(line, m.index, m[0].length) };
    }
    if (form === 'less_than') {
      if (hi === null) continue;
      return {
        reference: { low: null, high: hi, raw, form },
        rest: removeSpan(line, m.index, m[0].length),
      };
    }
    if (form === 'greater_than') {
      if (lo === null) continue;
      return {
        reference: { low: lo, high: null, raw, form },
        rest: removeSpan(line, m.index, m[0].length),
      };
    }
  }

  // Textual: Negative / Not detected / Nil
  const textual = /\b(negative|not detected|non\s*reactive|nil|none\s*detected|not\s*seen)\b/i.exec(line);
  if (textual && textual.index !== undefined) {
    return {
      reference: { low: null, high: null, raw: textual[0], form: 'textual' },
      rest: removeSpan(line, textual.index, textual[0].length),
    };
  }

  return { reference: null, rest: line };
}

function removeSpan(line: string, index: number, length: number): string {
  return (line.slice(0, index) + ' ' + line.slice(index + length)).replace(/\s+/g, ' ').trim();
}

/**
 * Decide whether a digit group joined by a dash is an identifier rather than a
 * reference interval.
 *
 * Real laboratory intervals are written with space around the dash ("13.5 -
 * 17.5"), whereas phone numbers ("080-4279040"), dates ("12-05-2020") and
 * accession numbers are not. We accept an unspaced interval for OCR resilience
 * only when the digit count is small enough to plausibly be a real range.
 */
function isIdentifierLikeRange(line: string, index: number, length: number): boolean {
  const before = line.slice(0, index);
  const after = line.slice(index + length);
  const paddedOnBothSides = /\s$/.test(before) && /^\s/.test(after);
  if (paddedOnBothSides) return false;

  const digits = (line.slice(index, index + length).match(/\d/g) ?? []).length;
  if (digits >= 7) return true;

  // The match is one segment of a longer chain, e.g. "12-05" inside "12-05-2020".
  if (/^\s*[-/.]\s*\d/.test(after)) return true;
  if (/\d\s*[-/.]$/.test(before)) return true;

  return false;
}

// ── Value + unit extraction ─────────────────────────────────────────────────

export interface ExtractedValue {
  raw: string;
  value: number | null;
  unit: string | null;
  /** Leading comparator printed on the result itself, e.g. ">400". */
  comparator: '<' | '>' | '<=' | '>=' | null;
  /** Textual result such as "Negative". */
  textual: string | null;
}

const VALUE_WITH_UNIT =
  /^(?<name>[A-Za-z][A-Za-z0-9 ()[\]\-/'’.,%^_+0-9]*?)\s*[::=]?\s*(?<cmp>[<>≤≥]{1,2})?\s*(?<value>-?\d[\d,]*\.?\d*)\s*(?<unit>[^\d].*)?$/;

const VALUE_ONLY = /^(?<name>[A-Za-z][A-Za-z0-9 ()[\]\-/'’.,%^_+0-9]*?)\s*[::=]?\s*(?<cmp>[<>≤≥]{1,2})?\s*(?<value>-?\d[\d,]*\.?\d*)\s*$/;

const TEXTUAL_VALUE =
  /^(?<name>[A-Za-z][A-Za-z0-9 ()[\]\-/'’.,%^_+0-9]*?)\s*[::=]\s*(?<text>negative|positive|not\s*detected|non\s*reactive|nil|detected|reactive|normal|abnormal)\s*$/i;

export function extractValueAndUnit(
  line: string,
): { name: string; extracted: ExtractedValue } | null {
  const textual = TEXTUAL_VALUE.exec(line.trim());
  if (textual?.groups) {
    return {
      name: collapseWhitespace(textual.groups.name ?? ''),
      extracted: {
        raw: textual.groups.text ?? '',
        value: null,
        unit: null,
        comparator: null,
        textual: collapseWhitespace(textual.groups.text ?? ''),
      },
    };
  }

  const m = VALUE_WITH_UNIT.exec(line.trim()) ?? VALUE_ONLY.exec(line.trim());
  if (!m?.groups) return null;

  const name = collapseWhitespace(m.groups.name ?? '');
  if (!name || name.length > 80) return null;

  const rawValue = m.groups.value ?? '';
  const unitRaw = collapseWhitespace(m.groups.unit ?? '');
  const comparatorRaw = m.groups.cmp ?? null;
  const comparator = comparatorRaw
    ? comparatorRaw.includes('≤')
      ? '<='
      : comparatorRaw.includes('≥')
        ? '>='
        : (comparatorRaw as '<' | '>')
    : null;

  return {
    name,
    extracted: {
      raw: `${comparatorRaw ?? ''}${rawValue}`.trim(),
      value: parseNumeric(rawValue),
      unit: unitRaw ? stripTrailingNoise(unitRaw) : null,
      comparator,
      textual: null,
    },
  };
}

/** Reference-range text can bleed into the unit column; keep only real units. */
function stripTrailingNoise(unit: string): string {
  let u = unit.trim();
  // Cut at a reference-range or note boundary.
  u = u.split(new RegExp(`${DASH_CLASS}\\s*\\d`))[0] ?? u;
  u = u.replace(/\b(ref|reference|range|normal|normal\s*value|flag|status|comment|remark)s?\b.*$/i, '').trim();
  u = u.replace(/[|,;]+$/, '').trim();
  return u;
}

// ── Flags ───────────────────────────────────────────────────────────────────

export function extractFlag(line: string): { flag: ReportedFlag; rest: string } {
  const trimmed = line.trimEnd();
  // Case-insensitive: some labs print lowercase flags, and silently losing an
  // `L`/`LL` would discard real safety information from the issuing lab.
  const m = /(?:\s|\||\)|\])(?<f>LL|HH|L|H|N)$/i.exec(trimmed);
  if (!m?.groups?.f || m.index === undefined) return { flag: null, rest: line };
  const f = m.groups.f.toUpperCase();
  const flag: ReportedFlag =
    f === 'LL' ? 'LL' : f === 'HH' ? 'HH' : f === 'L' ? 'L' : f === 'H' ? 'H' : f === 'N' ? 'N' : null;
  if (!flag) return { flag: null, rest: line };
  return { flag, rest: removeSpan(line, m.index, m[0].length) };
}

// ── Non-analyte lines ───────────────────────────────────────────────────────

export interface StatusInput {
  value: number;
  referenceLow: number | null;
  referenceHigh: number | null;
  reportedFlag: ReportedFlag;
}

/** Labels that appear on report headers and are never analytes. */
const METADATA_LABELS = [
  'name', 'patient', 'patient name', 'age', 'age/sex', 'age / sex', 'age-sex', 'sex', 'sex/age',
  'gender', 'dob', 'd.o.b', 'date of birth', 'uhid', 'mr', 'mr no', 'mrn', 'ip', 'opd', 'opd no',
  'ward', 'bed', 'ref by', 'referred by', 'referring doctor', 'doctor', 'pathologist',
  'verified by', 'technologist', 'phlebotomist', 'sample', 'specimen', 'collected',
  'sample collected', 'collected on', 'received', 'reported', 'report', 'bill', 'bill no',
  'receipt', 'invoice', 'page', 'printed', 'printed on', 'case no', 'accession', 'accession no',
  'contact', 'phone', 'mobile', 'tel', 'address', 'email', 'comment', 'comments', 'remark',
  'remarks', 'procedure', 'test', 'tests', 'ordered by', 'facility', 'location', 'visit type',
];

const METADATA_LINE = new RegExp(
  `^\\s*(${METADATA_LABELS.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*[/.:]`,
  'i',
);

const NON_ANALYTE_PATTERNS: RegExp[] = [
  /^page\s+\d+/i,
  /^printed\s+(on|at)/i,
  /^report\s+(generated|printed)/i,
  /\b(confidential|for\s+doctor.s?\s+use|not\s+a\s+definitive|do\s+not\s+diagnos)/i,
  /^\s*(note|notes|comments?|remarks?)\s*[:.]?\s*$/i,
  /^\s*(haematology|hemogram|cbc|complete\s+blood\s+count)\s*$/i, // handled as header
  /^\s*(male|female|sex|gender)\s*[::]\s*(male|female|m|f)$/i,
  /^\s*(age|d\.?o\.?b\.?)\s*[::]/i,
  /^\s*(bill|receipt|invoice)\s*(no|number|#)/i,
  /^[-\s=_*#]{3,}$/,
  /^\s*(doctor|referred\s+by|ref\s*by|pathologist|verified\s+by)\s*[::]/i,
  /^\s*(specimen|sample|collected|received|report(ed)?\s*(date|time)|date\s*&?\s*time)\s*[::]/i,
  /https?:\/\//i,
  /\b\d{3,4}[- ]\d{3,4}[- ]\d{4}\b/, // phone numbers
  /^\s*[\d\s.,:/-]*$/, // pure punctuation/space rows
  METADATA_LINE,
  /^[-–—\s]*end of (report|page)\b/i,
];

export function isNonAnalyteLine(line: string): boolean {
  const t = collapseWhitespace(line);
  if (t.length < 3) return true;
  return NON_ANALYTE_PATTERNS.some((re) => re.test(t));
}

// ── Status determination (deterministic) ────────────────────────────────────

export interface StatusInput {
  value: number;
  referenceLow: number | null;
  referenceHigh: number | null;
  reportedFlag: ReportedFlag;
  /** Absolute values below this fraction of the range's upper bound are critical. */
  criticalFraction?: number;
}

/**
 * Decide low / high / normal using ONLY the reference interval printed on the
 * user's own report. One-sided intervals are handled: "< 200" means the lower
 * bound is unbounded, not zero.
 *
 * IMPORTANT: we never *invent* `critical_low` / `critical_high`. A value that is
 * merely far outside the range is still reported as "low" or "high", and we
 * describe the size of the difference in words. A result is only labelled
 * critical when the issuing laboratory itself printed LL / HH. Claiming a value
 * is "critical" on our own authority would be exactly the kind of unverified
 * clinical claim this product must not make.
 */
export function determineStatus(input: StatusInput): {
  status: ResultStatus;
  deviation: number | null;
} {
  const { value, referenceLow, referenceHigh, reportedFlag } = input;
  const hasRange = referenceLow !== null || referenceHigh !== null;
  const labSaidCritical = reportedFlag === 'LL' || reportedFlag === 'HH';

  if (!Number.isFinite(value)) return { status: 'unknown', deviation: null };

  if (referenceLow !== null && value < referenceLow) {
    const span =
      referenceHigh !== null && referenceHigh > referenceLow
        ? referenceHigh - referenceLow
        : referenceLow;
    const frac = span > 0 ? (referenceLow - value) / span : 0;
    return { status: labSaidCritical ? 'critical_low' : 'low', deviation: span > 0 ? -frac : null };
  }
  if (referenceHigh !== null && value > referenceHigh) {
    const span =
      referenceLow !== null && referenceHigh > referenceLow
        ? referenceHigh - referenceLow
        : referenceHigh;
    const frac = span > 0 ? (value - referenceHigh) / span : 0;
    return { status: labSaidCritical ? 'critical_high' : 'high', deviation: span > 0 ? frac : null };
  }

  if (hasRange) {
    // The value sits inside the printed interval, but the issuing lab may still
    // have flagged it (a different unit, age band, or sex calibration can make
    // the printed interval disagree with the flag). We must never contradict
    // the lab: trust the flag and say so, rather than telling the user "normal".
    if (reportedFlag === 'LL') return { status: 'critical_low', deviation: null };
    if (reportedFlag === 'HH') return { status: 'critical_high', deviation: null };
    if (reportedFlag === 'H') return { status: 'high', deviation: null };
    if (reportedFlag === 'L') return { status: 'low', deviation: null };
    return { status: 'normal', deviation: 0 };
  }

  // No interval printed. Fall back to the lab's own flag only, and say so.
  if (labSaidCritical) return { status: 'unknown', deviation: null };
  if (reportedFlag === 'L') return { status: 'low', deviation: null };
  if (reportedFlag === 'H') return { status: 'high', deviation: null };
  if (reportedFlag === 'N') return { status: 'normal', deviation: null };
  return { status: 'unknown', deviation: null };
}

// ── Plain-language status phrasing ──────────────────────────────────────────

export function statusPhrase(status: ResultStatus, hasRange: boolean): string {
  switch (status) {
    case 'low':
      return 'Below the reference range';
    case 'high':
      return 'Above the reference range';
    case 'critical_low':
      return 'Well below the reference range';
    case 'critical_high':
      return 'Well above the reference range';
    case 'normal':
      return 'Within the reference range printed on your report';
    case 'unknown':
    default:
      return hasRange
        ? 'Could not be compared automatically'
        : 'Your report did not print a reference range for this test';
  }
}

export function isAttentionStatus(status: ResultStatus): boolean {
  return status === 'low' || status === 'high' || status === 'critical_low' || status === 'critical_high';
}

// ── Header extraction ───────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const pad = (n: number) => String(n).padStart(2, '0');
const isValidYmd = (y: number, m: number, d: number) =>
  Number.isInteger(y) && y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31;

/**
 * Date parsing that refuses to guess.
 * `dayFirst` decides DD/MM vs MM/DD only when the two are genuinely ambiguous.
 */
export function parseReportDate(
  input: string,
  dayFirst = true,
): { date: string; time: string | null; dayFirstUsed: boolean } | null {
  const s = collapseWhitespace(input);

  const timeMatch = /\b(\d{1,2}:\d{2})(?:\s*(am|pm))?\b/i.exec(s);
  let time: string | null = null;
  if (timeMatch) {
    const clock = timeMatch[1]!;
    const meridiem = timeMatch[2] ? timeMatch[2].toUpperCase() : null;
    time = meridiem ? `${clock} ${meridiem}` : clock;
  }

  // ISO: 2026-09-26
  let m = /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(s);
  if (m && isValidYmd(+m[1]!, +m[2]!, +m[3]!)) {
    return { date: `${m[1]}-${pad(+m[2]!)}-${pad(+m[3]!)}`, time, dayFirstUsed: false };
  }
  // 26 September 2026
  m = /\b(\d{1,2})[\s-]?([A-Za-z]{3,9})\.?\s+(\d{4})\b/.exec(s);
  if (m) {
    const month = MONTHS[(m[2] ?? '').toLowerCase()];
    if (month && isValidYmd(+m[3]!, month, +m[1]!)) {
      return { date: `${m[3]}-${pad(month)}-${pad(+m[1]!)}`, time, dayFirstUsed: true };
    }
  }
  // September 26, 2026
  m = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/.exec(s);
  if (m) {
    const month = MONTHS[(m[1] ?? '').toLowerCase()];
    if (month && isValidYmd(+m[3]!, month, +m[2]!)) {
      return { date: `${m[3]}-${pad(month)}-${pad(+m[2]!)}`, time, dayFirstUsed: false };
    }
  }
  // 26/09/2026 or 09/26/2026
  m = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/.exec(s);
  if (m) {
    const a = +m[1]!;
    const b = +m[2]!;
    let y = +m[3]!;
    if (y < 100) y += y > 70 ? 1900 : 2000;
    // An unambiguous reading wins over the format hint.
    if (a > 12 && b <= 12 && isValidYmd(y, b, a)) {
      return { date: `${y}-${pad(b)}-${pad(a)}`, time, dayFirstUsed: true };
    }
    if (b > 12 && a <= 12 && isValidYmd(y, a, b)) {
      return { date: `${y}-${pad(a)}-${pad(b)}`, time, dayFirstUsed: false };
    }
    if (dayFirst && isValidYmd(y, b, a)) {
      return { date: `${y}-${pad(b)}-${pad(a)}`, time, dayFirstUsed: true };
    }
    if (!dayFirst && isValidYmd(y, a, b)) {
      return { date: `${y}-${pad(a)}-${pad(b)}`, time, dayFirstUsed: false };
    }
    return null;
  }
  return null;
}

function extractLab(lines: string[]): string | null {
  const head = lines.slice(0, 10);
  for (const raw of head) {
    const line = collapseWhitespace(raw);
    if (!line || line.length < 3 || line.length > 80) continue;
    if (NON_ANALYTE_PATTERNS.some((re) => re.test(line))) continue;
    if (!/[A-Za-z]{3}/.test(line)) continue;
    // A lab name is typically uppercase, or the only non-header line near the top.
    if (line === line.toUpperCase() && /[A-Z]{3}/.test(line)) return line;
  }
  return null;
}

function extractAge(lines: string[]): number | null {
  for (const raw of lines) {
    const line = collapseWhitespace(raw);
    // "Age: 34", "Age / Sex: 34 / Male", "Age-34 Years", "Aged 34 yrs"
    const m = /(?:^|\b)(?:age|aged)\s*[/:-]?\s*(\d{1,3})\s*(?:y|yr|yrs|year|years|months?|mo)?/i.exec(line);
    if (m) {
      const n = +m[1]!;
      if (n >= 0 && n <= 120) return /month/i.test(m[0]) ? +(n / 12).toFixed(1) : n;
    }
    // "34 Years / Male", "34/M", "34 yrs Male"
    const m2 = /\b(\d{1,3})\s*\/?\s*(?:y|yr|yrs|year|years)?\s*[/ ]\s*(male|female|m|f)\b/i.exec(line);
    if (m2) {
      const n = +m2[1]!;
      if (n >= 0 && n <= 120) return n;
    }
  }
  return null;
}

function extractSex(lines: string[]): 'male' | 'female' | 'other' | null {
  for (const raw of lines) {
    const line = collapseWhitespace(raw);
    const m = /\b(?:sex|gender)\s*[/:-]?\s*([MFmf]|male|female|other)\b/i.exec(line);
    if (m) {
      const v = (m[1] ?? '').toLowerCase();
      if (v === 'm' || v === 'male') return 'male';
      if (v === 'f' || v === 'female') return 'female';
      return 'other';
    }
    // "34 / Male", "34 M", "Gender : Male"
    const m2 = /\b\d{1,3}\s*\/?\s*(male|female)\b/i.exec(line);
    if (m2) return (m2[1] ?? '').toLowerCase() === 'male' ? 'male' : 'female';
  }
  return null;
}

function extractReferringDoctor(lines: string[]): string | null {
  for (const raw of lines) {
    const line = collapseWhitespace(raw);
    const m = /\b(?:referred\s*by|ref\s*by|referring\s*(?:doctor|physician)|doctor)\s*[::]\s*(.{2,60})/i.exec(line);
    if (m) {
      const name = collapseWhitespace(m[1] ?? '').replace(/\b(?:dr|dr\.|md|mbbs)\b\.?/i, '').trim();
      if (name && /[A-Za-z]{2}/.test(name)) return name;
    }
  }
  return null;
}

// ── Report type detection ───────────────────────────────────────────────────

export interface ReportTypeDetection {
  reportType: ReportType;
  confidence: number;
  evidence: string[];
}

export function detectReportType(results: LabResult[]): ReportTypeDetection {
  const present = new Set(results.map((r) => r.normalizedName));
  const evidence: string[] = [];

  const cbcCore = CBC_CORE_TESTS.filter((t) => present.has(t));
  const diffCount = ['Neutrophils', 'Lymphocytes', 'Monocytes', 'Eosinophils', 'Basophils'].filter(
    (t) => present.has(t),
  ).length;

  if (cbcCore.length >= 2) {
    evidence.push(...cbcCore);
    const confidence = Math.min(0.99, 0.55 + 0.09 * cbcCore.length + 0.03 * diffCount);
    if (diffCount >= 2) {
      evidence.push('differential');
      return { reportType: 'cbc_with_diff', confidence, evidence };
    }
    return { reportType: 'cbc', confidence, evidence };
  }

  if (cbcCore.length === 1) {
    evidence.push(...cbcCore);
    if (present.has('HbA1c') && present.has('Fasting Glucose')) {
      return { reportType: 'hba1c', confidence: 0.6, evidence: [...evidence, 'HbA1c'] };
    }
    return { reportType: 'unknown', confidence: 0.35, evidence };
  }

  const groupCounts = new Map<string, number>();
  for (const r of results) {
    if (r.normalizedName === 'ESR') continue;
    const g = groupOf(r.normalizedName);
    if (!g) continue;
    groupCounts.set(g, (groupCounts.get(g) ?? 0) + 1);
  }
  let bestGroup: string | null = null;
  let bestCount = 0;
  for (const [g, c] of groupCounts) {
    if (c > bestCount) {
      bestGroup = g;
      bestCount = c;
    }
  }

  if (bestGroup && bestCount >= 2) {
    const map: Record<string, ReportType> = {
      metabolic: 'hba1c',
      inflammatory: 'esr',
    };
    // Refine with specific marker presence rather than a single group label.
    if (present.has('HbA1c')) return { reportType: 'hba1c', confidence: 0.75, evidence: ['HbA1c'] };
    if (present.has('ESR')) return { reportType: 'esr', confidence: 0.7, evidence: ['ESR'] };
    if (present.has('Total Cholesterol') || present.has('LDL Cholesterol') || present.has('HDL Cholesterol') || present.has('Triglycerides')) {
      return { reportType: 'lipid', confidence: 0.8, evidence: ['lipid panel markers'] };
    }
    if (present.has('ALT') || present.has('AST') || present.has('Bilirubin Total')) {
      return { reportType: 'lft', confidence: 0.8, evidence: ['liver panel markers'] };
    }
    if (present.has('Creatinine') || present.has('Urea')) {
      return { reportType: 'kft', confidence: 0.8, evidence: ['kidney panel markers'] };
    }
    if (present.has('Sodium') || present.has('Potassium')) {
      return { reportType: 'electrolytes', confidence: 0.7, evidence: ['electrolyte markers'] };
    }
    if (present.has('TSH')) return { reportType: 'thyroid', confidence: 0.85, evidence: ['TSH'] };
    return { reportType: map[bestGroup] ?? 'unknown', confidence: 0.5, evidence: [bestGroup] };
  }

  return { reportType: 'unknown', confidence: 0, evidence: [] };
}

function groupOf(normalizedName: string): string | null {
  switch (normalizedName) {
    case 'ALT':
    case 'AST':
    case 'Bilirubin Total':
      return 'liver';
    case 'Creatinine':
    case 'Urea':
      return 'kidney';
    case 'Total Cholesterol':
    case 'LDL Cholesterol':
    case 'HDL Cholesterol':
    case 'Triglycerides':
      return 'lipid';
    case 'Sodium':
    case 'Potassium':
      return 'electrolyte';
    case 'TSH':
    case 'Free T4':
      return 'thyroid';
    case 'HbA1c':
    case 'Fasting Glucose':
      return 'glycemic';
    default:
      return null;
  }
}

// ── Plausibility gate ───────────────────────────────────────────────────────

/**
 * Reject values that cannot be right. This catches OCR damage and unit
 * mismatches. A rejected value is preserved verbatim in `unparsed` with a
 * reason, so nothing is silently dropped or silently trusted.
 */
export function checkPlausibility(
  normalizedName: string,
  value: number,
  unit: string | null,
): { ok: boolean; reason?: string } {
  const def = normalizeTestName(normalizedName).definition;
  if (!def) return { ok: true };
  if (def.plausibleMin !== null && value < def.plausibleMin) {
    return { ok: false, reason: `value ${value} is below the plausible range for ${normalizedName} (>= ${def.plausibleMin}); likely a unit or OCR error` };
  }
  if (def.plausibleMax !== null && value > def.plausibleMax) {
    return { ok: false, reason: `value ${value} is above the plausible range for ${normalizedName} (<= ${def.plausibleMax}); likely a unit or OCR error` };
  }
  if (def.isPercentage && value > 100.5) {
    return { ok: false, reason: `percentage value ${value} exceeds 100` };
  }
  // A percentage-valued analyte printed with a mass unit is a unit mix-up.
  if (def.isPercentage && unit && !unit.startsWith('%')) {
    const ratio = unit.replace(/[^0-9./^]/g, '');
    if (ratio === '0' || /^\d{3,}$/.test(ratio)) {
      return { ok: false, reason: `${normalizedName} is a percentage but the report printed unit "${unit}"` };
    }
  }
  return { ok: true };
}

// ── Main entry point ────────────────────────────────────────────────────────

export interface ParseOptions {
  /** Date format hint for fully ambiguous dates like 03/04/2026. */
  dayFirstDates?: boolean;
  /** Reference intervals from the reviewed table, used only when the report omits them. */
  fallbackReference?: (normalizedName: string) => { low: number | null; high: number | null; sourceId: string | null } | null;
}

/** Units that reports sometimes glue onto the analyte name itself, e.g. "Neutrophils %". */
const NAME_SUFFIX_UNITS =
  /(?:\s+(?:%|per\s+\w+|\/[\w^/]+|[a-zA-Z0-9^/]+\/(?:dL|L)|x10\^\d+\/L|fL|pg|mmol\/L|mEq\/L|U\/L|mg\/dL|ng\/dL|g\/dL|mm\/hr|ng\/mL|µIU\/mL|pg\/mL|pmol\/L|IU\/L))$/;

/**
 * Rewrite structured layouts into the canonical single-line form
 * `<name> <value> <unit> <reference> <flag>` so that the main loop only has to
 * understand one shape.
 *
 * Two layouts need this:
 *   pipe_columns     "Hemoglobin|12.3|g/dL|13.0 - 17.0|L"
 *   two_column_split "Hemoglobin"  followed by  "  12.3 g/dL   13.0 - 17.0"
 *
 * Layouts that are already `name value unit range` (the common case, produced by
 * wide tables, colon-delimited units, bracketed refs and dense lab exports) pass
 * through untouched.
 */
export function normalizeStructuredLines(lines: string[]): string[] {
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // ── pipe_columns ──────────────────────────────────────────────────────
    if (line.split('|').length >= 4) {
      const cells = line.split('|').map((c) => c.trim());
      const [name, value, unit, range, flag] = cells;
      if (name && value) {
        const cleanName = name.replace(NAME_SUFFIX_UNITS, '').trim();
        const parts = [cleanName, value, unit, range, flag].filter((p) => p && p.length > 0);
        out.push(parts.join(' '));
        i++;
        continue;
      }
    }

    // ── two_column_split ──────────────────────────────────────────────────
    // A bare analyte name on its own line, with the value on the next line.
    const isBareName =
      !/\d/.test(line) &&
      line.length <= 60 &&
      !isNonAnalyteLine(line) &&
      !/[:=]$/.test(line);
    const next = lines[i + 1];
    if (isBareName && next && !isNonAnalyteLine(next)) {
      // The next line must start with the value.
      const m = /^\s*<?\s*([<>]?)\s*(-?[\d.,]+)\s*(.*)$/.exec(next);
      if (m) {
        const arrow = m[1] === '>' ? 'H' : m[1] === '<' ? 'L' : '';
        const value = m[2]!;
        const rest = (m[3] ?? '').trim();
        const cleanName = line.replace(NAME_SUFFIX_UNITS, '').trim();
        out.push([cleanName, arrow, value, rest].filter(Boolean).join(' '));
        i += 2;
        continue;
      }
    }

    out.push(line);
    i++;
  }

  return out;
}

export function parseLabReport(rawText: string, options: ParseOptions = {}): ParsedReport {
  const lines = normalizeStructuredLines(
    String(rawText ?? '')
      .split(/\r?\n/)
      .map((l) => collapseWhitespace(l))
      .filter((l) => l.length > 0),
  );

  const results: LabResult[] = [];
  const unparsed: UnparsedLine[] = [];
  const seen = new Map<string, number>();

  for (const line of lines) {
    if (isNonAnalyteLine(line)) continue;

    // Notes column is not a reference range; strip "(Ref: ...)" wrappers first.
    let working = line.replace(/\(\s*ref(?:erence)?\.?\s*[:=]?\s*[^)]*\)/gi, ' ');
    working = collapseWhitespace(working);

    const { flag, rest: afterFlag } = extractFlag(working);
    const { reference, rest: afterRef } = extractReferenceRange(afterFlag);
    const parsed = extractValueAndUnit(collapseWhitespace(afterRef));

    if (!parsed || !parsed.name) {
      if (!isNonAnalyteLine(line) && /\d/.test(line)) {
        unparsed.push({ line, reason: 'no value could be separated from this line' });
      }
      continue;
    }

    const norm = normalizeTestName(parsed.name);
    // Reject a "name" that is really a stray unit or number fragment.
    const nameCandidates = termLookupCandidates(parsed.name);
    if (!norm.matched && nameCandidates.every((c) => c.length < 4)) continue;

    const value = parsed.extracted.value;
    if (value === null) {
      if (parsed.extracted.textual) {
        results.push(buildResult({
          printedName: parsed.name,
          norm,
          rawValue: parsed.extracted.textual,
          value: null,
          unit: null,
          reference,
          reportedFlag: flag,
          index: seen,
        }));
        continue;
      }
      unparsed.push({ line, reason: 'result value was not numeric and not a recognised text result' });
      continue;
    }

    const unit = canonicalUnit(parsed.extracted.unit);
    const plausibility = checkPlausibility(norm.normalizedName, value, unit);
    if (!plausibility.ok) {
      unparsed.push({ line, reason: plausibility.reason ?? 'implausible value' });
      continue;
    }

    // If the unit printed is incompatible with the canonical analyte's unit,
    // keep the printed unit but do not pretend to have verified the conversion.
    const finalUnit = unit ?? norm.expectedUnit;

    let refLow = reference?.low ?? null;
    let refHigh = reference?.high ?? null;
    let refRaw = reference?.raw ?? null;
    let refSource: Provenance = PROVENANCE.REPORT_REFERENCE_RANGE;

    if (refLow === null && refHigh === null && options.fallbackReference) {
      const fb = options.fallbackReference(norm.normalizedName);
      if (fb && (fb.low !== null || fb.high !== null)) {
        refLow = fb.low;
        refHigh = fb.high;
        refRaw = fb.low !== null || fb.high !== null ? `${fb.low ?? ''} - ${fb.high ?? ''}`.trim() : null;
        refSource = PROVENANCE.KNOWLEDGE_BASE;
      }
    }

    const { status, deviation } = determineStatus({
      value,
      referenceLow: refLow,
      referenceHigh: refHigh,
      reportedFlag: flag,
    });

    results.push(
      buildResult({
        printedName: parsed.name,
        norm,
        rawValue: parsed.extracted.raw,
        value,
        unit: finalUnit,
        reference: { low: refLow, high: refHigh, raw: refRaw, form: reference?.form ?? 'range' },
        referenceSource: refSource,
        reportedFlag: flag,
        computedStatus: status,
        deviation,
        index: seen,
      }),
    );
  }

  const detection = detectReportType(results);
  const header = buildHeader(lines, results, detection);

  return {
    header,
    results,
    unparsed,
    pipeline: { parser: PARSER_VERSION, terminology: TERMINOLOGY_VERSION, safety: SAFETY_VERSION },
  };
}

interface BuildResultArgs {
  printedName: string;
  norm: ReturnType<typeof normalizeTestName>;
  rawValue: string;
  value: number | null;
  unit: string | null;
  reference: { low: number | null; high: number | null; raw: string | null; form: ExtractedReference['form'] } | null;
  referenceSource?: (typeof PROVENANCE)[keyof typeof PROVENANCE];
  reportedFlag: ReportedFlag;
  computedStatus?: ResultStatus;
  deviation?: number | null;
  index: Map<string, number>;
}

function buildResult(args: BuildResultArgs): LabResult {
  const { index } = args;
  const keyBase = makeResultKey(args.norm.normalizedName, args.unit, 0);
  const seenCount = index.get(keyBase) ?? 0;
  index.set(keyBase, seenCount + 1);

  const refLow = args.reference?.low ?? null;
  const refHigh = args.reference?.high ?? null;

  let status = args.computedStatus;
  let deviation = args.deviation ?? null;
  if (status === undefined) {
    if (args.value === null) {
      status = 'unknown';
    } else {
      const d = determineStatus({
        value: args.value,
        referenceLow: refLow,
        referenceHigh: refHigh,
        reportedFlag: args.reportedFlag,
      });
      status = d.status;
      deviation = d.deviation;
    }
  }

  return {
    id: makeResultKey(args.norm.normalizedName, args.unit, seenCount),
    name: args.printedName,
    normalizedName: args.norm.normalizedName,
    code: args.norm.code,
    value: args.value,
    rawValue: args.rawValue,
    unit: args.unit,
    referenceLow: refLow,
    referenceHigh: refHigh,
    referenceRaw: args.reference?.raw ?? null,
    referenceSource: args.referenceSource ?? PROVENANCE.REPORT_REFERENCE_RANGE,
    status,
    reportedFlag: args.reportedFlag,
    deviation,
    note: null,
  };
}

function buildHeader(
  lines: string[],
  results: LabResult[],
  detection: ReportTypeDetection,
): ReportHeader {
  const dateResult = pickDate(lines);
  const panelTitle = pickPanelTitle(results, detection);

  return {
    title: panelTitle,
    reportType: detection.reportType,
    reportTypeConfidence: Number(detection.confidence.toFixed(2)),
    reportDate: dateResult?.date ?? null,
    collectedAt: dateResult?.date ? `${dateResult.date}${dateResult.time ? `T${dateResult.time}` : ''}` : null,
    laboratory: extractLab(lines),
    patientAgeYears: extractAge(lines),
    patientSex: extractSex(lines),
    referringDoctor: extractReferringDoctor(lines),
  };
}

function pickDate(lines: string[]): { date: string; time: string | null } | null {
  const labelled = /(?:report|collected|sample|specimen|test|date)\s*(?:date)?\s*[::]\s*(.{6,40})/i;
  for (const raw of lines.slice(0, 30)) {
    const m = labelled.exec(collapseWhitespace(raw));
    if (m) {
      const d = parseReportDate(m[1] ?? '');
      if (d) return { date: d.date, time: d.time };
    }
  }
  for (const raw of lines.slice(0, 30)) {
    const d = parseReportDate(raw);
    if (d) return { date: d.date, time: d.time };
  }
  return null;
}

function pickPanelTitle(results: LabResult[], detection: ReportTypeDetection): string {
  const labels: Record<string, string> = {
    cbc: 'Complete Blood Count (CBC)',
    cbc_with_diff: 'Complete Blood Count with Differential (CBC + Diff)',
    esr: 'Erythrocyte Sedimentation Rate (ESR)',
    lft: 'Liver Function Tests (LFT)',
    kft: 'Kidney Function Tests (KFT)',
    lipid: 'Lipid Profile',
    thyroid: 'Thyroid Profile',
    hba1c: 'Glycaemic Markers (HbA1c / Glucose)',
    electrolytes: 'Electrolytes',
    urinalysis: 'Urinalysis',
    vital_signs: 'Vital Signs',
    unknown: 'Laboratory Report',
  };
  if (results.length === 0) return 'Laboratory Report';
  return labels[detection.reportType] ?? 'Laboratory Report';
}

// ── Presentation helpers ────────────────────────────────────────────────────

export function formatReference(result: LabResult): string {
  if (result.referenceLow !== null && result.referenceHigh !== null) {
    return `${displayNumber(result.referenceLow)} – ${displayNumber(result.referenceHigh)}`;
  }
  if (result.referenceHigh !== null) return `below ${displayNumber(result.referenceHigh)}`;
  if (result.referenceLow !== null) return `above ${displayNumber(result.referenceLow)}`;
  return result.referenceRaw ?? 'not printed on this report';
}

export function formatResultValue(result: LabResult): string {
  if (result.value === null) return result.rawValue;
  return displayNumber(result.value);
}

export function formatResultLine(result: LabResult): string {
  return `${formatResultValue(result)}${result.unit ? ` ${result.unit}` : ''}`;
}

export function describeUnitInWords(unit: string | null): string {
  return describeUnit(unit);
}
