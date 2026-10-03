/**
 * The adaptive questionnaire: public surface.
 *
 * Everything the application needs is re-exported here, so callers have one import
 * path and the internal module layout stays free to change. The store should not
 * need to know that topics, conditions and repetition control are separate files.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CLINICAL REVIEW REQUIRED
 * `REVIEW_STATUS` and `ADAPTIVE_GRAPH_VERSION` travel with every session so a
 * stored session can be traced back to the exact graph that produced it. Nothing
 * in this module is clinician-signed. See `types.ts`.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export {
  ADAPTIVE_GRAPH_VERSION,
  REVIEW_STATUS,
  type Condition,
  type DecisionUse,
  type HaltDecision,
  type PatientProfile,
  type PatientSex,
  type ProfileFlag,
  type QuestionNode,
  type SelectionDecision,
  type SkippedQuestion,
  type SkipReason,
  type Topic,
} from './types';

export { GRAPH, NODE_BY_KEY, activeNodes, nodeByKey, parentKeyOf, topicFor } from './nodes';
export { ADAPTIVE_NODES } from './adaptive-questions';
export { selectNextQuestion, planQuestions } from './selector';
export { evalContext, evaluate, isRelevant, topicReported } from './conditions';
export { RepetitionIndex } from './dedupe';
export {
  evaluateRedFlags,
  redFlagRuleIds,
  redFlagsFromSymptoms,
  assertNoRedFlagIsAlsoAQuestion,
} from './red-flags';
export {
  medicationAdvice,
  otcCategory,
  otcCategoryIds,
  type MedicationAdvice,
  type OtcCategoryId,
  type OtcSuggestion,
} from './medication';
export {
  seedFromText,
} from './seed';
export { type SeededFacts } from './profile';
export {
  REQUIRED_SCREEN_TOPICS,
  YES_NO_ALIAS_GROUPS,
  aliasKeys,
  isCovered,
  narrowedTopics,
} from './topics';
export {
  profileFlags,
  resolveDuration,
  resolveSeverity,
  resolveTrajectory,
  isWorsening,
} from './profile';

import type { HaltDecision, PatientProfile, SelectionDecision } from './types';
import type { SeededFacts } from './profile';
import { evalContext } from './conditions';
import { evaluateRedFlags } from './red-flags';
import { seedFromText } from './seed';
import { QUESTION_LOOKUP, coveredTopics, selectNextQuestion } from './selector';
import { medicationAdvice, type MedicationAdvice } from './medication';

/**
 * Everything the result page needs, in one call.
 *
 * Deliberately one function rather than three, because the three answers are not
 * independent: whether to show a medicine depends on the same red-flag decision
 * that decides whether the questionnaire stopped. A caller that assembled them
 * separately could easily render a medicine list next to a stop-the-survey notice.
 */
export interface ConsultationOutcome {
  /** The next question, or null when the session is finished. */
  next: SelectionDecision;
  /** The red-flag decision, if one has fired. Binding on medicine suppression. */
  halt: HaltDecision | null;
  advice: MedicationAdvice;
  /** Facts the engine read out of the opening text, for the audit trail. */
  seeded: SeededFacts;
}

export function consultationOutcome(profile: PatientProfile): ConsultationOutcome {
  const decision = selectNextQuestion(profile);
  const seeded = seedFromText(profile.freeText);

  // Re-derived here rather than reused from `decision`, because the decision may
  // have stopped on the cap or on sufficiency with no halt, and the medicine layer
  // must never see a stale "no red flags". `coveredTopics` is the same function
  // the selector used, so the two cannot disagree about what is known.
  const covered = coveredTopics(profile, new Set(seeded.topics));
  const context = evalContext(profile, covered, new Set(seeded.topics), QUESTION_LOOKUP);
  const halt = evaluateRedFlags(context);

  return {
    next: decision,
    halt: decision.halt ?? halt,
    advice: medicationAdvice(profile, context, decision.halt ?? halt),
    seeded,
  };
}