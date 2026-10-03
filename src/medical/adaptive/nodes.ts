/**
 * The graph: every existing question, plus the adaptive ones, as nodes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CLINICAL REVIEW REQUIRED
 * The topic assignments below decide which questions are treated as duplicates of
 * each other, so a wrong entry either hides a question or asks one twice. Both are
 * clinical outcomes, not cosmetic ones. A clinician must review `TOPIC_BY_KEY`
 * before real patient use. See `REVIEW_STATUS` in `types.ts`.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ── Why most questions are annotated by rule ─────────────────────────────────
 *
 * There are 136 questions. Hand-writing a topic for each would produce a 136-line
 * table that is wrong in exactly one way: one row drifts out of step with a
 * rename and starts silently deduplicating against the wrong thing. So the table
 * holds only the questions whose topic is *not* mechanical — the ones where the
 * same clinical fact is asked under different names by different sets — and
 * everything else derives from its key and its symptom set.
 *
 * The derivation rules are deliberately boring: `<set>_<facet>` becomes
 * `<facet>.<subject>` for the three facets that mean the same thing everywhere
 * (duration, severity, trajectory) and `screening.<subject>.<facet>` for the rest.
 *
 * ── What "one topic" has to survive ──────────────────────────────────────────
 *
 * A topic is the answer to "do we already know this?". That has to hold up across
 * two different cases:
 *
 *   1. the same question reached two routes — a cough that also has a fever opens
 *      both the cough and fever sets, and both sets ask whether there is a fever;
 *   2. the same fact under two names — `stomach_bleeding` at intake and `abdo_blood`
 *      in the abdominal set are one warning sign, not two.
 *
 * The first is handled by topic aliasing, the second by an explicit table entry.
 */
import type { SymptomQuestion } from '../../types/medical';
import type { Condition, DecisionUse, PatientProfile, QuestionNode, Topic } from './types';
import { ADAPTIVE_NODES } from './adaptive-questions';
import { CORE_QUESTIONS } from '../../data/question-bank';
import { SHARED_QUESTIONS, SYMPTOM_SETS } from '../../data/symptom-sets';
import { SET_SUBJECT, YES_NO_ALIAS_GROUPS } from './topics';
import { any, all, answered, known, reported, withSymptom } from './conditions';

// ── Explicit topics ───────────────────────────────────────────────────────────
//
// Only questions whose topic is a clinical judgement rather than a consequence of
// their name. Grouped by the facet they belong to.

/** Core intake screen. Asked for every session; the safety backstop. */
const CORE_TOPIC_BY_KEY: Record<string, Topic> = {
  chest_pain: 'red_flag.chest_pain',
  breathlessness: 'red_flag.breathlessness',
  stiff_neck: 'red_flag.stiff_neck',
  high_fever: 'red_flag.fever_present',
  fever_max: 'severity.fever',
  red_spots_over_body: 'red_flag.non_blanching_rash',
  stomach_bleeding: 'red_flag.bleeding',
  weakness_of_one_body_side: 'red_flag.stroke',
  altered_sensorium: 'red_flag.altered_sensorium',
  yellowing_of_eyes: 'red_flag.jaundice',
  duration: 'duration.generic',
  severity: 'severity.generic',
  trajectory: 'trajectory.generic',
  takes_medication: 'context.regular_medication',
  medication_list: 'context.medication_list',
  existing_conditions: 'history.conditions',
  condition_list: 'history.condition_list',
};

/**
 * Relevance guards for the core screen.
 *
 * The old bank asked all ten core safety questions of everybody, which is safe and
 * wasteful in equal measure: a 34-year-old with a cough was asked about jaundice,
 * and about one-sided weakness, before being asked how long the cough had lasted.
 *
 * Gating them on what the patient actually presented with is the whole point of the
 * engine, but it has to be done carefully in one direction only. These guards may
 * make a question *unaskable for this presentation*; nothing here can make a
 * genuinely applicable warning sign disappear, because the complaint-linked ones
 * are exactly the ones the complaint triggers. Anything not listed is asked of
 * everybody: chest pain, breathlessness, a fever, and reduced awareness stay
 * universal, because those are the four that can be fatal regardless of what else
 * is going on.
 */
const CORE_GUARD_BY_KEY: Record<string, Condition> = {
  // Relevant when there is a neck, a head or a fever to stiffen.
  stiff_neck: any(
    reported('red_flag.fever_present'),
    withSymptom('neck_pain', 'stiff_neck', 'headache'),
    { on: 'symptom', key: 'fever' },
  ),

  // Jaundice presents with abdominal symptoms, with new medication, or with the
  // non-specific picture of being unwell. Asking an otherwise well patient with a
  // cough whether their eyes are yellow changes nothing.
  yellowing_of_eyes: any(
    withSymptom(
      'yellowish_skin', 'yellow_urine', 'yellowing_of_eyes', 'dark_urine',
      'abdominal_pain', 'stomach_pain', 'indigestion', 'nausea', 'vomiting',
    ),
    { on: 'symptom', key: 'abdominal_pain' },
    reported('red_flag.bleeding'),
    // Value-sensitive, not "was this asked". Knowing somebody is on medication is
    // relevant to jaundice; knowing we asked and they said no is not.
    answered('takes_medication', 'yes'),
    answered('existing_conditions', 'yes'),
  ),

  // Stroke signs are only actionable alongside a sudden onset or a neurological
  // complaint. Without either, a positive answer has nothing to attach to.
  weakness_of_one_body_side: any(
    answered('headache_onset', 'sudden', 'woke_me'),
    withSymptom(
      'dizziness', 'loss_of_balance', 'unsteadiness', 'muscle_weakness',
      'weakness_in_limbs', 'slurred_speech', 'visual_disturbances', 'blurred_and_distorted_vision',
    ),
    known('trajectory.headache'),
    reported('red_flag.neuro_focal'),
  ),

  // Bleeding is screened where there is a tract that can bleed.
  stomach_bleeding: any(
    withSymptom(
      'stomach_pain', 'abdominal_pain', 'belly_pain', 'distention_of_abdomen',
      'vomiting', 'nausea', 'diarrhoea', 'constipation', 'bloody_stool',
      'burning_micturition', 'spotting_urination',
    ),
    { on: 'symptom', key: 'abdominal_pain' },
    reported('red_flag.bleeding'),
  ),

  // A non-blanching rash is a fever question. Without a fever, unexplained red
  // spots still deserve a look, but a lower-priority path covers that through the
  // skin set rather than as a universal screen item.
  red_spots_over_body: any(
    reported('red_flag.fever_present'),
    withSymptom('skin_rash', 'itching', 'nodal_skin_eruptions', 'redness_of_eyes'),
    { on: 'symptom', key: 'skin_rash' },
  ),
};

/** The generic shared block, used when no symptom set is active. */
const SHARED_TOPIC_BY_KEY: Record<string, Topic> = {
  shared_severity: 'severity.generic',
  shared_trajectory: 'trajectory.generic',
  shared_medication: 'context.regular_medication',
  shared_conditions: 'history.conditions',
};

/**
 * Set questions whose topic is not derivable.
 *
 * Two kinds of entry appear here:
 *
 *   * questions that are a *second* route to a topic another set already owns —
 *     `cough_fever` and `high_fever` are the same fact asked twice, so they share
 *     `red_flag.fever_present`;
 *   * questions about a fact that exists only in one set — the cause of a chest
 *     infection, whether a rash is new — which get their own named topic so a
 *     reviewer can find them, rather than a generated one.
 */
const SET_TOPIC_BY_KEY: Record<string, Topic> = {
  // What the complaint actually *is*, as opposed to when it started or how bad it
  // is. These carry the `nature` facet deliberately: a symptom character question
  // is usually the first useful thing to ask, and without this the derivation
  // would file them under `screening.*` and rank them as mere detail.
  cough_type: 'nature.cough',
  throat_swallow: 'nature.sore_throat',
  throat_tonsils: 'nature.sore_throat',
  headache_location: 'nature.headache',
  headache_character: 'nature.headache',
  abdo_location: 'nature.abdominal',
  abdo_when: 'nature.abdominal',
  back_location: 'nature.back',
  back_movement: 'nature.back',
  dizzy_type: 'nature.dizziness',
  dizzy_onstanding: 'nature.dizziness',
  fatigue_type: 'nature.fatigue',
  cough_smoking: 'context.smoking',

  // Second routes to core screen topics.
  cough_fever: 'red_flag.fever_present',
  cough_breathless: 'red_flag.breathlessness',
  cough_chest_pain: 'red_flag.chest_pain',
  fever_breathless: 'red_flag.breathlessness',
  fever_stiff_neck: 'red_flag.stiff_neck',
  fever_confusion: 'red_flag.altered_sensorium',
  throat_fever: 'red_flag.fever_present',
  throat_breathless: 'red_flag.breathlessness',
  chest_breathless: 'red_flag.breathlessness',
  breath_chest_pain: 'red_flag.chest_pain',
  back_fever: 'red_flag.fever_present',
  vomit_fever: 'red_flag.fever_present',
  vomit_stiff_neck: 'red_flag.stiff_neck',
  diarrhoea_fever: 'red_flag.fever_present',
  rash_fever: 'red_flag.fever_present',
  urinary_fever: 'red_flag.fever_present',
  joint_fever: 'red_flag.fever_present',
  abdo_fever: 'red_flag.fever_present',

  // Second routes to the bleeding group.
  cough_blood: 'red_flag.cough_blood',
  abdo_blood: 'red_flag.bleeding',
  vomit_blood: 'red_flag.bleeding',
  diarrhoea_blood: 'red_flag.bleeding',
  urinary_blood: 'red_flag.bleeding',

  // Second routes to the dehydration group.
  vomit_fluids: 'red_flag.dehydration',
  diarrhoea_hydration: 'red_flag.dehydration',
  urinary_vomiting: 'red_flag.dehydration',

  // Core-namespace facts with a more precise topic.
  fever_max_temp: 'severity.fever',
  fever_source: 'nature.fever_source',
  fever_rash: 'red_flag.fever_rash',
  fever_recent_travel: 'history.recent_travel',

  headache_onset: 'trajectory.headache',
  headache_neuro: 'red_flag.neuro_focal',
  headache_head_injury: 'red_flag.head_injury',

  throat_lump_neck: 'red_flag.neck_lump',
  throat_antibiotics: 'context.recent_antibiotics',
  throat_cough: 'symptom.cough',

  abdo_severity: 'severity.abdominal',
  abdo_pattern: 'trajectory.abdominal',
  abdo_vomiting: 'symptom.vomiting',
  abdo_swelling: 'red_flag.abdominal_swelling',
  abdo_bowel: 'nature.bowel',

  chest_severity: 'severity.chest',
  chest_character: 'nature.chest_pain',
  chest_onset: 'trajectory.chest',
  chest_radiates: 'red_flag.chest_radiates',
  chest_sweaty: 'red_flag.associated_sweating',
  chest_history: 'history.cardiac',

  back_leg: 'red_flag.neuro_focal',
  back_numbness: 'red_flag.neuro_focal',
  back_bladder: 'red_flag.cauda_equina',

  vomit_count: 'severity.vomiting',
  vomit_abdo_pain: 'symptom.abdominal_pain',
  vomit_headache: 'red_flag.vomit_headache',
  vomit_food: 'context.vomit_food',

  diarrhoea_frequency: 'severity.diarrhoea',
  diarrhoea_vomiting: 'symptom.vomiting',
  diarrhoea_travel: 'history.recent_travel',
  diarrhoea_antibiotics: 'context.recent_antibiotics',

  dizzy_fainted: 'red_flag.syncope',
  dizzy_neuro: 'red_flag.neuro_focal',

  fatigue_weight: 'red_flag.weight_loss',
  fatigue_night_sweats: 'red_flag.night_sweats',

  breath_severity: 'severity.breath',
  breath_when: 'nature.breathlessness',
  breath_sudden: 'red_flag.sudden_breathlessness',
  breath_blue: 'red_flag.cyanosis',
  breath_conditions: 'history.asthma',
  breath_cough: 'symptom.cough',

  rash_blanching: 'red_flag.non_blanching_rash',
  rash_spread: 'nature.rash_spread',
  // Shares a topic with the adaptive anaphylaxis screen: facial swelling on a
  // rash is the same finding, and asking about it twice is how a severe reaction
  // gets talked past.
  rash_face_swelling: 'red_flag.severe_allergic_reaction',
  rash_location: 'nature.rash_location',
  rash_new_product: 'context.new_exposure',

  urinary_symptom: 'nature.urinary',
  urinary_history: 'history.urinary',
  // Shares a topic with the adaptive pregnancy question, so pregnancy is
  // established once per session rather than once per symptom set.
  urinary_pregnant: 'context.pregnancy',

  joint_location: 'nature.joint_location',
  joint_swelling: 'nature.joint_swelling',
  joint_conditions: 'history.joint_conditions',
};

// ── Derivation ────────────────────────────────────────────────────────────────

/** Facets that mean the same thing whichever symptom they are asked about. */
const SHARED_FACETS = new Set(['duration', 'severity', 'trajectory']);

/** `<set>` prefix to `<subject>`, for keys shaped like `<set>_<facet>`. */
function subjectFor(key: string): { set: string; facet: string } | null {
  // Longest prefix first, so `sore_throat_duration` splits at `sore_throat` and
  // not at `sore`. Cheap because the set list is short and fixed.
  let best: { set: string; facet: string } | null = null;
  for (const setId of Object.keys(SET_SUBJECT)) {
    if (!key.startsWith(`${setId}_`)) continue;
    const facet = key.slice(setId.length + 1);
    if (!best || setId.length > best.set.length) best = { set: setId, facet };
  }
  return best;
}

/**
 * The topic for a question nobody named explicitly.
 *
 * Fails loudly in spirit rather than silently: an unrecognised key gets its own
 * topic, which means it is never deduplicated against anything. That is the right
 * failure. A wrongly-shared topic could hide a question; an unshared one at worst
 * asks something twice, and the reviewer sees it as an unmapped key.
 */
function deriveTopic(key: string, symptomSet: string | null): Topic {
  if (symptomSet === null) return `screening.core_${key}`;
  const subject = SET_SUBJECT[symptomSet] ?? symptomSet;

  if (key === symptomSet || key.startsWith(`${symptomSet}_`)) {
    const facet = key.slice(symptomSet.length + 1);
    if (SHARED_FACETS.has(facet)) return `${facet}.${subject}`;
    return `screening.${subject}.${facet || 'general'}`;
  }

  // A shared prefix that is not the set's own id, e.g. `vomit_abdo_pain` inside
  // the vomiting set. The second half is still a real facet, so keep it.
  const split = subjectFor(key);
  if (split) {
    if (SHARED_FACETS.has(split.facet)) return `${split.facet}.${SET_SUBJECT[split.set] ?? split.set}`;
    return `screening.${SET_SUBJECT[split.set] ?? split.set}.${split.facet}`;
  }

  return `screening.${subject}.${key}`;
}

/** Resolve a topic for a bank question, consulting the explicit tables first. */
export function topicFor(question: SymptomQuestion): Topic {
  const explicit =
    question.symptomSet === null || question.symptomSet === undefined
      ? CORE_TOPIC_BY_KEY[question.key] ?? SHARED_TOPIC_BY_KEY[question.key]
      : SET_TOPIC_BY_KEY[question.key];
  if (explicit) return explicit;
  return deriveTopic(question.key, question.symptomSet ?? null);
}

/** The alias topic a question key belongs to, if any. */
function aliasTopicFor(key: string): Topic | null {
  for (const [topic, keys] of Object.entries(YES_NO_ALIAS_GROUPS)) {
    if (keys.includes(key)) return topic;
  }
  return null;
}

// ── Guards carried over from the bank ─────────────────────────────────────────

/**
 * Translate the bank's `dependsOnKey` into a graph guard.
 *
 * A plain `answered` test is not enough, because the parent may have been
 * answered through a *different* set. `fever_max_temp` depends on the fever
 * question, but on a cough-with-fever presentation the cough set's `cough_fever`
 * is what got answered — so the guard accepts either.
 */
function guardFor(question: SymptomQuestion): Condition | undefined {
  const dep = question.dependsOnKey;
  const values = question.dependsOnValues ?? [];
  if (!dep || values.length === 0) return undefined;

  const direct = answered(dep, ...values);
  const alias = aliasTopicFor(dep);
  return alias ? any(direct, reported(alias)) : direct;
}

/** The bank's `skipIfKey`, which means "an answer made this pointless". */
function forbidFor(question: SymptomQuestion): Condition | undefined {
  const dep = question.skipIfKey;
  const values = question.skipIfValues ?? [];
  if (!dep || values.length === 0) return undefined;

  const direct = answered(dep, ...values);
  const alias = aliasTopicFor(dep);
  return alias ? any(direct, reported(alias)) : direct;
}

// ── Utility ───────────────────────────────────────────────────────────────────

/**
 * Ordering weight among eligible questions.
 *
 * Three bands, and the gaps between them are wide on purpose. The top band is the
 * safety screen: if a session is ever cut short, the questions that disappear
 * must be the optional ones. The middle band is the timeline and severity, which
 * decide the advice. The bottom band is detail.
 */
const UTILITY_BAND = {
  screen: 900,
  timeline: 700,
  symptomCharacter: 500,
  history: 400,
  detail: 300,
} as const;

function utilityFor(question: SymptomQuestion, topic: Topic): number {
  const [facet] = topic.split('.');

  // `safetyCritical` is the authored intent, so it wins over the facet.
  if (question.safetyCritical) return UTILITY_BAND.screen;

  if (facet === 'duration' || facet === 'severity' || facet === 'trajectory') {
    return UTILITY_BAND.timeline;
  }
  if (facet === 'red_flag') return UTILITY_BAND.screen;
  if (facet === 'nature') return UTILITY_BAND.symptomCharacter;
  if (facet === 'history' || facet === 'context') return UTILITY_BAND.history;
  return UTILITY_BAND.detail;
}

function informsFor(question: SymptomQuestion, topic: Topic): DecisionUse[] {
  const [facet] = topic.split('.');
  const uses = new Set<DecisionUse>();

  if (question.safetyCritical || facet === 'red_flag') uses.add('triage');
  if (facet !== 'history') uses.add('assessment');
  // Severity and duration are what turn a symptom into advice, and what gate a
  // medicine category, so they feed the recommendation as well.
  if (facet === 'severity' || facet === 'duration' || facet === 'nature') uses.add('medication');

  return uses.size === 0 ? ['assessment'] : [...uses];
}

// ── Node construction ─────────────────────────────────────────────────────────

/**
 * The question key a node's guard is a follow-up to, if any.
 *
 * Used to exempt a follow-up from the lexical duplicate check against its own
 * parent. A node gated on "was the cough productive?" is meant to sound like the
 * question that opened the branch, so similarity there is the design working, not
 * a repetition.
 */
export function parentKeyOf(node: QuestionNode): string | undefined {
  const requires = node.requires;
  if (!requires) return undefined;

  const candidates: Condition[] = [];
  const walk = (condition: Condition): void => {
    switch (condition.on) {
      case 'answer':
      case 'answerOtherThan':
      case 'answered':
      case 'unanswered':
        candidates.push(condition);
        return;
      case 'all':
      case 'any':
        for (const inner of condition.of) walk(inner);
        return;
      case 'not':
        walk(condition.of);
        return;
      default:
        // `known`, `reported`, `age`, `sex`, `flag` and the derived predicates are
        // not about a specific question, so they cannot make this a follow-up.
    }
  };
  walk(requires);

  // Only a single gate makes it a follow-up. Two gates means the node is reachable
  // from more than one route, so it is not the child of either.
  const keys = [...new Set(candidates.map((condition) => ('key' in condition ? condition.key : '')))];
  return keys.length === 1 && keys[0] ? keys[0] : undefined;
}

function toNode(question: SymptomQuestion, origin: QuestionNode['origin']): QuestionNode {
  const topic = topicFor(question);
  const fromBank = guardFor(question);
  const fromTable =
    origin === 'core_bank' ? CORE_GUARD_BY_KEY[question.key] : undefined;

  // Both guards apply. The bank's own `dependsOnKey` and the table guard are
  // independent reasons to ask, and a question needs neither reason to be dropped
  // by the other.
  const requires =
    fromBank && fromTable ? all(fromBank, fromTable) : (fromBank ?? fromTable);

  return {
    question,
    key: question.key,
    topic,
    requires,
    forbids: forbidFor(question),
    informs: informsFor(question, topic),
    utility: utilityFor(question, topic),
    origin,
    symptomSet: question.symptomSet ?? null,
  };
}

/**
 * Every node in the graph, built once.
 *
 * The reviewed bank comes first so that in a tie the older, clinically reviewed
 * question wins over an authored adaptive one. The adaptive nodes then only take
 * precedence where they are the only route to the fact at all.
 */
export function buildGraph(): QuestionNode[] {
  const nodes: QuestionNode[] = [
    ...CORE_QUESTIONS.map((question) => toNode(question, 'core_bank')),
    ...SHARED_QUESTIONS.map((question) => toNode(question, 'symptom_set')),
    ...SYMPTOM_SETS.flatMap((set) =>
      set.questions.map((question) => toNode({ ...question, symptomSet: set.id }, 'symptom_set')),
    ),
  ];

  const seen = new Set<string>();
  for (const node of nodes) {
    if (seen.has(node.key)) {
      throw new Error(`Duplicate question key in graph: ${node.key}`);
    }
    seen.add(node.key);
  }

  return [...nodes, ...ADAPTIVE_NODES];
}

export const GRAPH: readonly QuestionNode[] = buildGraph();

export const NODE_BY_KEY: ReadonlyMap<string, QuestionNode> = new Map(
  GRAPH.map((node) => [node.key, node]),
);

export function nodeByKey(key: string): QuestionNode | undefined {
  return NODE_BY_KEY.get(key);
}

/**
 * The nodes a session may draw on.
 *
 * Core intake is always in scope — it is the screen every session needs. A
 * symptom-set's questions are in scope only when that set is active, which is what
 * keeps a cough session from asking about urinary symptoms. The shared block is
 * the fallback for when no set matched, so a session still asks about severity,
 * trajectory and medication rather than going straight to the summary.
 */
export function activeNodes(profile: PatientProfile): QuestionNode[] {
  const sets = new Set(profile.symptomSets);
  const hasSet = sets.size > 0;

  return GRAPH.filter((node) => {
    if (node.origin === 'core_bank') return true;
    if (node.origin === 'adaptive') return true;
    if (node.symptomSet && sets.has(node.symptomSet)) return true;
    // The shared block is only a fallback. Alongside an active set it would be a
    // second route to severity and trajectory, which is exactly the repeat the
    // engine exists to prevent.
    return !hasSet && node.symptomSet === null && node.key.startsWith('shared_');
  });
}