/**
 * Patient profile: derived facts.
 *
 * Nothing here is asked twice. Age and sex arrive once, at intake. Everything
 * else is *derived* from age, sex, the presenting symptoms, the free text and
 * the answers already given, which is what keeps the questionnaire from asking
 * a 45-year-old woman to confirm her age in three different wordings.
 *
 * The derived flags are the inputs to two safety-critical decisions — whether a
 * question is relevant, and whether an over-the-counter category is safe to
 * suggest — so the derivation is deliberately conservative: an unknown is
 * treated as the riskier branch, never the safer one.
 */
import type { PatientProfile, PatientSex, ProfileFlag, Topic } from './types';
import { SYMPTOM_BY_KEY } from '../../data/symptom-catalog';

/** Conditions reported in the intake text or an answer that change what is safe. */
const CONDITION_PATTERNS: { flag: ProfileFlag; pattern: RegExp }[] = [
  { flag: 'liver_risk', pattern: /\b(liver|kidney|renal|hepatic)\b[^.]{0,24}\b(disease|problem|disorder|failure|impairment|damage)\b|\b(cirrhosis|hepatitis|jaundice)\b|\b(liver|kidney)\b[^.]{0,12}\b(disease|problem)\b/ },
  { flag: 'kidney_risk', pattern: /\b(kidney|renal)\b[^.]{0,24}\b(disease|problem|disorder|failure|impairment|damage)\b/ },
  { flag: 'asthma', pattern: /\b(asthma|copd|reactive airway|hyper[- ]?reactive airway|bronchospasm|wheez)\w*/ },
  { flag: 'ulcer_history', pattern: /\b(ulcer|peptic|gastric ulcer|duodenal ulcer)\w*/ },
  { flag: 'cardiac_risk', pattern: /\b(heart (disease|failure|attack|problem)|high blood pressure|hypertension|angina|arrhythmia|atrial fibrillation)\w*/ },
  { flag: 'immunocompromised', pattern: /\b(immunosuppress\w*|chemotherapy|chemo|cancer treatment|transplant|hiv|compromised immune)\w*/ },
];

const PREGNANCY_PATTERN = /\b(pregnan\w*|expecting|first trimester|second trimester|third trimester|trying to conceive)\b/;
const BREASTFEEDING_PATTERN = /\b(breast[- ]?feed\w*|nursing my baby|breastfeeding)\b/;

export const SEX_WORDS: { sex: PatientSex; pattern: RegExp }[] = [
  { sex: 'female', pattern: /\b(woman|women|female|girl|lady|ladies|ladies'|she|her|hers|mum|mom|mother|ms|mrs|miss)\b/ },
  { sex: 'male', pattern: /\b(man|men|male|boy|gentleman|he|him|his|dad|father|mr)\b/ },
];

/**
 * Age bands.
 *
 * The cut points are the ones already used by the triage engine (<5 and >65),
 * kept consistent so a patient is never routed early by one rule and late by
 * another. `fraile_older_adult` is separate from `older_adult` because the
 * dehydration and confusion thresholds genuinely differ at 75.
 */
export function ageFlags(ageYears: number | null): ProfileFlag[] {
  if (ageYears === null || !Number.isFinite(ageYears)) return [];
  const flags: ProfileFlag[] = [];
  if (ageYears < 1) flags.push('infant');
  if (ageYears >= 1 && ageYears < 12) flags.push('child');
  if (ageYears >= 12 && ageYears < 16) flags.push('adolescent');
  if (ageYears >= 65) flags.push('older_adult');
  if (ageYears >= 75) flags.push('fraile_older_adult');
  return flags;
}

/** Ages at which a pregnancy question is worth asking at all. */
const REPRODUCTIVE_AGE_MIN = 12;
const REPRODUCTIVE_AGE_MAX = 55;

/**
 * Pregnancy and breastfeeding.
 *
 * `pregnant_or_unknown` exists because the safe default for a woman of
 * reproductive age whose pregnancy status we do not know is the cautious one.
 * A separate confirmed `pregnant` flag drives the hard blocks, so the two never
 * get confused: "maybe pregnant" softens advice, "pregnant" blocks categories.
 */
export function reproductiveFlags(profile: PatientProfile): ProfileFlag[] {
  const flags: ProfileFlag[] = [];
  const haystack = `${profile.freeText} ${[...profile.answers.values()].join(' ')}`.toLowerCase();
  const age = profile.ageYears;
  const ageRelevant =
    age !== null && age >= REPRODUCTIVE_AGE_MIN && age <= REPRODUCTIVE_AGE_MAX;

  if (PREGNANCY_PATTERN.test(haystack)) {
    flags.push('pregnant', 'pregnant_or_unknown');
  } else if (profile.sex === 'female' && (age === null || ageRelevant)) {
    // Age unknown with a female patient: ask, because we cannot rule it out.
    flags.push('pregnant_or_unknown');
  }

  if (BREASTFEEDING_PATTERN.test(haystack)) flags.push('breastfeeding');
  return flags;
}

/** Conditions reported anywhere in the opening text or in any answer. */
export function conditionFlags(profile: PatientProfile): ProfileFlag[] {
  const haystack = `${profile.freeText} ${[...profile.answers.values()].join(' ')}`.toLowerCase();
  const flags: ProfileFlag[] = [];
  for (const { flag, pattern } of CONDITION_PATTERNS) {
    if (pattern.test(haystack)) flags.push(flag);
  }
  return flags;
}

/** Every derived flag that currently holds. */
export function profileFlags(profile: PatientProfile): ProfileFlag[] {
  return [...ageFlags(profile.ageYears), ...reproductiveFlags(profile), ...conditionFlags(profile)];
}

/** Convenience for the condition evaluator and the medicine gates. */
export function hasFlag(profile: PatientProfile, flag: ProfileFlag): boolean {
  return profileFlags(profile).includes(flag);
}

export function profileFlagSet(profile: PatientProfile): Set<ProfileFlag> {
  return new Set(profileFlags(profile));
}

// ── Answer helpers ───────────────────────────────────────────────────────────

/** First answer matching any of `keys`, in order. Used for aliases. */
export function firstAnswer(profile: PatientProfile, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = profile.answers.get(key);
    if (value !== undefined && value !== '') return value;
  }
  return undefined;
}

/** Multi-choice answers are stored comma-joined, so membership needs a split. */
export function answerIncludes(value: string | undefined, option: string): boolean {
  if (value === undefined) return false;
  return value
    .split(',')
    .map((part) => part.trim())
    .includes(option);
}

/** Numeric answer, or null when blank, non-numeric or out of any bound. */
export function numericAnswer(profile: PatientProfile, key: string): number | null {
  const raw = profile.answers.get(key);
  if (raw === undefined || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** True when a yes/no question was answered no. An unanswered question is not. */
export function answeredNo(profile: PatientProfile, key: string): boolean {
  return profile.answers.get(key) === 'no';
}

export function answeredYes(profile: PatientProfile, key: string): boolean {
  return profile.answers.get(key) === 'yes';
}

/** The primary duration bucket this session resolved to, across all symptoms. */
export const DURATION_ORDER: Record<string, number> = {
  lt_1d: 1,
  today: 1,
  hours: 1,
  d1_3: 2,
  days: 2,
  d4_7: 3,
  d1_3w: 4,
  weeks: 4,
  gt_3w: 5,
  months: 5,
  long: 6,
};

export interface ResolvedDuration {
  /** Question key the answer came from, for the audit trail. */
  sourceKey: string;
  /** Bucket value as authored. */
  value: string;
  /** Comparable magnitude, higher is longer. */
  rank: number;
}

/**
 * Resolve "how long" across every question that could carry it.
 *
 * The engine has more than one duration question on purpose (a cough duration
 * and a generic one), so this picks the most informative one that was actually
 * answered. The generic answer is the fallback because it was asked last, when
 * the specific one had already been declined or skipped.
 */
const DURATION_KEYS = [
  'fever_duration',
  'cough_duration',
  'headache_duration',
  'throat_duration',
  'vomit_duration',
  'diarrhoea_duration',
  'dizzy_duration',
  'fatigue_duration',
  'back_duration',
  'urinary_duration',
  'joint_duration',
  'duration',
];

export function resolveDuration(profile: PatientProfile): ResolvedDuration | null {
  for (const key of DURATION_KEYS) {
    const value = profile.answers.get(key);
    if (value === undefined) continue;
    const rank = DURATION_ORDER[value];
    if (rank !== undefined) return { sourceKey: key, value, rank };
  }
  return null;
}

/**
 * Severity keys, most specific first.
 *
 * A set-specific severity ("how bad is the belly pain") is preferred over the
 * generic one, because when someone has answered both, the specific number is
 * the one that describes the thing they came about.
 */
const SEVERITY_KEYS = [
  'chest_severity',
  'breath_severity',
  'abdo_severity',
  'severity',
  'shared_severity',
];

export function resolveSeverity(profile: PatientProfile): number | null {
  for (const key of SEVERITY_KEYS) {
    const value = profile.answers.get(key);
    if (value === undefined || value.trim() === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

/** Trajectory keys. The first answered one wins. */
const TRAJECTORY_KEYS = [
  'trajectory',
  'cough_trajectory',
  'shared_trajectory',
];

export function resolveTrajectory(profile: PatientProfile): string | null {
  for (const key of TRAJECTORY_KEYS) {
    const value = profile.answers.get(key);
    if (value !== undefined && value !== '') return value;
  }
  return null;
}

/** True when the complaint is established as worsening, however it was said. */
export function isWorsening(profile: PatientProfile): boolean {
  return resolveTrajectory(profile) === 'worse';
}

// ── Topics already satisfied without being asked ─────────────────────────────

/**
 * Topics satisfied by something other than an answer to a question.
 *
 * This is the "do NOT ask questions whose answers are already known" rule made
 * concrete. If the intake text already said the cough has been going on for
 * three days, the cough-duration question must never appear.
 *
 * Populated by `seed.ts`, which parses the opening free text. Kept separate
 * from the answers map so a seeded fact is auditable as a fact and never
 * mistaken for a question the user actually answered.
 */
export interface SeededFacts {
  /** Topics satisfied from the opening text. */
  topics: Topic[];
  /** Answers implied by the opening text, keyed by question key. */
  impliedAnswers: Record<string, string>;
  /** Age stated in the opening text, when it was stated. */
  ageYears: number | null;
  /** Sex stated in the opening text, when it was stated. */
  sex: PatientSex;
  /** Phrases that matched, for the audit trail. */
  matched: string[];
}

/**
 * Symptom keys already established as present, so a yes/no screen for them is a
 * repeat rather than a question.
 *
 * Only *present* symptoms count. Answering "no" to a screen means the symptom is
 * absent, which is information, but the catalogue symptom list is also consulted
 * because the intake form already collects reported symptoms directly.
 */
export function reportedSymptoms(profile: PatientProfile): Set<string> {
  const present = new Set<string>(profile.symptoms);
  for (const [key, value] of profile.answers) {
    if (value !== 'yes') continue;
    if (SYMPTOM_BY_KEY.has(key)) present.add(key);
  }
  return present;
}
