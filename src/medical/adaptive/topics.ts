/**
 * Topics, and the equivalence classes that make them work.
 *
 * A topic answers one question: "what do we already know?" Three mechanisms
 * build on it, and they are listed here together because they only make sense as
 * a set:
 *
 *   1. **Naming.** `<facet>.<subject>`, e.g. `duration.fever`, `nature.cough`.
 *      The subject is what keeps two symptoms' timelines apart, because "how
 *      long have you had your cough" and "how long have you had your fever" can
 *      have genuinely different answers.
 *
 *   2. **Narrowing.** An answer to `duration.fever` also closes `duration`,
 *      because "how long have you had this problem" is now answered. Narrowing is
 *      one-directional on purpose: a generic answer covers the specifics, a
 *      specific answer does not cover the other specifics. Two symptoms with
 *      different timelines must be allowed to say so.
 *
 *   3. **Aliasing.** Several symptom sets each carry their own "do you have a
 *      fever?" question. They are the same topic, so one is asked, but every
 *      dependent question still needs to see the answer, whichever sibling
 *      happened to ask it. That is what the alias groups are for.
 */
import type { Topic } from './types';

/**
 * Subjects, keyed by symptom-set id.
 *
 * The subject is deliberately not always the set id: `chest_pain` and
 * `breathlessness` are separate clinical questions that share a body system, and
 * collapsing them would lose a real distinction.
 */
export const SET_SUBJECT: Record<string, string> = {
  cough: 'cough',
  fever: 'fever',
  headache: 'headache',
  sore_throat: 'sore_throat',
  abdominal_pain: 'abdominal',
  chest_pain: 'chest',
  back_pain: 'back',
  vomiting: 'vomiting',
  diarrhoea: 'diarrhoea',
  dizziness: 'dizziness',
  fatigue: 'fatigue',
  breathlessness: 'breath',
  skin_rash: 'skin',
  urinary: 'urinary',
  joint_pain: 'joint',
};

/** Generic answer keys that stand in for a whole facet. */
export const GENERIC_BY_FACET: Record<string, Topic> = {
  duration: 'duration.generic',
  severity: 'severity.generic',
  trajectory: 'trajectory.generic',
  nature: 'nature.generic',
  context: 'context.generic',
  pattern: 'pattern.generic',
  location: 'location.generic',
  screen: 'screen.generic',
};

/**
 * Questions that all measure the same thing under different wording.
 *
 * The list is the answer to "never ask two questions that collect essentially the
 * same information" for the cases where the *question key* differs but the
 * *information* does not. Each group is one topic; only one member is ever asked,
 * chosen by utility, and the answer is readable through `reported`.
 */
export const YES_NO_ALIAS_GROUPS: Record<Topic, string[]> = {
  // Nine symptom sets each ask their own fever question. One is enough.
  'red_flag.fever_present': [
    'high_fever', 'cough_fever', 'throat_fever', 'abdo_fever', 'rash_fever',
    'diarrhoea_fever', 'joint_fever', 'vomit_fever', 'fever_reported',
  ],
  // "Are you finding it harder to breathe?" asked six different ways.
  'red_flag.breathlessness': [
    'breathlessness', 'cough_breathless', 'fever_breathless', 'throat_breathless',
    'chest_breathless', 'breathless_reported',
  ],
  // Confusion, fainting and drowsiness are one safety question to a patient.
  'red_flag.altered_sensorium': [
    'altered_sensorium', 'fever_confusion', 'consciousness_reported',
  ],
  // Any blood, from any source, is the same warning sign to the person reading it.
  // `stomach_bleeding` is the core screen question, so it is in the same group as
  // the per-set versions: whichever one gets answered, none of the others should.
  'red_flag.bleeding': [
    'stomach_bleeding', 'abdo_blood', 'vomit_blood', 'diarrhoea_blood', 'urinary_blood',
  ],
};

/** Reverse index: question key → the topic it is an alias of. */
export const ALIAS_OF_KEY: Record<string, Topic> = (() => {
  const index: Record<string, Topic> = {};
  for (const [topic, keys] of Object.entries(YES_NO_ALIAS_GROUPS)) {
    for (const key of keys) index[key] = topic;
  }
  return index;
})();

/** Keys belonging to a topic, including the topic's own primary key. */
export function aliasKeys(topic: Topic): string[] {
  return YES_NO_ALIAS_GROUPS[topic] ?? [];
}

/**
 * Topics an answer to `topic` also satisfies.
 *
 * Narrowing only, never widening: `duration.fever` covers `duration.generic`, but
 * `duration.generic` does not cover `duration.fever` or `duration.cough`, because
 * a cough and a fever can absolutely have started on different days.
 */
export function narrowedTopics(topic: Topic): Topic[] {
  const [facet] = topic.split('.');
  if (!facet) return [topic];
  const generic = GENERIC_BY_FACET[facet];
  return generic && generic !== topic ? [topic, generic] : [topic];
}

/**
 * True when the topic is already satisfied.
 *
 * A specific topic is covered by its generic form; a generic topic is covered by
 * *any* specific form. That asymmetry is the whole point of the narrowing rule
 * above and is the one place a reader should look twice.
 */
export function isCovered(topic: Topic, covered: ReadonlySet<Topic>): boolean {
  if (covered.has(topic)) return true;
  const [facet, subject] = topic.split('.');
  if (!facet) return false;
  const generic = GENERIC_BY_FACET[facet];
  if (!generic) return false;
  if (!subject) {
    // Generic candidate: any specific answer to this facet covers it.
    for (const known of covered) {
      if (known.startsWith(`${facet}.`)) return true;
    }
    return covered.has(generic);
  }
  // Specific candidate. Exact match only.
  //
  // Deliberately *not* `covered.has(generic)`. That direction is the widening
  // `narrowedTopics` exists to prevent: answering "how long has your cough lasted"
  // covers `duration.generic`, but it must not then suppress "what colour is your
  // mucus" or any other specific question in a different namespace. A generic
  // answer means "this facet has been established for the complaint", not "every
  // specific question in this facet has been answered".
  return false;
}

// ── Facet vocabulary ─────────────────────────────────────────────────────────

/** The facets the sufficiency check requires before it will stop asking. */
export const FACETS = {
  duration: 'duration',
  severity: 'severity',
  trajectory: 'trajectory',
  redFlag: 'red_flag',
  context: 'context',
  nature: 'nature',
} as const;

/** Safety-critical facets. Coverage of these is never optional. */
export const SAFETY_FACETS: ReadonlySet<string> = new Set(['red_flag']);

/**
 * The red-flag topics that must be screened before the engine may stop.
 *
 * This is the engine's own definition of a complete safety screen. It is a
 * subset of the alias groups plus the numeric and combination-dependent flags,
 * because a topic that is only reachable through a branch (a very high
 * temperature) is covered by that branch being taken rather than asked directly.
 */
export const REQUIRED_SCREEN_TOPICS: readonly Topic[] = [
  'red_flag.chest_pain',
  'red_flag.breathlessness',
  'red_flag.stiff_neck',
  'red_flag.altered_sensorium',
  'red_flag.stroke',
  'red_flag.bleeding',
  'red_flag.jaundice',
  'red_flag.non_blanching_rash',
  'red_flag.severe_allergic_reaction',
  'red_flag.dehydration',
  'red_flag.rapid_worsening_pain',
  'red_flag.fever_present',
];
