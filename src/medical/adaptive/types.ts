/**
 * Adaptive questionnaire: types.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CLINICAL REVIEW REQUIRED
 * The question graph, the red-flag rules and the medicine gates are authored
 * clinical content. They are conservative and internally consistent, but a named
 * clinician (and a pharmacist for the medicine gates) must sign them off before
 * real patient use. See `REVIEW_STATUS` below.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ── Why this module exists ──────────────────────────────────────────────────
 *
 * The previous questionnaire was a flat, priority-sorted bank: every session
 * walked the same list in the same order, asking a fixed red-flag block up
 * front and a fixed context block at the end. That is safe but wasteful. It
 * asked a 34-year-old with a cough about chest pain they had already ruled out,
 * asked a diabetic about nothing at all, and asked everybody the same nine
 * yes/no safety questions whether or not the answers could change anything.
 *
 * The engine here replaces "sort the bank" with "decide the next question":
 *
 *     FACTS ──> RELEVANCE ──> KNOWN ──> NOVELTY ──> UTILITY ──> NEXT QUESTION
 *              (conditions)   (topics)   (dedupe)    (informs)
 *
 * Every stage is deterministic and inspectable. There is no model deciding what
 * to ask, for the same reason there is no model deciding what is urgent: a model
 * can be unavailable, mis-tuned, or talked round by a persuasive user, and none
 * of those are acceptable failure modes for a safety screen.
 */
import type { SafetyAction, SafetyLevel, SymptomQuestion } from '../../types/medical';

/** Review state of the authored graph content. Nothing here is clinician-signed. */
export const REVIEW_STATUS = 'needs_clinician_review' as const;

/** Bumped whenever node conditions, topics or ordering change. Stored per session. */
export const ADAPTIVE_GRAPH_VERSION = 'adaptive-graph/1.0.0';

// ── Topics ───────────────────────────────────────────────────────────────────

/**
 * The unit of "we already know this".
 *
 * Topics are the mechanism behind "do NOT ask questions whose answers are
 * already known". Every answer fills one or more topics; a candidate question is
 * dropped when the topic it exists to fill is already covered — either by an
 * earlier answer, or by something the user stated in their opening free text.
 *
 * Naming convention is `<facet>.<subject>`, e.g. `duration.fever`,
 * `nature.cough`, `red_flag.breathlessness`, `context.allergy`. The subject is
 * what makes duration per-symptom, while a bare facet name lets one answer
 * close a whole family of questions: answering `duration.fever` also covers
 * `duration.generic`, because "how long have you had this" is answered.
 */
export type Topic = string;

// ── Profile ──────────────────────────────────────────────────────────────────

export type PatientSex = 'female' | 'male' | 'other' | 'prefer_not_to_say' | null;

/**
 * Derived facts about the patient that gate both questions and medicines.
 *
 * These are *derived*, never asked directly, because the questionnaire must not
 * make a 45-year-old woman re-state her age and sex in three different
 * wordings. Anything derivable from the profile is asked at most once, at
 * intake.
 */
export type ProfileFlag =
  /** Under 1 year. Fever and dehydration thresholds differ. */
  | 'infant'
  /** 1 to 11 years. Dosing and some safety rules are age-specific. */
  | 'child'
  /** 12 to 15 years. Adult thresholds mostly apply, but not always. */
  | 'adolescent'
  /** 65 or over. Same symptoms are routed earlier. */
  | 'older_adult'
  /** 75 or over, where dehydration and delirium risk climb sharply. */
  | 'fraile_older_adult'
  /** Female patient who is pregnant, or whose pregnancy status is unknown. */
  | 'pregnant_or_unknown'
  /** Breastfeeding. Gates several OTC categories outright. */
  | 'breastfeeding'
  /** Liver disease or known liver problem, reported in any form. */
  | 'liver_risk'
  /** Kidney disease or reduced kidney function. */
  | 'kidney_risk'
  /** Asthma or another reactive-airway condition. */
  | 'asthma'
  /** Peptic ulcer or stomach bleeding history. */
  | 'ulcer_history'
  /** Heart disease or high blood pressure. */
  | 'cardiac_risk'
  /** Pregnancy in progress, confirmed rather than merely possible. */
  | 'pregnant'
  /** Taking an immunosuppressant, or immunocompromised. */
  | 'immunocompromised';

/** Everything the engine knows about the patient at one point in time. */
export interface PatientProfile {
  ageYears: number | null;
  sex: PatientSex;
  /** Presenting symptom keys: catalogue symptoms plus opened symptom-set ids. */
  symptoms: string[];
  /** Symptom-set ids the classifier opened, e.g. ['cough', 'fever']. */
  symptomSets: string[];
  /** Every answer recorded so far, keyed by question key. */
  answers: Map<string, string>;
  /** The user's own opening description, used to seed known facts. */
  freeText: string;
}

// ── Conditions ───────────────────────────────────────────────────────────────

/**
 * A guard on a node: "is this question relevant right now?".
 *
 * Deliberately a small closed vocabulary rather than arbitrary JavaScript, for
 * three reasons: a reviewer can read the whole graph without running it, the
 * predicates can be persisted and re-evaluated verbatim when the graph version
 * changes, and there is no way to smuggle in a side effect.
 */
export type Condition =
  /** The answer to `key` is one of `is`. Unanswered is false. */
  | { on: 'answer'; key: string; is: readonly string[] }
  /** The answer to `key` was given and is NOT one of `is`. Unanswered is false. */
  | { on: 'answerOtherThan'; key: string; is: readonly string[] }
  /** `key` has an answer at all. */
  | { on: 'answered'; key: string }
  /** `key` has no answer yet. */
  | { on: 'unanswered'; key: string }
  /** The topic is already covered, so asking would be a repeat. */
  | { on: 'known'; topic: Topic }
  /** None of these topics is covered yet. */
  | { on: 'unknown'; topics: readonly Topic[] }
  /** At least one of these topics is covered. */
  | { on: 'anyKnown'; topics: readonly Topic[] }
  /** The presenting complaint includes this symptom key or symptom-set id. */
  | { on: 'symptom'; key: string }
  /**
   * Some question in this topic's alias group was answered yes.
   *
   * Several symptom sets each ask their own "do you have a fever?" question. They
   * are one topic, so only one is ever asked, but every question that *depends*
   * on the answer still has to see it — including the ones whose `dependsOnKey`
   * points at a sibling that was never asked. This is what lets a numeric
   * "how high was your temperature" question fire off a fever reported through a
   * cough follow-up.
   */
  | { on: 'reported'; topic: Topic }
  /** Age comparison. An unknown age is false, so age-gated nodes are skipped
   *  rather than guessed at. The intake form asks for age. */
  | { on: 'age'; lt?: number; gt?: number }
  /** Sex comparison. Unknown sex is false. */
  | { on: 'sex'; is: readonly PatientSex[] }
  /** A derived profile flag holds. */
  | { on: 'flag'; is: readonly ProfileFlag[] }
  /**
   * The resolved duration is at least this long.
   *
   * Duration is resolved across every duration question that could carry it, so
   * one guard covers "a cough for three weeks" and "a fever for three weeks"
   * without the graph having to enumerate the combinations.
   */
  | { on: 'durationAtLeast'; rank: number }
  /** The resolved severity is at least this, on the 0-10 scale. */
  | { on: 'severityAtLeast'; value: number }
  /** The complaint is getting worse, however that was established. */
  | { on: 'worsening' }
  /** Every inner condition holds. */
  | { on: 'all'; of: readonly Condition[] }
  /** At least one inner condition holds. */
  | { on: 'any'; of: readonly Condition[] }
  /** The inner condition does not hold. */
  | { on: 'not'; of: Condition };

// ── Nodes ────────────────────────────────────────────────────────────────────

/** What an answer to this question is actually used for downstream. */
export type DecisionUse =
  /** Can change the triage level or action. */
  | 'triage'
  /** Can change the assessment narrative. */
  | 'assessment'
  /** Can change which over-the-counter category is suggested, or whether any is. */
  | 'medication'
  /** Only used for safety netting text on the summary. */
  | 'safety_netting';

/**
 * One question in the adaptive graph.
 *
 * `question` is the existing `SymptomQuestion`, unchanged, so rendering,
 * validation and persistence are untouched. Everything the graph needs on top of
 * it is here.
 */
export interface QuestionNode {
  /** The question as authored, and the shape the form and store already use. */
  question: SymptomQuestion;
  /** Stable question key. Never reused for a different question. */
  key: string;
  /**
   * The single topic this question exists to fill.
   *
   * One primary topic, not a list, because "is this already known?" must have one
   * unambiguous answer. An answer that also happens to cover neighbouring topics
   * declares them in `alsoCovers`.
   */
  topic: Topic;
  /** Extra topics this answer legitimately satisfies. */
  alsoCovers?: readonly Topic[];
  /**
   * Must hold for the question to be asked.
   *
   * Absent means "always relevant", which is only safe for the baseline intake
   * and the shared safety screen.
   */
  requires?: Condition;
  /**
   * If this holds, the question is skipped as irrelevant.
   *
   * Kept separate from `requires` because the two mean different things to a
   * reviewer: `requires` says "this only makes sense after that", `forbids` says
   * "this is actively pointless now". Both skip; the distinction is for the
   * audit trail.
   */
  forbids?: Condition;
  /** What the answer is used for. A node that informs nothing is never asked. */
  informs: readonly DecisionUse[];
  /**
   * Ordering weight among equally eligible nodes. Higher is asked first.
   *
   * This is a *preference*, not the safety ordering. Red-flag questions carry a
   * high utility so a truncated session drops the optional questions, never the
   * screen.
   */
  utility: number;
  /** Where the node came from, for the audit trail and for reviewer triage. */
  origin: 'core_bank' | 'symptom_set' | 'adaptive';
  /** Symptom-set id for set nodes, so a set can be reviewed as one block. */
  symptomSet?: string | null;
}

// ── Selection ────────────────────────────────────────────────────────────────

/**
 * Why a candidate question was not asked.
 *
 * This is the observable form of the seven repetition rules. If a user or a
 * clinician thinks the engine asked something silly, this enum says which rule
 * fired, rather than leaving them to guess.
 */
export type SkipReason =
  /** Its own key already has an answer. The literal "never repeat a question". */
  | 'already_answered'
  /** Something already covers the topic this question exists to fill. */
  | 'topic_covered'
  /** Its wording and intent overlap a question already asked. */
  | 'semantic_overlap'
  /** The user already reported this symptom, so asking is a repeat. */
  | 'symptom_already_reported'
  /** A relevance condition does not hold. */
  | 'irrelevant'
  /** A `forbids` guard fired: another answer made this unnecessary. */
  | 'made_unnecessary'
  /** Its answer cannot change the assessment or the recommendation. */
  | 'no_decision_value'
  /** The per-session question cap is reached. */
  | 'session_cap'
  /** A higher-priority branch has not been walked yet. */
  | 'deferred_behind_branch';

export interface SkippedQuestion {
  key: string;
  reason: SkipReason;
  /** Human-readable detail, e.g. the topic that was already covered. */
  detail: string;
}

// ── Red flags ────────────────────────────────────────────────────────────────

/** Why the engine must stop asking questions. */
export interface HaltDecision {
  /** True when a red flag fired. False when the survey simply has enough. */
  redFlag: boolean;
  level: SafetyLevel;
  action: SafetyAction;
  /** Rule that fired. Stable id, for the audit trail. */
  ruleId: string;
  title: string;
  body: string;
  /**
   * When true, no medicine or self-medication guidance may be rendered at all,
   * not even for the symptoms that look benign.
   */
  suppressMedication: boolean;
  /** Machine-readable reasons, e.g. ['difficulty_breathing']. */
  triggers: string[];
}

// ── The result of asking "what next?" ────────────────────────────────────────

export interface SelectionDecision {
  /** The question to ask, or null when the survey should stop. */
  node: QuestionNode | null;
  /**
   * Why the survey stops. Null while a question is still outstanding.
   *
   * `'red_flag'` is the important one: it means stop now, do not finish the
   * questionnaire, and route to urgent care.
   */
  stopReason:
    | null
    | 'red_flag'
    | 'sufficient_information'
    | 'no_candidate_questions'
    | 'session_cap';
  /** Everything considered and dropped, with the rule that dropped it. */
  skipped: SkippedQuestion[];
  /** Topics already covered, for the audit trail and the progress display. */
  coveredTopics: Topic[];
  /** Topics still worth filling. Drives the "enough information" test. */
  outstandingTopics: Topic[];
  /** Presenting symptom-set ids the graph walked. */
  activeSymptomSets: string[];
  /**
   * Set only when `stopReason` is `'red_flag'`.
   *
   * Carried on the decision rather than returned separately so a caller cannot
   * receive a stop without the notice to show. `suppressMedication` on it is
   * binding: no self-medication guidance is rendered while this is present.
   */
  halt?: HaltDecision;
}
