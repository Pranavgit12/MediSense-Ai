/**
 * Adaptive questions: the ones the fixed bank did not have.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CLINICAL REVIEW REQUIRED
 * Authored content. Conservative by construction, but unsigned. See
 * `REVIEW_STATUS` in `types.ts`.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Everything here exists because a fixed bank cannot express it:
 *
 *   * a question only one answer makes relevant (a dry cough needs a throat
 *     question; a productive one needs a colour question);
 *   * a question the spec's decision tree requires but the bank had no node for
 *     (fever duration branches, and the medicine branch after "did it help");
 *   * red flags the screen was missing outright (severe allergic reaction,
 *     dehydration, rapidly worsening pain).
 *
 * The questions are ordinary `SymptomQuestion`s, so they render, validate and
 * persist through exactly the same path as everything in the reviewed bank. The
 * graph behaviour lives in `nodes.ts`.
 */
import type { Condition, DecisionUse, QuestionNode, Topic } from './types';
import type { SymptomQuestion } from '../../types/medical';
import {
  all,
  answered,
  any,
  atLeastSeverity,
  hasFlag,
  known,
  lastingAtLeast,
  noAnswer,
  reported,
  withSymptom,
  worsening,
} from './conditions';

/**
 * Topics the catalogue and the reviewed bank use.
 *
 * Kept here rather than inlined so a node's topic is greppable in one place, and
 * so `context.*` topics stay consistent across nodes that fill the same facet.
 */
const TOPIC = {
  feverAccompanying: 'pattern.fever_accompanying' as Topic,
  coughMucus: 'nature.cough_mucus' as Topic,
  coughThroat: 'nature.cough_throat' as Topic,
  coughNight: 'pattern.cough_night' as Topic,
  cold: 'nature.cold' as Topic,
  coldWithFever: 'context.cold_with_fever' as Topic,
  soughtAdvice: 'context.sought_advice' as Topic,
  medicationNow: 'context.medication_now' as Topic,
  medicationDetail: 'context.medication_detail' as Topic,
  medicationName: 'context.medication_name' as Topic,
  medicationCurrentDetail: 'context.medication_current_detail' as Topic,
  medicationEffect: 'context.medication_effect' as Topic,
  medicationReaction: 'context.medication_reaction' as Topic,
  allergies: 'context.allergies' as Topic,
  allergyDetail: 'context.allergy_detail' as Topic,
  pregnancy: 'context.pregnancy' as Topic,
  severeAllergicReaction: 'red_flag.severe_allergic_reaction' as Topic,
  nonBlanchingRash: 'red_flag.non_blanching_rash' as Topic,
  dehydration: 'red_flag.dehydration' as Topic,
  rapidWorseningPain: 'red_flag.rapid_worsening_pain' as Topic,
  alteredSensorium: 'red_flag.altered_sensorium' as Topic,
  feverPresent: 'red_flag.fever_present' as Topic,
  infantFever: 'red_flag.infant_fever' as Topic,
};

/** Author a question in the terse form a reviewer can scan. */
function q(spec: {
  key: string;
  topic: Topic;
  prompt: string;
  helpText?: string | null;
  kind: SymptomQuestion['kind'];
  options?: { value: string; label: string; followUpPrompt?: string | null }[];
  min?: number | null;
  max?: number | null;
  unit?: string | null;
  safetyCritical?: boolean;
  targetSymptoms?: string[];
  requires?: Condition;
  forbids?: Condition;
  informs?: DecisionUse[];
  alsoCovers?: Topic[];
  utility: number;
  reviewerNote?: string;
}): QuestionNode {
  const question: SymptomQuestion = {
    id: `adaptive_${spec.key}`,
    key: spec.key,
    prompt: spec.prompt,
    helpText: spec.helpText ?? null,
    kind: spec.kind,
    options: spec.options ?? [],
    dependsOnKey: null,
    dependsOnValues: [],
    skipIfKey: null,
    skipIfValues: [],
    priority: 0,
    targetSymptoms: spec.targetSymptoms ?? [],
    safetyCritical: spec.safetyCritical ?? false,
    min: spec.min ?? null,
    max: spec.max ?? null,
    unit: spec.unit ?? null,
    reviewerNote: spec.reviewerNote ?? null,
    version: '1.0.0',
    symptomSet: null,
  };

  return {
    question,
    key: spec.key,
    topic: spec.topic,
    requires: spec.requires,
    forbids: spec.forbids,
    informs: spec.informs ?? ['assessment'],
    utility: spec.utility,
    origin: 'adaptive',
    alsoCovers: spec.alsoCovers,
  };
}

const YES_NO = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Fever: the spec's worked decision tree
//
//   fever → how long?
//     1-3 days  → do you also have chills, body aches or headache?
//     >7 days   → have you consulted a doctor or taken any medication?
//       yes     → what did you take, and did it improve the symptoms?
//
// The 4-7 day band sits with the short-duration branch: the accompanying-symptom
// question is what distinguishes a self-limiting viral fever from one that needs
// looking at, and it is the question that changes the advice. The consult
// question is reserved for beyond a week, where the concern is a fever that has
// not settled rather than what is going on alongside it.
// ─────────────────────────────────────────────────────────────────────────────

export const FEVER_ACCOMPANYING = q({
  key: 'fever_accompanying',
  topic: TOPIC.feverAccompanying,
  prompt: 'Do you also have any of these alongside the fever?',
  helpText: 'Choose as many as apply. This is what usually tells a clinician whether this looks like a straightforward viral illness.',
  kind: 'multi_choice',
  options: [
    { value: 'chills', label: 'Chills or shivering' },
    { value: 'body_aches', label: 'Body aches or muscle pain' },
    { value: 'headache', label: 'Headache' },
    { value: 'sore_throat', label: 'Sore throat' },
    { value: 'none', label: 'None of these' },
  ],
  requires: answered('fever_duration', 'lt_1d', 'd1_3', 'd4_7'),
  informs: ['assessment', 'medication'],
  utility: 430,
  targetSymptoms: ['high_fever'],
  reviewerNote:
    'Chills, aches and headache together with a short fever are the classic self-limiting viral pattern, which is what separates a watchful-wait answer from a same-day one.',
});

export const FEVER_CONSULTED = q({
  key: 'fever_consulted',
  topic: TOPIC.soughtAdvice,
  prompt: 'Have you seen a doctor about this fever, or taken any medicine for it?',
  helpText: 'A fever that has lasted more than a week should have been looked at. If not, that is useful to know.',
  kind: 'boolean',
  options: YES_NO,
  requires: answered('fever_duration', 'd1_3w', 'gt_3w'),
  informs: ['triage', 'assessment', 'medication'],
  utility: 430,
  targetSymptoms: ['high_fever'],
  reviewerNote:
    'Beyond a week without review is itself a finding. It changes both the advice and the medicine answer, so it is asked before the medicine detail rather than after.',
});

export const FEVER_MEDICATION_NAME = q({
  key: 'fever_medication_name',
  topic: TOPIC.medicationName,
  prompt: 'What medicine did you take for it, and at what dose?',
  helpText: 'The name on the packet is ideal. If you are not sure, describe what it was for. Write "nothing" if you took nothing.',
  kind: 'text',
  requires: answered('fever_consulted', 'yes'),
  informs: ['assessment', 'medication'],
  utility: 420,
  reviewerNote:
    'Paired deliberately with the effect question rather than merged into one: the form renders a single control per question, and a name and an effect are two different kinds of answer. Ask them separately and both are answerable on a phone.',
});

export const FEVER_MEDICATION_EFFECT = q({
  key: 'fever_medication_effect',
  topic: TOPIC.medicationEffect,
  prompt: 'Did it improve the fever or make you feel better at all?',
  helpText: null,
  kind: 'single_choice',
  options: [
    { value: 'improved', label: 'Yes, it helped' },
    { value: 'no_change', label: 'No difference' },
    { value: 'worse', label: 'It made me feel worse' },
    { value: 'stopped_early', label: 'I stopped it early' },
    { value: 'unsure', label: 'Not sure' },
  ],
  requires: answered('fever_consulted', 'yes'),
  informs: ['triage', 'assessment', 'medication'],
  utility: 418,
  reviewerNote:
    'A medicine that was taken and did nothing is a different clinical situation from one never tried, and from one that caused problems. Never suggesting a second medicine on top of an unhelpful first is why this is asked.',
});

// ─────────────────────────────────────────────────────────────────────────────
// Cough: character first, then the branch that character opens
//
// The spec is explicit that "I have a cough" must not be answered with "do you
// have a cough?", and that the next question should be dry versus productive.
// Character is therefore asked before duration, which inverts the reviewed
// bank's priority order — deliberately, and only for this question.
// ─────────────────────────────────────────────────────────────────────────────

export const COUGH_MUCUS_COLOUR = q({
  key: 'cough_mucus_colour',
  topic: TOPIC.coughMucus,
  prompt: 'What colour is the mucus you are bringing up?',
  helpText: null,
  kind: 'single_choice',
  options: [
    { value: 'clear', label: 'Clear or white' },
    { value: 'coloured', label: 'Yellow or green' },
    { value: 'brown', label: 'Brown' },
    { value: 'blood_streaked', label: 'There is blood in it' },
    { value: 'none', label: 'I am not bringing anything up' },
  ],
  requires: answered('cough_type', 'mucus', 'blood_streaked'),
  informs: ['assessment', 'medication'],
  utility: 424,
  targetSymptoms: ['cough'],
  reviewerNote:
    'Colour is the single most useful thing a person can report about sputum. Note that "no blood" is an explicit option here rather than relying on the separate blood question, because on a phone screen the more prominent option is the one that gets read.',
});

export const COUGH_THROAT_IRRITATION = q({
  key: 'cough_throat_irritation',
  topic: TOPIC.coughThroat,
  prompt: 'Does your throat feel scratchy, irritated or tickly?',
  helpText: null,
  kind: 'boolean',
  options: YES_NO,
  requires: answered('cough_type', 'dry'),
  informs: ['assessment', 'medication'],
  utility: 424,
  targetSymptoms: ['cough'],
  reviewerNote:
    'A dry cough with throat irritation points at post-nasal drip or upper-airway irritation, which is a different and usually self-limiting picture from a dry cough with no throat symptoms at all.',
});

export const COUGH_NIGHT_ONLY = q({
  key: 'cough_night_only',
  topic: TOPIC.coughNight,
  prompt: 'Is the cough mainly worse at night, or when you lie down?',
  helpText: null,
  kind: 'boolean',
  options: YES_NO,
  requires: answered('cough_type', 'dry'),
  informs: ['assessment'],
  utility: 415,
  targetSymptoms: ['cough'],
  reviewerNote: 'Night predominance is one of the findings that separates a reflux-related or post-nasal cough from other causes.',
});

// ─────────────────────────────────────────────────────────────────────────────
// Cold / upper respiratory
//
// The catalogue has no "cold" symptom set, but a blocked or runny nose is one of
// the most common presenting complaints and the reviewed bank has no question
// for it at all. This is the smallest useful set for it.
// ─────────────────────────────────────────────────────────────────────────────

export const COLD_FEATURES = q({
  key: 'cold_features',
  topic: TOPIC.cold,
  prompt: 'Do you have any of these with it?',
  helpText: 'Choose as many as apply.',
  kind: 'multi_choice',
  options: [
    { value: 'runny_nose', label: 'Runny or blocked nose' },
    { value: 'sneezing', label: 'Sneezing' },
    { value: 'sore_throat', label: 'Sore throat' },
    { value: 'mild_body_ache', label: 'Mild body ache' },
    { value: 'none', label: 'None of these' },
  ],
  // The catalogue has no "cold" symptom, so this branch is opened by the upper
  // respiratory keys instead. Each is a thing the patient can see for themselves,
  // which is why asking what else comes with it is worth a question.
  requires: any(
    withSymptom('runny_nose', 'congestion', 'continuous_sneezing'),
    withSymptom('throat_irritation', 'sinus_pressure', 'patches_in_throat'),
    withSymptom('sore_throat', 'malaise'),
  ),
  informs: ['assessment', 'medication'],
  utility: 330,
});

export const COLD_FEVER = q({
  key: 'cold_fever',
  topic: TOPIC.coldWithFever,
  prompt: 'Do you have a temperature with it?',
  helpText: null,
  kind: 'boolean',
  options: YES_NO,
  // Gated on the cold being established, not on a particular feature answer.
  // `cold_features` is multi-choice (`runny_nose|sneezing|sore_throat|
  // mild_body_ache|none`), so gating on `answered(..., 'yes')` could never be
  // true — the branch was unreachable. `known(TOPIC.cold)` is what was meant.
  requires: known(TOPIC.cold),
  informs: ['triage', 'assessment', 'medication'],
  utility: 428,
  reviewerNote:
    'A temperature alongside cold symptoms is what moves this from "a cold" to "a chest infection", so it is asked as soon as the cold features are established rather than at the end.',
});

// ─────────────────────────────────────────────────────────────────────────────
// Missing red-flag screens
//
// Each of these is a warning sign the spec lists and the existing screen did not
// cover. They carry high utility so a truncated session drops optional questions
// before these.
// ─────────────────────────────────────────────────────────────────────────────

export const SEVERE_ALLERGIC_REACTION = q({
  key: 'severe_allergic_reaction',
  topic: TOPIC.severeAllergicReaction,
  prompt: 'Have you had a severe allergic reaction — swelling of the lips, tongue or face, a tight throat, or trouble breathing after an exposure?',
  helpText: 'This includes after a food, a medicine, a sting or a new product.',
  kind: 'boolean',
  options: [
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' },
    { value: 'unsure', label: 'Not sure' },
  ],
  safetyCritical: true,
  // Scoped rather than universal. Anaphylaxis is the one finding where the useful
  // window is minutes, but asking every consultant about it every time is the
  // behaviour this engine exists to remove. It is asked when something in the
  // presentation could plausibly be an allergic reaction — an itchy or blotchy
  // rash, throat or eye irritation, a new exposure, or a rash with a fever — and
  // on its face-swelling path, which shares this topic.
  requires: any(
    withSymptom(
      'skin_rash', 'itching', 'nodal_skin_eruptions', 'throat_irritation',
      'patches_in_throat', 'redness_of_eyes', 'continuous_sneezing',
      'watering_from_eyes', 'swollen_lips_or_face',
    ),
    { on: 'symptom', key: 'skin_rash' },
    reported(TOPIC.nonBlanchingRash),
    known('context.new_exposure'),
  ),
  informs: ['triage', 'assessment'],
  utility: 905,
  reviewerNote:
    'Anaphylaxis is the one red flag where the useful window is minutes, so this carries a higher utility than any other question and stands down only when nothing in the presentation points at an allergy. Any answer other than a clear no is treated as a positive by the rule, because a person mid-reaction may not describe it accurately.',
});

export const DEHYDRATION_SIGNS = q({
  key: 'dehydration_signs',
  topic: TOPIC.dehydration,
  prompt: 'Are you able to keep fluids down, and are you passing urine normally?',
  helpText: 'Choose the closest answer.',
  kind: 'single_choice',
  options: [
    { value: 'fine', label: 'Yes, keeping fluids down and passing urine normally' },
    { value: 'reduced_urine', label: 'Keeping fluids down but passing much less urine' },
    { value: 'cannot_keep_down', label: 'Cannot keep fluids down' },
    { value: 'not_passing', label: 'Not passing urine at all' },
  ],
  safetyCritical: true,
  // Only worth asking where fluids or fluid loss are in play, or where the
  // thresholds are tighter: young babies, older and frail adults, or anyone
  // running a fever who may not be drinking.
  requires: any(
    withSymptom('vomiting', 'diarrhoea', 'nausea', 'dehydration', 'sunken_eyes'),
    { on: 'symptom', key: 'diarrhoea' },
    { on: 'symptom', key: 'vomiting' },
    hasFlag('infant', 'child', 'older_adult', 'fraile_older_adult'),
    reported(TOPIC.dehydration),
  ),
  informs: ['triage', 'assessment'],
  utility: 895,
  reviewerNote:
    'Asked as a single four-way question rather than two yes/no screens because "can you keep fluids down" and "are you passing urine" are one clinical finding, and splitting them invites a half-answer that reads as reassurance.',
});

export const RAPID_WORSENING_PAIN = q({
  key: 'rapid_worsening_pain',
  topic: TOPIC.rapidWorseningPain,
  prompt: 'Is the pain becoming severe, or getting worse quickly?',
  helpText: 'Rapidly worsening pain is treated differently from pain that has been steady, even at the same number on the scale.',
  kind: 'boolean',
  options: YES_NO,
  safetyCritical: true,
  // Only worth asking when there is something to escalate: a high rating, or an
  // established worsening trajectory. Asking everyone would be noise.
  requires: any(atLeastSeverity(8), worsening()),
  forbids: known('red_flag.chest_pain'),
  informs: ['triage', 'assessment'],
  utility: 880,
  reviewerNote:
    'Chest pain has its own dedicated screen with its own escalation, so this question stands down once that has been covered rather than duplicating it.',
});

// ─────────────────────────────────────────────────────────────────────────────
// Context: medicines and allergies
//
// The spec requires both to feed the recommendation, and the reviewed bank only
// asked about regular medication. Allergies were not collected at all, which
// made it impossible to gate a suggestion on them.
// ─────────────────────────────────────────────────────────────────────────────

export const KNOWN_ALLERGIES = q({
  key: 'known_allergies',
  topic: TOPIC.allergies,
  prompt: 'Do you have any known allergy to a medicine or food?',
  helpText: null,
  kind: 'boolean',
  options: YES_NO,
  informs: ['medication'],
  utility: 260,
  reviewerNote: 'Cannot gate a medicine suggestion without this, so it is asked before any suggestion is made.',
});

export const ALLERGY_LIST = q({
  key: 'allergy_list',
  topic: TOPIC.allergyDetail,
  prompt: 'Which allergies do you have?',
  helpText: 'Names if you know them. Write "none" if you are not aware of any.',
  kind: 'text',
  requires: answered('known_allergies', 'yes'),
  informs: ['medication'],
  utility: 255,
});

export const MEDICATION_TAKEN_NOW = q({
  key: 'medication_taken_now',
  topic: TOPIC.medicationNow,
  prompt: 'Have you taken anything for this in the last day or two?',
  helpText: 'Including anything from a pharmacy, a chemist, or someone else.',
  kind: 'boolean',
  options: YES_NO,
  // Worth asking once the complaint has had time to prompt self-treatment, or
  // once it is bad enough that someone would have tried something.
  requires: any(
    lastingAtLeast(3),
    atLeastSeverity(5),
    worsening(),
    answered('fever_duration', 'd1_3w', 'gt_3w'),
  ),
  informs: ['assessment', 'medication'],
  utility: 340,
  reviewerNote:
    'Distinct from "are you on regular medication". A drug taken for this problem already changes what is safe to add, and it is a question the bank never asked.',
});

export const MEDICATION_TAKEN_NOW_DETAIL = q({
  key: 'medication_taken_now_detail',
  topic: TOPIC.medicationCurrentDetail,
  prompt: 'What have you taken, and did it help?',
  helpText: 'Name and dose if you have the packet. Write "nothing" if you took nothing.',
  kind: 'text',
  requires: answered('medication_taken_now', 'yes'),
  informs: ['assessment', 'medication'],
  utility: 338,
});

export const MEDICATION_TAKEN_NOW_WORSE = q({
  key: 'medication_taken_now_worse',
  topic: TOPIC.medicationReaction,
  prompt: 'Did any of it make you feel worse, or cause a new problem?',
  helpText: 'For example a rash, stomach upset, ringing in the ears, or feeling more drowsy.',
  kind: 'boolean',
  options: YES_NO,
  requires: answered('medication_taken_now', 'yes'),
  informs: ['triage', 'assessment', 'medication'],
  utility: 336,
  reviewerNote:
    'A new problem that started after taking something is a reaction until shown otherwise, and it changes the advice from "try this" to "stop and get checked".',
});

// ─────────────────────────────────────────────────────────────────────────────
// Age-specific screens
//
// Asked only where the answer genuinely changes the advice, never as a matter of
// course. An infant with a fever and an adult with a fever are not the same
// clinical conversation.
// ─────────────────────────────────────────────────────────────────────────────

export const INFANT_FEVER_CONCERN = q({
  key: 'infant_fever_concern',
  // Deliberately NOT the `red_flag.fever_present` topic. That topic is filled by
  // answering "do you have a fever", and this question does not answer it — it is
  // asked *because* a fever was already reported. Sharing the topic would mean the
  // reported fever suppressed the screen that depends on it.
  topic: TOPIC.infantFever,
  prompt: 'Is this a baby under three months old?',
  helpText: 'A fever in a very young baby is treated differently and needs same-day review.',
  kind: 'boolean',
  options: YES_NO,
  requires: all(hasFlag('infant'), reported(TOPIC.feverPresent)),
  informs: ['triage', 'assessment'],
  utility: 870,
  reviewerNote:
    'Age was taken at intake, so this is normally never asked. It exists as a fallback for the case where intake age was left blank or the questionnaire is run without it, where assuming an adult would be the unsafe default.',
});

export const ELDERLY_CONFUSION = q({
  key: 'elderly_confusion',
  topic: TOPIC.alteredSensorium,
  prompt: 'Have you or someone caring for you noticed any new confusion or drowsiness?',
  helpText: 'Sudden confusion in an older person is treated as an emergency, whatever else is going on.',
  kind: 'boolean',
  options: YES_NO,
  requires: all(hasFlag('older_adult'), withSymptom('fatigue', 'lethargy', 'malaise')),
  informs: ['triage', 'assessment'],
  utility: 875,
  reviewerNote: 'Delirium superimposed on a chest infection is a common and serious presentation in older adults, and it is frequently attributed to the underlying illness instead.',
});

export const PREGNANCY_STATUS = q({
  key: 'pregnancy_status',
  topic: TOPIC.pregnancy,
  prompt: 'Are you pregnant, or could you be?',
  helpText: 'This changes which medicines are safe, so it is asked directly rather than assumed either way.',
  kind: 'single_choice',
  options: [
    { value: 'yes', label: 'Yes, I am pregnant' },
    { value: 'no', label: 'No' },
    { value: 'maybe', label: 'I am not sure' },
    { value: 'not_applicable', label: 'Not applicable' },
  ],
  requires: all(hasFlag('pregnant_or_unknown'), noAnswer('pregnancy_status')),
  informs: ['medication'],
  utility: 200,
  reviewerNote:
    'Only asked where the patient is female and of an age where pregnancy is possible. An unanswered "not sure" is treated as a block on the categories that are unsafe in pregnancy, not as a clearance.',
});

/** Every adaptive node, in authoring order. */
export const ADAPTIVE_NODES: QuestionNode[] = [
  SEVERE_ALLERGIC_REACTION,
  DEHYDRATION_SIGNS,
  RAPID_WORSENING_PAIN,
  ELDERLY_CONFUSION,
  INFANT_FEVER_CONCERN,
  COUGH_MUCUS_COLOUR,
  COUGH_THROAT_IRRITATION,
  COLD_FEVER,
  FEVER_ACCOMPANYING,
  FEVER_CONSULTED,
  FEVER_MEDICATION_NAME,
  FEVER_MEDICATION_EFFECT,
  COLD_FEATURES,
  COUGH_NIGHT_ONLY,
  MEDICATION_TAKEN_NOW,
  MEDICATION_TAKEN_NOW_DETAIL,
  MEDICATION_TAKEN_NOW_WORSE,
  KNOWN_ALLERGIES,
  ALLERGY_LIST,
  PREGNANCY_STATUS,
];

export const ADAPTIVE_NODE_BY_KEY: ReadonlyMap<string, QuestionNode> = new Map(
  ADAPTIVE_NODES.map((node) => [node.key, node]),
);
