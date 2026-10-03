/**
 * The selector: given everything known, what is the next question?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CLINICAL REVIEW REQUIRED
 * The sufficiency test decides when a session is allowed to stop asking. A
 * clinician must confirm that the facets below are the ones that actually change
 * the advice. See `REVIEW_STATUS` in `types.ts`.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ── Order of operations, and why ─────────────────────────────────────────────
 *
 *   1. SEED      what the opening text already told us
 *   2. SCREEN    red flags — before anything else, every call
 *   3. RELEVANCE do the guards hold
 *   4. KNOWN     has this already been answered, by key or by topic
 *   5. NOVELTY   is this a near-duplicate in wording
 *   6. SUFFICIENCY is there enough to give advice
 *   7. UTILITY   among what survives, what is most worth asking
 *
 * The screen comes second, before relevance, because a red flag does not need a
 * relevant question to have been asked — it needs to be *known*. And it comes
 * before the sufficiency test, because "we have enough information" must never
 * beat "this person needs emergency care".
 *
 * Every stage records what it dropped and why. That record is the audit trail: if
 * somebody thinks the engine asked a silly question, `skipped` says which rule
 * fired instead of leaving them to guess.
 */
import type { SymptomQuestion } from '../../types/medical';
import type {
  PatientProfile,
  QuestionNode,
  SelectionDecision,
  SkippedQuestion,
  Topic,
} from './types';
import { NODE_BY_KEY, activeNodes, parentKeyOf } from './nodes';
import { EvalContext, evalContext, isRelevant } from './conditions';
import { RepetitionIndex } from './dedupe';
import { evaluateRedFlags } from './red-flags';
import { seedFromText } from './seed';
import { reportedSymptoms } from './profile';
import { FACETS, REQUIRED_SCREEN_TOPICS, SET_SUBJECT, isCovered, narrowedTopics } from './topics';
import { MAX_QUESTIONS_PER_SESSION } from '../../data/question-bank';

/** Lookup shape the repetition index and condition evaluator need. */
export const QUESTION_LOOKUP = new Map<string, { key: string; kind: string }>(
  [...NODE_BY_KEY.values()].map((node) => [node.key, node.question]),
);

/**
 * Facets that must be covered before the engine will stop asking.
 *
 * Duration, severity and trajectory because they are what turn a symptom list
 * into advice — how long, how bad, and which way it is going are the three
 * answers that change what someone should do. The safety screen because none of
 * the other two matter if something dangerous was missed.
 */
const REQUIRED_FACETS: readonly string[] = [FACETS.duration, FACETS.severity, FACETS.trajectory];

/**
 * Facets that must be walked before the engine will stop.
 *
 * The screen and the three timeline facets are not enough on their own. A patient
 * who says "I have a cough" has, by definition, not yet been asked whether it is
 * dry or productive, and that question is the whole point of taking a history. So
 * the engine also refuses to finish while it can still ask something about the
 * *shape* of the complaint — its nature, or a pattern that goes with it.
 *
 * Only these two facets, deliberately. `history` and `context` are excluded,
 * because "have you travelled recently" is worth asking and is not worth holding a
 * session open for; those are ordered by utility and the cap decides whether they
 * fit.
 */
const BRANCH_FACETS: readonly string[] = [FACETS.nature, 'pattern'];

/**
 * The profile as the engine sees it: real answers, plus anything the opening text
 * already established.
 *
 * The seeded answers are merged rather than kept separate, which is the point.
 * Someone who types "I've had a cough for three days and I can't breathe" has
 * answered two questions, and the screen has to see the second one immediately —
 * not after the engine works round to asking about breathing on its own.
 */
function effectiveProfile(profile: PatientProfile): {
  profile: PatientProfile;
  seeds: ReturnType<typeof seedFromText>;
} {
  const seeds = seedFromText(profile.freeText);
  if (Object.keys(seeds.impliedAnswers).length === 0) return { profile, seeds };

  const answers = new Map(profile.answers);
  for (const [key, value] of Object.entries(seeds.impliedAnswers)) {
    // A real answer always wins. Text mined later should never overwrite something
    // the patient clicked.
    if (!answers.has(key)) answers.set(key, value);
  }

  return { profile: { ...profile, answers }, seeds };
}

/**
 * Topics filled so far, from both sources.
 *
 * An answer fills its own topic, the generic form of that topic, and anything it
 * declares in `alsoCovers`. That last part is what lets one question close several
 * doors — the cough-character questions and the pregnancy question both work this
 * way.
 */
export function coveredTopics(
  profile: PatientProfile,
  seedTopics: ReadonlySet<Topic>,
): Set<Topic> {
  const covered = new Set<Topic>();

  for (const topic of symptomTopics(profile)) {
    covered.add(topic);
    for (const narrowed of narrowedTopics(topic)) covered.add(narrowed);
  }

  for (const topic of seedTopics) {
    covered.add(topic);
    for (const narrowed of narrowedTopics(topic)) covered.add(narrowed);
  }

  for (const key of profile.answers.keys()) {
    const node = NODE_BY_KEY.get(key);
    if (!node) continue;
    covered.add(node.topic);
    for (const narrowed of narrowedTopics(node.topic)) covered.add(narrowed);
    for (const extra of node.alsoCovers ?? []) {
      covered.add(extra);
      for (const narrowed of narrowedTopics(extra)) covered.add(narrowed);
    }
  }

  return covered;
}

/**
 * Topics satisfied by the complaint itself, without any question being asked.
 *
 * The intake form collects symptoms. Somebody who ticks "Cough", or types "I have a
 * cough", has already answered "do you have a cough?", so any question whose only
 * purpose is to establish that a symptom is present is a repeat.
 *
 * That is the mechanism behind the spec's worked example, and it is deliberately
 * topic-keyed rather than wording-keyed: `symptom.cough` is filled by the intake,
 * which suppresses "are you coughing?" and "do you also have a cough?" while
 * leaving "is your cough dry or productive?" and "how long has it lasted?" alone.
 * Those are not repeats, they are the questions the complaint is supposed to lead
 * to. A wording-based rule cannot tell the two apart; a topic can.
 */
export function symptomTopics(profile: PatientProfile): Topic[] {
  const topics = profile.symptoms.map((key) => `symptom.${key}`);
  // An opened symptom set is itself a report of the symptom it is named after.
  for (const id of profile.symptomSets) topics.push(`symptom.${id}`);
  return topics;
}

/**
 * Topics still worth filling, and whether they are enough to stop.
 *
 * `reachable` is the set of topics some eligible node would fill. It matters
 * because relevance guards can make a screen question legitimately unaskable for a
 * presentation — nobody needs to be asked about jaundice for a cough — and a
 * required topic that nothing can ask must not keep the session open forever. A
 * topic the engine cannot ask about is treated as satisfied; a topic it *could*
 * ask about and has not is a real gap.
 */
function sufficiency(
  covered: ReadonlySet<Topic>,
  reachable: ReadonlySet<Topic>,
): { satisfied: boolean; outstanding: Topic[] } {
  const outstanding: Topic[] = [];

  for (const topic of REQUIRED_SCREEN_TOPICS) {
    if (isCovered(topic, covered)) continue;
    if (!reachable.has(topic)) continue;
    outstanding.push(topic);
  }
  for (const facet of REQUIRED_FACETS) {
    // The generic form is enough: a specific answer already covers it, and a
    // generic answer satisfies the facet even when no specific one exists for the
    // presenting complaint.
    if (isCovered(facet, covered)) continue;
    if (!reachable.has(facet) && ![...reachable].some((topic) => topic.startsWith(`${facet}.`))) {
      // No duration question exists for this presentation at all. Asking about a
      // timeline that cannot apply would be noise, so the facet is satisfied by
      // its absence — which is a distinct claim from "answered", and is why this
      // is written as an explicit allowance rather than a default.
      continue;
    }
    outstanding.push(facet);
  }

  // The complaint has to be characterised before the session can end.
  for (const topic of reachable) {
    const [facet] = topic.split('.');
    if (facet && BRANCH_FACETS.includes(facet) && !isCovered(topic, covered)) {
      outstanding.push(topic);
    }
  }

  return { satisfied: outstanding.length === 0, outstanding };
}

/**
 * Drop the generic form of a shared facet when a specific one is available.
 *
 * The core block asks "how long have you had this?" and the cough set asks "how
 * long have you had your cough?". Both are legitimate, but asking both wastes a
 * question on a patient whose cough is the only complaint, and the specific one is
 * the more informative answer — it is the one that can differ from another symptom
 * in the same session.
 *
 * So the generic candidate steps aside whenever a specific candidate for the same
 * facet is in scope. This is the one place the engine deliberately asks the *more*
 * particular question, and it is why it is written as an explicit rule rather than
 * left to the utility ordering.
 */
function deferGenericFacetCandidates(
  candidates: QuestionNode[],
  activeSets: readonly string[],
  skipped: SkippedQuestion[],
): void {
  const subjects = new Set(activeSets.map((id) => SET_SUBJECT[id]).filter(Boolean));
  const hasSpecific = (facet: string) =>
    candidates.some((node) => {
      const [nodeFacet, subject] = node.topic.split('.');
      return nodeFacet === facet && subject !== undefined && subjects.has(subject);
    });

  const keep = candidates.filter((node) => {
    const [facet, subject] = node.topic.split('.');
    if (subject !== undefined || !facet) return true;
    if (facet !== FACETS.duration && facet !== FACETS.severity && facet !== FACETS.trajectory) {
      return true;
    }
    if (!hasSpecific(facet)) return true;
    skipped.push({
      key: node.key,
      reason: 'deferred_behind_branch',
      detail: `${facet} for a specific symptom is available, so the generic question stands down`,
    });
    return false;
  });

  candidates.length = 0;
  candidates.push(...keep);
}

/**
 * Tie-break order among equally eligible questions.
 *
 * Utility first, then the bank order. The second key matters more than it looks:
 * the reviewed bank's `priority` encodes clinical intent, and a 3-way tie on an
 * authored node should not let a new question displace an established one.
 */
function betterThan(a: QuestionNode, b: QuestionNode): boolean {
  if (a.utility !== b.utility) return a.utility > b.utility;
  const ap = a.question.priority ?? 0;
  const bp = b.question.priority ?? 0;
  if (ap !== bp) return ap < bp;
  return a.key.localeCompare(b.key) < 0;
}

/**
 * Pick the next question, or decide the session is over.
 *
 * Pure: the same profile always produces the same decision, so the questionnaire
 * can be replayed from stored answers and the audit trail will match.
 */
export function selectNextQuestion(profile: PatientProfile): SelectionDecision {
  const { profile: effective, seeds } = effectiveProfile(profile);
  // `SeededFacts.topics` is an array because it is persisted as JSON; the
  // evaluator wants set membership. Converted once here rather than at each use.
  const seeded = new Set<Topic>(seeds.topics);
  const covered = coveredTopics(effective, seeded);

  const context: EvalContext = evalContext(effective, covered, seeded, QUESTION_LOOKUP);

  const activeSets = [...new Set(profile.symptomSets)];

  // ── Stage 2: the screen, on every single call ──────────────────────────────
  const halt = evaluateRedFlags(context);
  if (halt) {
    return {
      node: null,
      stopReason: 'red_flag',
      skipped: [],
      coveredTopics: [...covered],
      outstandingTopics: [],
      activeSymptomSets: activeSets,
      halt,
    };
  }

  const symptoms = reportedSymptoms(effective);
  const index = RepetitionIndex.build(
    effective,
    covered,
    symptoms,
    (key) => NODE_BY_KEY.get(key)?.question,
  );

  const skipped: SkippedQuestion[] = [];
  const candidates: QuestionNode[] = [];

  for (const node of activeNodes(profile)) {
    // ── Stage 4a: already answered, by key ───────────────────────────────────
    if (index.isAnswered(node.key)) {
      skipped.push({ key: node.key, reason: 'already_answered', detail: 'has a recorded answer' });
      continue;
    }

    // ── Stage 4b: covered by topic, from an answer or from the opening text ──
    if (index.isTopicCovered(node.topic)) {
      skipped.push({
        key: node.key,
        reason: 'topic_covered',
        detail: `topic ${node.topic} is already covered`,
      });
      continue;
    }

    // ── Stages 3 and 5: relevance, then novelty ──────────────────────────────
    if (!isRelevant(node.requires, node.forbids, context)) {
      skipped.push({ key: node.key, reason: 'irrelevant', detail: 'relevance guard did not hold' });
      continue;
    }

    const duplicate = index.duplicateCheck(
      node.key,
      node.topic,
      node.question.prompt,
      node.question.helpText ?? null,
      parentKeyOf(node),
    );
    if (duplicate) {
      skipped.push({ key: node.key, reason: duplicate.reason, detail: duplicate.detail });
      continue;
    }

    if (node.informs.length === 0) {
      skipped.push({
        key: node.key,
        reason: 'no_decision_value',
        detail: 'answer cannot change the advice',
      });
      continue;
    }

    candidates.push(node);
  }

  const reachable = new Set<Topic>(candidates.map((node) => node.topic));
  const { satisfied, outstanding } = sufficiency(covered, reachable);
  deferGenericFacetCandidates(candidates, activeSets, skipped);

  // ── Stage 6: is there enough to give advice? ───────────────────────────────
  // Checked before the cap, and before "no candidates", because both of those can
  // happen while the screen is still incomplete and the difference matters: an
  // incomplete screen is not a finished questionnaire.
  if (satisfied) {
    return {
      node: null,
      stopReason: 'sufficient_information',
      skipped,
      coveredTopics: [...covered],
      outstandingTopics: outstanding,
      activeSymptomSets: activeSets,
    };
  }

  if (effective.answers.size >= MAX_QUESTIONS_PER_SESSION) {
    for (const node of candidates) {
      skipped.push({
        key: node.key,
        reason: 'session_cap',
        detail: `${MAX_QUESTIONS_PER_SESSION} questions already asked`,
      });
    }
    return {
      node: null,
      stopReason: 'session_cap',
      skipped,
      coveredTopics: [...covered],
      outstandingTopics: outstanding,
      activeSymptomSets: activeSets,
    };
  }

  if (candidates.length === 0) {
    return {
      node: null,
      stopReason: 'no_candidate_questions',
      skipped,
      coveredTopics: [...covered],
      outstandingTopics: outstanding,
      activeSymptomSets: activeSets,
    };
  }

  // ── Stage 7: among survivors, the most worth asking ────────────────────────
  const best = candidates.reduce((a, b) => (betterThan(a, b) ? a : b));

  return {
    node: best,
    stopReason: null,
    skipped,
    coveredTopics: [...covered],
    outstandingTopics: outstanding,
    activeSymptomSets: activeSets,
  };
}

/**
 * The shape of a session, for tests and for the audit trail.
 *
 * This walks the graph the way a patient would: take the best question, mark it
 * answered, ask again. What it produces is the *sequence*, not a prediction of the
 * real session — a real answer opens branches this walk does not open, so a real
 * session is usually shorter. Two consequences worth knowing before writing an
 * assertion against it:
 *
 *   * a branch gated on a specific answer value stays shut here, because the walk
 *     records no value, so `fever_consulted: 'yes'` is never assumed;
 *   * nothing here can halt on a red flag, because a red flag needs an answer.
 *
 * That makes it the right tool for "is this question ever reachable" and the wrong
 * tool for "what does a patient with X see". For the latter, call `selectNextQuestion`
 * in a loop with real answers.
 */
export function planQuestions(profile: PatientProfile, limit = MAX_QUESTIONS_PER_SESSION): SymptomQuestion[] {
  const answers = new Map(profile.answers);
  const plan: SymptomQuestion[] = [];

  for (let i = 0; i < limit; i += 1) {
    const decision = selectNextQuestion({ ...profile, answers });
    if (!decision.node) break;
    plan.push(decision.node.question);
    // Presence marks it answered, an empty value keeps every value-specific guard
    // shut. That is the conservative direction: the walk never invents a symptom.
    answers.set(decision.node.key, '');
  }

  return plan;
}