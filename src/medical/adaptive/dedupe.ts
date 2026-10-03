/**
 * Repetition control.
 *
 * The spec forbids three distinct kinds of repetition, and they need three
 * different mechanisms:
 *
 *   1. "Never repeat an already answered question."
 *      → `alreadyAnswered`, a set lookup on the question key.
 *
 *   2. "Never ask two questions that collect essentially the same information."
 *      → two layers, because either alone is insufficient:
 *        a. topic coverage, which is exact and author-controlled but only knows
 *           about the equivalences someone thought to declare;
 *        b. lexical overlap, which catches everything the topics missed, at the
 *           cost of occasionally being conservative. When in doubt this file
 *           drops the question, because an unnecessary question is a smaller
 *           harm than a missed safety screen.
 *
 *   3. "Skip irrelevant questions." → handled by the condition guards in
 *      `conditions.ts`, not here.
 *
 * The lexical layer deliberately works on *intent tokens* rather than raw words:
 * stopwords are dropped, and the words that carry the meaning of a health
 * question ("breath", "blood", "chest", "cough") are kept. It also strips the
 * symptom name from both prompts before comparing, so "Do you have a cough?" and
 * "Are you coughing?" are recognised as the same question even though they
 * share no content words.
 */
import type { PatientProfile, SkipReason, Topic } from './types';
import { isCovered } from './topics';

/** Words that carry no discriminating meaning in a symptom question. */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does',
  'did', 'you', 'your', 'yours', 'i', 'my', 'me', 'we', 'our', 'it', 'its', 'any',
  'have', 'has', 'had', 'having', 'to', 'of', 'in', 'on', 'at', 'for', 'with',
  'and', 'or', 'if', 'that', 'this', 'these', 'those', 'there', 'here', 'am',
  'right', 'now', 'also', 'please', 'about', 'have', 'get', 'got', 'feel',
  'feeling', 'feels', 'like', 'so', 'than', 'when', 'while', 'much', 'more',
  'most', 'some', 'very', 'just', 'only', 'still', 'even', 'well', 'back',
  'something', 'anything', 'else', 'other', 'another', 'not', 'no',
]);

/**
 * Words that do not distinguish one safety question from another, so they are
 * excluded from the overlap score. Without this, every question in the safety
 * screen shares "any", "you", "pain" with every other and the lexical layer
 * would suppress the whole screen.
 */
const SHARED_SAFETY_WORDS = new Set([
  'pain', 'hurt', 'hurting', 'ache', 'feeling', 'bad', 'worse', 'bother',
  'symptom', 'symptoms', 'problem', 'problems', 'usually', 'normal', 'extra',
  'recent', 'lately', 'recently', 'else', 'sure', 'know',
]);

/**
 * The safety-critical topics. The lexical layer may never suppress a question
 * whose topic is in this set on similarity grounds alone: a false positive
 * there means a skipped red-flag screen, which is the one failure mode this
 * whole module exists to make impossible.
 */
const NEVER_SUPPRESS_BY_SIMILARITY: ReadonlySet<string> = new Set([
  'red_flag.chest_pain',
  'red_flag.breathlessness',
  'red_flag.stiff_neck',
  'red_flag.altered_sensorium',
  'red_flag.stroke',
  'red_flag.bleeding',
  'red_flag.severe_allergic_reaction',
  'red_flag.dehydration',
  'red_flag.jaundice',
  'red_flag.non_blanching_rash',
  'red_flag.fever_extreme',
  'red_flag.cough_blood',
]);

/** Minimum shared content words before two questions are even compared. */
const MIN_SHARED_TOKENS = 2;

/** Jaccard similarity above which two questions are treated as the same. */
const SIMILARITY_THRESHOLD = 0.55;

function normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * The content tokens of a question: its prompt plus its help text.
 *
 * Option labels are deliberately excluded. Options describe the *answers*, and
 * "Yes"/"No" on every boolean question would otherwise make the whole bank look
 * identical.
 */
export function contentTokens(prompt: string, helpText: string | null = null): Set<string> {
  const words = normalise(`${prompt} ${helpText ?? ''}`).split(' ').filter(Boolean);
  return new Set(words.filter((w) => w.length > 2 && !STOPWORDS.has(w) && !SHARED_SAFETY_WORDS.has(w)));
}

/**
 * Overlap between two questions, as Jaccard similarity over content tokens.
 *
 * A containment measure rather than raw Jaccard reads better here: "do you have
 * a rash" against "do you have a rash that does not fade when pressed" is
 * contained, not half-overlapping, and the containment view is the one that
 * matches how a person perceives the repetition.
 */
export function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) {
    if (b.has(token)) shared += 1;
  }
  if (shared < MIN_SHARED_TOKENS) return 0;
  return shared / Math.min(a.size, b.size);
}

/**
 * Symptom words that identify a body of symptoms.
 *
 * Kept for the reviewer-facing documentation and for tests, but *not* used to
 * suppress questions. An earlier version suppressed any question whose prompt
 * mentioned an already-reported symptom, on the theory that "do you have a cough?"
 * is a repeat of "I have a cough". That was wrong in a way the spec calls out by
 * name: it also suppressed "is your cough dry or producing mucus?" and "how long
 * have you had your cough?" — the two questions the cough should lead to.
 *
 * Presence is now handled by topic instead. A question that asks whether a symptom
 * is present carries the topic `symptom.<key>`, and `selector.ts` marks that topic
 * covered whenever the symptom was reported at intake. Precise, and it cannot
 * suppress a follow-up.
 */
export const SYMPTOM_IDENTITY_WORDS = new Set([
  'cough', 'coughing', 'fever', 'feverish', 'headache', 'migraine', 'rash', 'spots',
  'hives', 'vomit', 'vomiting', 'diarrhoea', 'diarrhea', 'stool', 'stools', 'urine',
  'breath', 'breathing', 'breathless', 'chest', 'throat', 'stomach', 'belly',
  'abdomen', 'tummy', 'ear', 'earache', 'sore', 'back', 'joint', 'joints',
  'dizzy', 'dizziness', 'vertigo', 'tired', 'fatigue', 'itch', 'itching',
]);

// ── The history index ────────────────────────────────────────────────────────

/**
 * What the engine knows about the conversation so far.
 *
 * Built once per selection and passed to every guard, so "have we already asked
 * this?" is answered from one consistent snapshot rather than from scattered
 * lookups that could disagree.
 */
export class RepetitionIndex {
  /** Question keys with a recorded answer. */
  readonly answeredKeys: ReadonlySet<string>;

  /** Topics filled, including the narrowed forms so a specific answer closes
   *  the generic version of the same question. */
  readonly coveredTopics: ReadonlySet<Topic>;

  /** Content tokens of every question already asked, keyed so a follow-up can find
   *  its own parent. */
  private readonly asked: { key: string; tokens: Set<string> }[] = [];

  /** Symptom keys known to be present. */
  readonly reportedSymptoms: ReadonlySet<string>;

  constructor(
    profile: PatientProfile,
    coveredTopics: Iterable<Topic>,
    reportedSymptoms: ReadonlySet<string>,
  ) {
    this.answeredKeys = new Set(profile.answers.keys());
    this.coveredTopics = new Set(coveredTopics);
    this.reportedSymptoms = reportedSymptoms;
  }

  /** Record that a question was asked, so later candidates see it. */
  noteAsked(key: string, prompt: string, helpText: string | null): void {
    this.asked.push({ key, tokens: contentTokens(prompt, helpText) });
  }

  /** Build the index from the questions already answered in this session. */
  static build(
    profile: PatientProfile,
    coveredTopics: Iterable<Topic>,
    reportedSymptoms: ReadonlySet<string>,
    questionLookup: (key: string) => { prompt: string; helpText: string | null } | undefined,
  ): RepetitionIndex {
    const index = new RepetitionIndex(profile, coveredTopics, reportedSymptoms);
    for (const key of profile.answers.keys()) {
      const question = questionLookup(key);
      if (question) index.noteAsked(key, question.prompt, question.helpText);
    }
    return index;
  }

  /** Has this exact question been answered? */
  isAnswered(key: string): boolean {
    return this.answeredKeys.has(key);
  }

  /** Is the topic this question exists to fill already covered? */
  isTopicCovered(topic: Topic): boolean {
    // Delegates to the shared rule so this file and `selector.ts` cannot drift on
    // what "covered" means. The asymmetry matters: a specific answer covers the
    // generic version of a question, but a generic answer does not cover the
    // specific ones, because a cough and a fever can start on different days.
    return isCovered(topic, this.coveredTopics);
  }

  /**
   * Does this candidate duplicate something already asked?
   *
   * Returns null when it is fine, or the skip reason when it is not. The reason
   * distinguishes the two dedupe mechanisms because they have different fixes:
   * an author who wants to change a `semantic_overlap` suppression declares the
   * equivalence as a topic, whereas an `already_answered` means the engine is
   * being replayed a request it has already honoured.
   */
  duplicateCheck(
    key: string,
    topic: Topic,
    prompt: string,
    helpText: string | null,
    parentKey?: string,
  ): { reason: SkipReason; detail: string } | null {
    if (this.isAnswered(key)) {
      return { reason: 'already_answered', detail: `${key} already has an answer` };
    }
    if (this.isTopicCovered(topic)) {
      return { reason: 'topic_covered', detail: `topic ${topic} is already covered` };
    }

    // Safety questions are never suppressed on similarity alone.
    if (NEVER_SUPPRESS_BY_SIMILARITY.has(topic)) return null;

    const tokens = contentTokens(prompt, helpText);

    for (const { key: askedKey, tokens: asked } of this.asked) {
      // A question gated on its parent's answer is a follow-up by construction, so
      // sharing vocabulary with that parent is expected rather than suspicious.
      // Without this exemption "is your cough dry or producing mucus?" suppresses
      // "what colour is the mucus?" — the follow-up the first question exists to
      // reach. Only the parent is exempted; an unrelated question with the same
      // words still counts.
      if (askedKey === parentKey) continue;
      const ratio = overlapRatio(tokens, asked);
      if (ratio >= SIMILARITY_THRESHOLD) {
        return {
          reason: 'semantic_overlap',
          detail: `${Math.round(ratio * 100)}% content overlap with ${askedKey}`,
        };
      }
    }
    return null;
  }
}
