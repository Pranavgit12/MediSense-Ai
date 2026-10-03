/**
 * The condition evaluator.
 *
 * `requires` and `forbids` guards are data, not code, so this is the only place
 * that decides whether a question is relevant. It is a total function over the
 * closed `Condition` vocabulary: no side effects, no throwing, and a false
 * result for anything unknown.
 *
 * That last property is deliberate and is the safe direction. An unknown age
 * must not make an age-gated question unaskable, and an unknown sex must not
 * unlock a pregnancy-gated one: where the engine cannot tell, it asks nothing
 * and recommends nothing.
 */
import type { Condition, PatientProfile, PatientSex, ProfileFlag, Topic } from './types';
import {
  answerIncludes,
  firstAnswer,
  isWorsening,
  profileFlagSet,
  reportedSymptoms,
  resolveDuration,
  resolveSeverity,
} from './profile';
import { aliasKeys } from './topics';

/** Minimal lookup the evaluator needs; the real one is `questionByKey`. */
export type QuestionLookup = ReadonlyMap<string, { key: string; kind: string }>;

/**
 * Values that mean "no" when a topic's answer is read as a positive report.
 *
 * Anything not in this list counts as a positive report, including values nobody
 * has seen before. That is the safe direction for escalation: an unfamiliar
 * option reading as "something was reported" costs one extra question, whereas
 * reading as "nothing was reported" silently drops a warning sign.
 */
const NEGATIVE_VALUES = new Set(['no', 'none', 'not_applicable', 'never', 'unsure', 'absent', 'negative']);

/** Is this single answer value an affirmative report? */
function isAffirmative(value: string): boolean {
  if (NEGATIVE_VALUES.has(value.trim().toLowerCase())) return false;
  // A multi-choice answer is affirmative when any selected option is.
  if (value.includes(',')) return value.split(',').some((part) => isAffirmative(part));
  return true;
}

export interface EvalContext {
  profile: PatientProfile;
  /** Topics already covered, so a `known` guard can fire. */
  coveredTopics: ReadonlySet<Topic>;
  /**
   * Topics the user positively reported rather than merely answered.
   *
   * Kept apart from `coveredTopics` because "we have dealt with this topic" and
   * "the patient said yes" are different facts, and only the second one may
   * escalate. A topic seeded from the opening free text is always a positive
   * report, since topics are only seeded when the thing was named.
   */
  reportedTopics: ReadonlySet<Topic>;
  flags: ReadonlySet<ProfileFlag>;
  symptoms: ReadonlySet<string>;
  /** The question bank, so alias groups can be resolved to question keys. */
  questions: QuestionLookup;
  /** Resolved once per selection: several guards read the same derived facts. */
  durationRank: number | null;
  severity: number | null;
  worsening: boolean;
}

/** Build the evaluation context once per selection, not once per node. */
export function evalContext(
  profile: PatientProfile,
  coveredTopics: ReadonlySet<Topic>,
  reportedTopics: ReadonlySet<Topic> = new Set(),
  questions: QuestionLookup = new Map(),
): EvalContext {
  return {
    profile,
    coveredTopics,
    reportedTopics,
    flags: profileFlagSet(profile),
    symptoms: reportedSymptoms(profile),
    questions,
    durationRank: resolveDuration(profile)?.rank ?? null,
    severity: resolveSeverity(profile),
    worsening: isWorsening(profile),
  };
}

/**
 * Was this topic actively reported as present?
 *
 * Answers yes if the topic was seeded from the opening text, or if any question
 * in the topic's alias group holds an affirmative answer. The alias group is what
 * makes "a fever, reported through the cough set's fever question" satisfy a
 * fever guard even though the fever set's own question was never asked.
 */
export function topicReported(topic: Topic, context: EvalContext): boolean {
  if (context.reportedTopics.has(topic)) return true;
  for (const key of aliasKeys(topic)) {
    const value = firstAnswer(context.profile, [key]);
    if (value !== undefined && isAffirmative(value)) return true;
  }
  return false;
}

export function evaluate(condition: Condition, context: EvalContext): boolean {
  switch (condition.on) {
    case 'answer': {
      const value = firstAnswer(context.profile, [condition.key]);
      if (value === undefined) return false;
      if (condition.is.includes(value)) return true;
      // A multi-choice answer can satisfy a single-option test without being
      // equal to it, so "did they tick fever?" must also test the comma-joined
      // form. Without this, a symptom picked alongside others reads as absent.
      return condition.is.some((option) => answerIncludes(value, option));
    }

    case 'answerOtherThan': {
      const value = firstAnswer(context.profile, [condition.key]);
      if (value === undefined) return false;
      return !condition.is.includes(value);
    }

    case 'answered':
      return firstAnswer(context.profile, [condition.key]) !== undefined;

    case 'unanswered':
      return firstAnswer(context.profile, [condition.key]) === undefined;

    case 'known':
      return context.coveredTopics.has(condition.topic);

    case 'reported':
      // A sibling in this topic's alias group answered yes. This is deliberately
      // separate from `known`: "covered" means the topic has been dealt with
      // either way, while "reported" means somebody actively said yes, possibly
      // through a different symptom set's question. Escalation needs the second.
      return topicReported(condition.topic, context);

    case 'unknown':
      return condition.topics.every((topic) => !context.coveredTopics.has(topic));

    case 'anyKnown':
      return condition.topics.some((topic) => context.coveredTopics.has(topic));

    case 'symptom':
      return context.symptoms.has(condition.key);

    case 'age': {
      const age = context.profile.ageYears;
      if (age === null || !Number.isFinite(age)) return false;
      if (condition.lt !== undefined && !(age < condition.lt)) return false;
      if (condition.gt !== undefined && !(age > condition.gt)) return false;
      return true;
    }

    case 'sex':
      return context.profile.sex !== null && condition.is.includes(context.profile.sex);

    case 'flag':
      return condition.is.some((flag) => context.flags.has(flag));

    case 'durationAtLeast':
      // An unknown duration is false, so a long-running branch is only entered
      // once the timeline is actually established. Guessing "assume it has been
      // a while" would send everyone down the same path.
      return context.durationRank !== null && context.durationRank >= condition.rank;

    case 'severityAtLeast':
      return context.severity !== null && context.severity >= condition.value;

    case 'worsening':
      return context.worsening;

    case 'all':
      return condition.of.every((inner) => evaluate(inner, context));

    case 'any':
      return condition.of.some((inner) => evaluate(inner, context));

    case 'not':
      return !evaluate(condition.of, context);

    default: {
      // Exhaustiveness guard: an unrecognised condition is treated as false so a
      // typo can never widen what gets asked.
      const never: never = condition;
      void never;
      return false;
    }
  }
}

/** True when `node`'s relevance guards hold. */
export function isRelevant(
  requires: Condition | undefined,
  forbids: Condition | undefined,
  context: EvalContext,
): boolean {
  if (requires && !evaluate(requires, context)) return false;
  if (forbids && evaluate(forbids, context)) return false;
  return true;
}

// ── Authoring shorthands ─────────────────────────────────────────────────────
//
// These exist so the graph in `nodes.ts` reads like the clinical decision tree
// it encodes, rather than like nested object literals.

/** Answer to `key` is one of `is`. */
export const answered = (key: string, ...is: string[]): Condition => ({ on: 'answer', key, is });

/** Answer to `key` is one of `is`, allowing for multi-choice comma joining. */
export const isAny = (key: string, is: readonly string[]): Condition => ({ on: 'answer', key, is });

/** Answer to `key` was given and is not one of `is`. */
export const answeredOther = (key: string, ...is: string[]): Condition => ({
  on: 'answerOtherThan',
  key,
  is,
});

export const hasAnswer = (key: string): Condition => ({ on: 'answered', key });

export const noAnswer = (key: string): Condition => ({ on: 'unanswered', key });

/** The topic is already covered. */
export const known = (topic: Topic): Condition => ({ on: 'known', topic });

/**
 * Somebody said this topic was present.
 *
 * Weaker than `known` — that would also be satisfied by someone answering "no" —
 * so this is the guard to reach for when a follow-up must only fire on a positive
 * report, such as asking what medicine someone took for a week-long fever.
 */
export const reported = (topic: Topic): Condition => ({ on: 'reported', topic });

/** None of these topics is covered. Use to avoid asking a second question on a
 *  topic an earlier answer already filled. */
export const noneKnown = (...topics: Topic[]): Condition => ({ on: 'unknown', topics });

export const anyKnown = (...topics: Topic[]): Condition => ({ on: 'anyKnown', topics });

export const withSymptom = (...keys: string[]): Condition =>
  keys.length === 1
    ? { on: 'symptom', key: keys[0]! }
    : { on: 'any', of: keys.map((key) => ({ on: 'symptom', key }) as Condition) };

export const ageUnder = (years: number): Condition => ({ on: 'age', lt: years });
export const ageOver = (years: number): Condition => ({ on: 'age', gt: years });

export const hasFlag = (...is: ProfileFlag[]): Condition => ({ on: 'flag', is });

/** The complaint has been going on for at least this long. */
export const lastingAtLeast = (rank: number): Condition => ({ on: 'durationAtLeast', rank });

/** Rated at least this severe on the 0-10 scale. */
export const atLeastSeverity = (value: number): Condition => ({ on: 'severityAtLeast', value });

/** Established as getting worse. */
export const worsening = (): Condition => ({ on: 'worsening' });

export const sexIs = (...is: PatientSex[]): Condition => ({ on: 'sex', is });

/** Female patient, whatever the recorded sex value turns out to be. */
export const female = (): Condition => sexIs('female');

export const all = (...of: Condition[]): Condition => ({ on: 'all', of });
export const any = (...of: Condition[]): Condition => ({ on: 'any', of });
export const not = (of: Condition): Condition => ({ on: 'not', of });

/** `a` or `b` or both. The workhorse for "either answer opens this branch". */
export const either = (...of: Condition[]): Condition => ({ on: 'any', of });
