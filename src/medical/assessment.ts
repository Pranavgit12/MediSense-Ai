/**
 * The doctor-style examination summary.
 *
 * This builds the structured, deterministic half of the answer. The language
 * model may rewrite it for readability; it is given this text and the user's own
 * answers, and is instructed to add nothing.
 *
 * Framing rule: everything is a *possibility a clinician would consider*, never
 * a conclusion, and never a diagnosis.
 */
import { questionByKey } from '../data/question-bank';
import type { SymptomCategory } from '../data/symptom-catalog';
import { ASKABLE_SYMPTOMS, SYMPTOM_BY_KEY, symptomLabel } from '../data/symptom-catalog';
import type {
  AnswerValue,
  SafetyNotice,
  StructuredSummary,
  SymptomAssessment,
  TriageResult,
} from '../types/medical';
import { TRIAGE_PLAIN_LANGUAGE, evaluateTriage } from './triage';

export const ASSESSMENT_VERSION = 'assessment/1.0.0';

export const DISCLAIMER =
  'This is not a diagnosis and it is not a substitute for a clinician. It is a summary of the answers you gave, prepared to help you describe your problem clearly and know what to ask for.';

/**
 * General, non-diagnostic framings per body system. These deliberately describe
 * *classes* of cause, never a named condition tied to the user.
 */
const CATEGORY_POSSIBILITIES: Record<SymptomCategory, string> = {
  general: 'general causes such as a viral illness, a change in sleep or stress, or a temporary effect of medication',
  skin: 'skin conditions such as irritation, a localised infection, an allergic reaction, or a reaction to a new product or medicine',
  gastrointestinal: 'digestive causes such as a stomach infection, food irritation, acid reflux, a change in diet, or a reaction to a medicine',
  respiratory: 'chest and breathing causes such as a viral chest infection, irritation of the airways, or a chest infection that needs treating',
  cardiovascular: 'circulatory causes that affect how the heart and blood vessels are coping, which is why these get checked promptly',
  neurological: 'neurological causes such as a viral illness affecting balance, poor sleep, low blood sugar, or a strain in the neck and shoulders',
  musculoskeletal: 'muscle and joint causes such as a strain from use, posture and load, arthritis, or an inflammatory condition',
  urinary: 'urinary causes such as a urine infection, dehydration, or kidney irritation',
  reproductive: 'causes related to hormonal or reproductive patterns',
  entomological: 'a reaction to an insect bite or sting, which can range from a local irritation to a larger allergic reaction',
  metabolic: 'causes connected to how the body handles energy and metabolism, including blood sugar, thyroid function, and hydration',
  psychological: 'causes connected to stress, anxiety, sleep, and mood, which commonly produce real physical symptoms',
  exposure: 'effects of an environmental or occupational exposure',
};

const CATEGORY_PLAIN: Record<SymptomCategory, string> = {
  general: 'general symptoms',
  skin: 'skin symptoms',
  gastrointestinal: 'digestive symptoms',
  respiratory: 'chest and breathing symptoms',
  cardiovascular: 'circulatory symptoms',
  neurological: 'head and nerve symptoms',
  musculoskeletal: 'muscle and joint symptoms',
  urinary: 'urinary symptoms',
  reproductive: 'reproductive symptoms',
  entomological: 'bite or sting symptoms',
  metabolic: 'metabolic symptoms',
  psychological: 'stress and mood symptoms',
  exposure: 'exposure-related symptoms',
};

export const CATEGORY_LABELS = CATEGORY_PLAIN;

/**
 * Find catalog symptoms mentioned in free text.
 *
 * Matches on the human label and a small set of everyday phrasings. It is a
 * convenience for pre-filling the questionnaire, never a clinical judgement: a
 * miss simply means the user is asked the question directly.
 */
/**
 * Symptom names to look for in free text.
 *
 * Negation matters here: "I do not have a headache" must not seed a headache into
 * the triage input, because that would escalate someone who explicitly said they
 * have none.
 */
const NEGATION_PATTERN =
  /\b(no|not|never|without|haven'?t|hasn'?t|hadn'?t|don'?t|doesn'?t|didn'?t|deny|denies|none|free\s+of|denial\s+of)\b/;

/** True when a negation word appears shortly before the match, with no comma between. */
function isNegated(text: string, matchIndex: number): boolean {
  const window = text.slice(Math.max(0, matchIndex - 40), matchIndex);
  // A clause boundary between the negation and the symptom means the negation
  // applies to something else, e.g. "no fever, but a bad headache".
  const afterBoundary = window.split(/[,;.]|\bbut\b|\bhowever\b/).pop() ?? '';
  return NEGATION_PATTERN.test(afterBoundary);
}

export function detectSymptomsFromText(text: string): string[] {
  const haystack = text.toLowerCase();
  const found: string[] = [];

  const consider = (needle: string, symptomKey: string) => {
    if (needle.length < 4) return;
    const index = haystack.indexOf(needle);
    if (index === -1) return;
    if (isNegated(haystack, index)) return;
    found.push(symptomKey);
  };

  for (const symptom of ASKABLE_SYMPTOMS) {
    const label = symptom.label.toLowerCase();
    if (haystack.includes(label)) {
      consider(label, symptom.key);
      continue;
    }
    // Strip the generic tail words so "skin rash" also matches "rash".
    consider(label.split(/\s+/).pop() ?? '', symptom.key);
  }
  return [...new Set(found)];
}

function groupByCategory(keys: string[]): Map<SymptomCategory, string[]> {
  const groups = new Map<SymptomCategory, string[]>();
  // Imported lazily to keep the module free of a circular import at load time.
  for (const key of keys) {
    const def = SYMPTOM_CATEGORY.get(key);
    if (!def) continue;
    const list = groups.get(def) ?? [];
    list.push(symptomLabel(key));
    groups.set(def, list);
  }
  return groups;
}

function symptomCategoryMap(): Map<string, SymptomCategory> {
  const m = new Map<string, SymptomCategory>();
  for (const s of ASKABLE_SYMPTOMS) m.set(s.key, s.category);
  return m;
}

const SYMPTOM_CATEGORY = symptomCategoryMap();

export interface AssessmentInput {
  complaint: string;
  /** Symptom keys answered yes. */
  present: string[];
  answers: AnswerValue[];
  triage?: TriageResult;
  ageYears?: number | null;
}

const RED_FLAG_SCREEN_PROMPTS: string[] = [
  'Sudden weakness down one side of the body, or slurred speech',
  'Crushing or spreading chest pain, or chest pain with breathlessness',
  'Severe breathlessness, or blue lips or fingertips',
  'A rash that does not fade when pressed with a glass, especially with fever',
  'A stiff neck together with a fever',
  'Vomiting blood, or black, tarry stools',
  'Fainting, confusion, or being hard to wake',
  'Yellowing of the eyes or skin',
];

export function buildAssessment(input: AssessmentInput): SymptomAssessment {
  const triage = input.triage ?? evaluateTriage({ present: input.present, ageYears: input.ageYears, completed: true });
  const groups = groupByCategory(input.present);
  const answers = new Map(input.answers.map((a) => [a.questionKey, a.value]));

  const timeline = String(answers.get('duration') ?? 'an unstated period');
  const severity = Number(answers.get('severity') ?? Number.NaN);
  const trajectory = String(answers.get('trajectory') ?? 'unclear');
  const takesMedication = answers.get('takes_medication') === 'yes';
  const hasConditions = answers.get('existing_conditions') === 'yes';

  const missingInformation: string[] = [];
  if (!input.present.length) missingInformation.push('You did not report any symptoms.');
  if (!input.complaint.trim()) missingInformation.push('You did not describe the problem in your own words.');
  if (Number.isNaN(severity)) missingInformation.push('You did not rate how severe it is.');
  if (!takesMedication) missingInformation.push('It is not known whether you take any medication.');
  if (!hasConditions) missingInformation.push('It is not known whether you have existing conditions.');

  // An emergency result suppresses the narrative rather than softening it.
  if (triage.emergency) {
    return {
      summary:
        'Based on what you described, this needs emergency assessment now. Please do not wait for an appointment, and do not rely on this summary in place of being seen.',
      possibleExplanations: [],
      why: 'Some of the symptoms you reported are warning signs that are always treated as emergencies, whatever the underlying cause turns out to be.',
      warningSigns: triage.notices.map((n) => n.body),
      whatToDoNext: [TRIAGE_PLAIN_LANGUAGE[triage.action]],
      questionsForDoctor: [],
      redFlagScreen: [],
      disclaimer: DISCLAIMER,
      sources: [],
      insufficientInformation: false,
      missingInformation,
      structured: buildStructuredSummary({
        complaint: input.complaint,
        present: input.present,
        answers: input.answers,
        triage,
      }),
    };
  }

  const parts: string[] = [];
  const reported = input.present.map(symptomLabel);
  parts.push(
    `You have described ${reported.length} symptom${reported.length === 1 ? '' : 's'}${reported.length ? ` (${listSentence(reported.map((label) => label.toLowerCase()))})` : ''} lasting ${timeline}`,
  );
  if (!Number.isNaN(severity)) {
    parts.push(`you rated it ${severity} out of 10 right now, and it is ${trajectory === 'same' ? 'about the same' : trajectory}`);
  }
  if (groups.size) {
    const systems = [...groups.keys()].map((c) => CATEGORY_PLAIN[c]);
    parts.push(`and they fall mainly in ${listSentence(systems)}`);
  }
  const summary = `${parts.join(', ')}.`;

  const possibleExplanations: string[] = [];
  for (const [category, labels] of groups) {
    possibleExplanations.push(
      `For your ${CATEGORY_PLAIN[category]} (${listSentence(labels.map((l) => l.toLowerCase()))}), a clinician would usually consider ${CATEGORY_POSSIBILITIES[category]}.`,
    );
  }
  if (takesMedication) {
    possibleExplanations.push(
      'Because you are taking medication or supplements, a reaction to one of those is also something worth considering, and it is worth telling the clinician exactly what you take.',
    );
  }
  if (hasConditions) {
    possibleExplanations.push(
      'Because you already have ongoing conditions, one of those, or its treatment, may be relevant to what you are seeing now.',
    );
  }
  if (!possibleExplanations.length) {
    possibleExplanations.push(
      'There is not enough here to narrow anything down. A clinician would want to examine you and may order tests.',
    );
  }

  const why = [
    'This summary was built only from the answers you gave and the symptoms you selected, so it is limited in the same way your description is limited.',
    'A physical examination and, where needed, tests can change what the possibilities are. This text cannot do that.',
    'Weight and importance in the source this is drawn from are relative markers, not probabilities, and they are not a diagnosis.',
  ].join(' ');

  const whatToDoNext: string[] = [TRIAGE_PLAIN_LANGUAGE[triage.action]];
  if (!triage.emergency) {
    if (trajectory === 'worse') {
      whatToDoNext.push('Because you said it is getting worse, mention that specifically when you are seen, and do not wait for it to settle on its own.');
    }
    if (severity >= 8) {
      whatToDoNext.push('Because you rated it highly, if it does not improve or it worsens, seek review sooner rather than waiting for the appointment you have booked.');
    }
    whatToDoNext.push('Write down when the symptoms started and anything that changes them. That detail often matters more than anything else at the appointment.');
    if (groups.has('gastrointestinal')) {
      whatToDoNext.push(
        'If you have vomiting or diarrhoea and can keep fluids down, take frequent small sips of fluid. Seek same-day care if you cannot keep fluids down or are passing very little urine.',
      );
    } else if (groups.has('respiratory')) {
      whatToDoNext.push('Rest, drink fluids, and avoid smoke or other airway irritants while you monitor your symptoms.');
    }
  }

  const questionsForDoctor = [
    'Given what I have described, what are the most likely things you are considering?',
    'What should I watch for that would mean I should come back sooner?',
    'Do my current medicines or supplements fit with this?',
    'Is there anything I should avoid doing while we work this out?',
    'Do I need any tests, and if so which ones and why?',
  ];
  if (takesMedication) {
    questionsForDoctor.splice(2, 0, 'Could this be a side effect of anything I am taking?');
  }

  const warningSigns: string[] = triage.notices.map((n: SafetyNotice) => n.body);
  if (!warningSigns.length) {
    warningSigns.push(
      'Seek urgent care if you develop chest pain, difficulty breathing, fainting, or a rash that does not fade when pressed.',
    );
  }

  return {
    summary,
    possibleExplanations,
    why,
    warningSigns,
    whatToDoNext,
    questionsForDoctor,
    redFlagScreen: RED_FLAG_SCREEN_PROMPTS,
    disclaimer: DISCLAIMER,
    sources: [],
    insufficientInformation: missingInformation.length > 0 && input.present.length === 0,
    missingInformation,
    structured: buildStructuredSummary({
      complaint: input.complaint,
      present: input.present,
      answers: input.answers,
      triage,
    }),
  };
}

function listSentence(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * The symptom keys a user has confirmed by answering the questionnaire.
 *
 * This is the only thing that carries a red flag from the questionnaire into the
 * safety engine, so it is deliberately conservative in two directions:
 *
 *  - the key must be a real symptom in the reviewed catalogue, and the question
 *    must be a yes/no one. That keeps `medication_list` and other free-text or
 *    numeric answers out of the symptom set, where they would escalate nothing
 *    but would pollute the summary;
 *  - only a literal `yes` counts. An unanswered or unrecognised value is
 *    treated as "not reported" rather than as an absence the user asserted.
 *
 * Unknown keys are ignored rather than passed through, so a tampered or stale
 * form cannot inject an arbitrary symptom into triage.
 */
export function presentSymptomsFromAnswers(
  answers: Iterable<{ questionKey: string; value: string; kind?: string }>,
): string[] {
  const present: string[] = [];
  for (const answer of answers) {
    if (answer.kind && answer.kind !== 'boolean') continue;
    if (answer.value !== 'yes') continue;
    if (!SYMPTOM_BY_KEY.has(answer.questionKey)) continue;
    present.push(answer.questionKey);
  }
  return present;
}

/** Human label for a stored answer value, falling back to the raw value. */
function answerLabel(questionKey: string, value: string): string {
  const options = questionByKey(questionKey)?.options ?? [];
  const option = options.find((o) => o.value === value);
  if (option) return option.label;
  if (value.includes(',')) {
    const labels = value
      .split(',')
      .map((part) => options.find((o) => o.value === part.trim())?.label ?? part.trim());
    return labels.join(', ');
  }
  // A number, a duration or free text has no options; the value is the answer.
  return value;
}

/**
 * Flatten the stored answer union to text.
 *
 * The questionnaire stores multi-choice answers as a comma-joined string but the
 * type allows a list, so both are accepted. `null` means the question was
 * skipped, which is reported as "not answered" rather than as a blank.
 */
function answerText(value: AnswerValue['value']): string {
  if (value === null || value === undefined) return 'Not answered';
  if (Array.isArray(value)) return value.join(', ') || 'Not answered';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  return value === '' ? 'Not answered' : value;
}

const TRAJECTORY_VALUES: Record<string, StructuredSummary['trajectory']> = {
  better: 'better',
  same: 'same',
  worse: 'worse',
};

/**
 * Build the machine-readable half of the summary.
 *
 * Everything here comes from the stored answers, so it can be regenerated at any
 * time and always agrees with what the person actually said. The questionnaire's
 * own wording is used for the question column rather than a paraphrase, so the
 * export reads as the same thing the person filled in.
 */
export function buildStructuredSummary(input: {
  complaint: string;
  present: string[];
  answers: AnswerValue[];
  triage: TriageResult;
}): StructuredSummary {
  const answerMap = new Map(input.answers.map((a) => [a.questionKey, answerText(a.value)]));

  const rawSeverity = answerMap.get('severity');
  const severityNow = rawSeverity !== undefined ? Number(rawSeverity) : Number.NaN;
  const rawTrajectory = answerMap.get('trajectory');
  const rawDuration = answerMap.get('duration');

  const labels = input.present.map(symptomLabel);
  const mainConcern = labels.length
    ? labels.length === 1
      ? symptomLabel(input.present[0]!)
      : `${symptomLabel(input.present[0]!)}, with ${labels.length - 1} other symptom${labels.length === 2 ? '' : 's'}`
    : input.complaint.trim() || 'Not stated';

  return {
    mainConcern,
    duration: rawDuration ? answerLabel('duration', rawDuration) : null,
    severityNow: Number.isFinite(severityNow) ? severityNow : null,
    trajectory: rawTrajectory ? (TRAJECTORY_VALUES[rawTrajectory] ?? 'unclear') : null,
    associatedSymptoms: labels.slice(1),
    warningSignsIdentified: input.triage.notices.map((n) => n.body),
    // Only true when the engine actually found nothing, which is different from
    // "not yet asked": the caller must not claim a clean screen on a partial one.
    noWarningSignsIdentified: input.triage.notices.length === 0,
    answers: input.answers.map((a) => ({
      question: questionByKey(a.questionKey)?.prompt ?? a.questionKey,
      answer: answerLabel(a.questionKey, answerText(a.value)),
    })),
  };
}
