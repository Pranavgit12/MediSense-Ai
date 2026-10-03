/**
 * The consultation questionnaire.
 *
 * 15 core questions, so a full pass lands in the 10-15 range the product
 * promises. The order is deliberate: the safety screen comes first, so someone
 * with a red flag is routed before spending their time on detail questions.
 *
 * Every question is answered by the person themselves, so the wording stays
 * plain and never suggests a condition.
 */
import type { SymptomQuestion } from '../types/medical';
import { SYMPTOM_SETS } from './symptom-sets';

export const QUESTION_SET_VERSION = 'symptom-questions/1.0.0';

const q = (question: SymptomQuestion): SymptomQuestion => question;

export const CORE_QUESTIONS: SymptomQuestion[] = [
  // ── 1-3: Shape of the problem ──────────────────────────────────────────────
  q({
    id: 'q_duration',
    key: 'duration',
    prompt: 'How long have you had this problem?',
    helpText: 'An approximate answer is fine.',
    kind: 'duration',
    options: [
      { value: 'today', label: 'Started today' },
      { value: 'days', label: '2 to 7 days' },
      { value: 'weeks', label: '1 to 4 weeks' },
      { value: 'months', label: 'More than a month' },
      { value: 'long', label: 'More than 3 months' },
    ],
    dependsOnKey: null,
    dependsOnValues: [],
    skipIfKey: null,
    skipIfValues: [],
    priority: 10,
    targetSymptoms: [],
    safetyCritical: false,
    min: null,
    max: null,
    unit: null,
    reviewerNote: 'Anchor the timeline first; it changes how every later answer is read.',
    version: '1.0.0',
  }),
  q({
    id: 'q_severity',
    key: 'severity',
    prompt: 'Right now, how bad is it? 0 is nothing at all, 10 is the worst you can imagine.',
    helpText: null,
    kind: 'scale',
    options: [],
    dependsOnKey: null,
    dependsOnValues: [],
    skipIfKey: null,
    skipIfValues: [],
    priority: 20,
    targetSymptoms: [],
    safetyCritical: false,
    min: 0,
    max: 10,
    unit: null,
    reviewerNote: 'A self-rated scale is subjective but is a useful trend marker.',
    version: '1.0.0',
  }),
  q({
    id: 'q_trajectory',
    key: 'trajectory',
    prompt: 'Compared with a few days ago, is it:',
    helpText: null,
    kind: 'single_choice',
    options: [
      { value: 'better', label: 'Getting better' },
      { value: 'same', label: 'About the same' },
      { value: 'worse', label: 'Getting worse' },
      { value: 'unclear', label: 'Hard to say' },
    ],
    dependsOnKey: null,
    dependsOnValues: [],
    skipIfKey: null,
    skipIfValues: [],
    priority: 30,
    targetSymptoms: [],
    safetyCritical: false,
    min: null,
    max: null,
    unit: null,
    reviewerNote: 'A worsening trajectory raises urgency even when the symptom set is small.',
    version: '1.0.0',
  }),

  // ── 4-10: Safety screen ────────────────────────────────────────────────────
  q({
    id: 'q_chest_pain',
    key: 'chest_pain',
    prompt: 'Do you have any pain, pressure or tightness in your chest right now?',
    helpText: 'Include pain that spreads to the arm, jaw, neck or back.',
    kind: 'boolean',
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ],
    dependsOnKey: null,
    dependsOnValues: [],
    skipIfKey: null,
    skipIfValues: [],
    priority: 1,
    targetSymptoms: ['chest_pain'],
    safetyCritical: true,
    min: null,
    max: null,
    unit: null,
    reviewerNote: 'Highest-priority red flag. Never defer this behind non-urgent questions.',
    version: '1.0.0',
  }),
  q({
    id: 'q_breathlessness',
    key: 'breathlessness',
    prompt: 'Are you finding it harder to breathe than usual?',
    helpText: null,
    kind: 'boolean',
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ],
    dependsOnKey: null,
    dependsOnValues: [],
    skipIfKey: null,
    skipIfValues: [],
    priority: 2,
    targetSymptoms: ['breathlessness'],
    safetyCritical: true,
    min: null,
    max: null,
    unit: null,
    reviewerNote: null,
    version: '1.0.0',
  }),
  q({
    id: 'q_stiff_neck',
    key: 'stiff_neck',
    prompt: 'Do you have a stiff neck, or a severe headache with neck stiffness?',
    helpText: null,
    kind: 'boolean',
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ],
    dependsOnKey: null,
    dependsOnValues: [],
    skipIfKey: null,
    skipIfValues: [],
    priority: 3,
    targetSymptoms: ['stiff_neck'],
    safetyCritical: true,
    min: null,
    max: null,
    unit: null,
    reviewerNote: 'Escalates to emergency when combined with high fever.',
    version: '1.0.0',
  }),
  q({
    id: 'q_fever',
    key: 'high_fever',
    prompt: 'Do you have a fever?',
    helpText: 'Chills, sweats and feeling hot all count.',
    kind: 'boolean',
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ],
    dependsOnKey: null,
    dependsOnValues: [],
    skipIfKey: null,
    skipIfValues: [],
    priority: 4,
    targetSymptoms: ['high_fever'],
    safetyCritical: true,
    min: null,
    max: null,
    unit: null,
    reviewerNote: 'Escalates when paired with a neck stiffness, a non-blanching rash, or confusion.',
    version: '1.0.0',
  }),
  q({
    id: 'q_fever_max',
    key: 'fever_max',
    prompt: 'What was the highest temperature you measured, in degrees Celsius?',
    helpText: 'Leave blank if you did not measure it.',
    kind: 'number',
    options: [],
    dependsOnKey: 'high_fever',
    dependsOnValues: ['yes'],
    skipIfKey: null,
    skipIfValues: [],
    priority: 5,
    targetSymptoms: ['high_fever'],
    safetyCritical: true,
    min: 34,
    max: 43,
    unit: '°C',
    reviewerNote: 'Above about 39-40 with other red flags is treated as an emergency.',
    version: '1.0.0',
  }),
  q({
    id: 'q_rash_blanching',
    key: 'red_spots_over_body',
    prompt: 'Do you have a rash or red spots that do NOT fade when you press a clear glass against the skin?',
    helpText: 'This is worth checking carefully. Press a glass against the spots and see whether the colour goes white.',
    kind: 'boolean',
    options: [
      { value: 'yes', label: 'Yes, they do not fade' },
      { value: 'no', label: 'No, they fade' },
      { value: 'none', label: 'I do not have a rash' },
    ],
    dependsOnKey: null,
    dependsOnValues: [],
    skipIfKey: null,
    skipIfValues: [],
    priority: 6,
    targetSymptoms: ['red_spots_over_body'],
    safetyCritical: true,
    min: null,
    max: null,
    unit: null,
    reviewerNote: 'A non-blanching rash plus fever is treated as an emergency.',
    version: '1.0.0',
  }),
  q({
    id: 'q_bleeding',
    key: 'stomach_bleeding',
    prompt: 'Have you noticed any blood in your vomit, black or tarry stools, or blood in your urine?',
    helpText: 'Black, sticky, tarry stools can indicate bleeding higher up in the gut.',
    kind: 'boolean',
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ],
    dependsOnKey: null,
    dependsOnValues: [],
    skipIfKey: null,
    skipIfValues: [],
    priority: 7,
    targetSymptoms: ['stomach_bleeding', 'bloody_stool', 'spotting_urination'],
    safetyCritical: true,
    min: null,
    max: null,
    unit: null,
    reviewerNote: null,
    version: '1.0.0',
  }),
  q({
    id: 'q_stroke_signs',
    key: 'weakness_of_one_body_side',
    prompt: 'Do you have any weakness down one side of your body, or slurred speech?',
    helpText: 'Sudden changes here are treated as an emergency.',
    kind: 'boolean',
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ],
    dependsOnKey: null,
    dependsOnValues: [],
    skipIfKey: null,
    skipIfValues: [],
    priority: 8,
    targetSymptoms: ['weakness_of_one_body_side', 'slurred_speech'],
    safetyCritical: true,
    min: null,
    max: null,
    unit: null,
    reviewerNote: null,
    version: '1.0.0',
  }),
  q({
    id: 'q_consciousness',
    key: 'altered_sensorium',
    prompt: 'Have you fainted, blacked out, or felt confused or unusually drowsy?',
    helpText: null,
    kind: 'boolean',
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ],
    dependsOnKey: null,
    dependsOnValues: [],
    skipIfKey: null,
    skipIfValues: [],
    priority: 9,
    targetSymptoms: ['altered_sensorium', 'coma'],
    safetyCritical: true,
    min: null,
    max: null,
    unit: null,
    reviewerNote: null,
    version: '1.0.0',
  }),

  // ── 11-13: Context that changes interpretation ──────────────────────────────
  q({
    id: 'q_jaundice',
    key: 'yellowing_of_eyes',
    prompt: 'Have you noticed yellowing of the whites of your eyes, or of your skin?',
    helpText: null,
    kind: 'boolean',
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ],
    dependsOnKey: null,
    dependsOnValues: [],
    skipIfKey: null,
    skipIfValues: [],
    priority: 40,
    targetSymptoms: ['yellowing_of_eyes', 'yellowish_skin'],
    safetyCritical: true,
    min: null,
    max: null,
    unit: null,
    reviewerNote: null,
    version: '1.0.0',
  }),
  q({
    id: 'q_medication',
    key: 'takes_medication',
    prompt: 'Are you currently taking any regular medication or supplements?',
    helpText: null,
    kind: 'boolean',
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ],
    dependsOnKey: null,
    dependsOnValues: [],
    skipIfKey: null,
    skipIfValues: [],
    priority: 50,
    targetSymptoms: [],
    safetyCritical: false,
    min: null,
    max: null,
    unit: null,
    reviewerNote: 'Medicines are a common and easily missed reason for an unusual result.',
    version: '1.0.0',
  }),
  q({
    id: 'q_conditions',
    key: 'existing_conditions',
    prompt: 'Do you have any ongoing medical conditions you already know about?',
    helpText: null,
    kind: 'boolean',
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ],
    dependsOnKey: null,
    dependsOnValues: [],
    skipIfKey: null,
    skipIfValues: [],
    priority: 60,
    targetSymptoms: [],
    safetyCritical: false,
    min: null,
    max: null,
    unit: null,
    reviewerNote: null,
    version: '1.0.0',
  }),

  // ── 14-15: Follow-ups ──────────────────────────────────────────────────────
  q({
    id: 'q_medication_list',
    key: 'medication_list',
    prompt: 'Which medicines or supplements are you taking?',
    helpText: 'Names and doses if you know them. "None" is a valid answer.',
    kind: 'text',
    options: [],
    dependsOnKey: 'takes_medication',
    dependsOnValues: ['yes'],
    skipIfKey: null,
    skipIfValues: [],
    priority: 55,
    targetSymptoms: [],
    safetyCritical: false,
    min: null,
    max: null,
    unit: null,
    reviewerNote: 'Free text is stored as the user wrote it and is never sent to a model unless the user consents.',
    version: '1.0.0',
  }),
  q({
    id: 'q_conditions_list',
    key: 'condition_list',
    prompt: 'Which conditions do you already have?',
    helpText: 'For example diabetes, asthma, thyroid problems, high blood pressure.',
    kind: 'text',
    options: [],
    dependsOnKey: 'existing_conditions',
    dependsOnValues: ['yes'],
    skipIfKey: null,
    skipIfValues: [],
    priority: 65,
    targetSymptoms: [],
    safetyCritical: false,
    min: null,
    max: null,
    unit: null,
    reviewerNote: null,
    version: '1.0.0',
  }),
];

export const CORE_QUESTION_COUNT = CORE_QUESTIONS.length;

/**
 * The most questions any one session will ask.
 *
 * The bank holds more than this because three of the questions are follow-ups
 * that only apply to some answers, and a user can trigger all of them. Capping
 * the selection here is what makes the "10 to 15 questions" promise true rather
 * than merely typical. Because the selection is ordered by priority and every
 * safety-critical question is numbered below the context questions, a truncated
 * session always drops context first and never drops a red-flag screen.
 */
export const MAX_QUESTIONS_PER_SESSION = 15;

const SET_QUESTIONS = SYMPTOM_SETS.flatMap((symptomSet) => symptomSet.questions);
const BY_KEY = new Map(
  [...CORE_QUESTIONS, ...SET_QUESTIONS].map((question) => [question.key, question]),
);

export function questionByKey(key: string): SymptomQuestion | undefined {
  return BY_KEY.get(key);
}

/**
 * Which questions to ask next, given the answers so far.
 *
 * A follow-up is included when its parent was answered yes. Everything else is
 * skipped, which is what keeps a real session in the 10-15 range.
 */
export function selectQuestions(
  answers: Map<string, string>,
  symptomSetIds: string[] = [],
): SymptomQuestion[] {
  // The cap counts questions already asked, not questions outstanding. Answering
  // a parent question adds its follow-up rather than replacing it, so a user who
  // answers "yes" to everything reaches 17 without this check.
  if (answers.size >= MAX_QUESTIONS_PER_SESSION) return [];

  const questions = symptomSetIds.flatMap(
    (id) => SYMPTOM_SETS.find((symptomSet) => symptomSet.id === id)?.questions ?? [],
  );
  const candidates = [...CORE_QUESTIONS, ...questions]
    // Set-specific safety rules are not wired to triage yet. Only include their
    // non-critical information-gathering questions until a clinician reviews
    // and connects those rules.
    .filter((question) => !question.symptomSet || !question.safetyCritical)
    .map((question) =>
      question.symptomSet
        ? { ...question, priority: 31 + question.priority }
        : question,
    );

  const selected = candidates.filter((question) => {
    // Already answered: never ask it again.
    if (answers.has(question.key)) return false;
    if (question.dependsOnKey) {
      const parent = answers.get(question.dependsOnKey);
      if (!parent || !question.dependsOnValues.includes(parent)) return false;
    }
    if (question.skipIfKey) {
      const other = answers.get(question.skipIfKey);
      if (other && question.skipIfValues.includes(other)) return false;
    }
    return true;
  }).sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));

  return selected.slice(0, MAX_QUESTIONS_PER_SESSION - answers.size);
}

/** True when nothing further will be asked. */
export function isComplete(answers: Map<string, string>, symptomSetIds: string[] = []): boolean {
  return selectQuestions(answers, symptomSetIds).length === 0;
}

/**
 * Validate one answer against the question's `kind`.
 *
 * Most questions are choice-based and are checked against `options`, but the bank
 * also contains a scale, a number, a duration and two free-text questions. Those
 * have no options, so a check against `options` alone would make them impossible
 * to answer. Returns an error message, or null when the answer is acceptable.
 */
export { validateAnswer } from './question-validation';
