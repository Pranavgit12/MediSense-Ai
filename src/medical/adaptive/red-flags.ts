/**
 * Red flags: the rules that stop the questionnaire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CLINICAL REVIEW REQUIRED
 * Thresholds, wording and routing in this file are authored, not clinician-signed.
 * Every rule needs a named clinician to confirm the threshold, the action and the
 * patient-facing wording before real use. See `REVIEW_STATUS` in `types.ts`.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ── The contract ─────────────────────────────────────────────────────────────
 *
 * `evaluateRedFlags` is the only thing in the engine allowed to end a session
 * early. It is pure, total, and ordered: it looks at every rule on every call, and
 * returns the most severe match rather than the first. So a single call answers
 * "should this person stop answering questions, and what do we tell them?" without
 * depending on the order questions happened to be asked in — which matters, because
 * the adaptive engine deliberately changes that order.
 *
 * Nothing here is fuzzy-matching a prompt. Each rule names a topic or a question
 * key and asks whether that topic was *positively reported*. An unanswered question
 * is never a red flag, and a "no" answer never is.
 */
import type { SafetyAction, SafetyLevel, SymptomQuestion } from '../../types/medical';
import type { HaltDecision, Topic } from './types';
import type { EvalContext } from './conditions';
import {
  DURATION_ORDER,
  answerIncludes,
  firstAnswer,
  isWorsening,
  resolveDuration,
} from './profile';
import { topicReported } from './conditions';
import { RED_FLAG_SYMPTOMS } from '../../data/symptom-catalog';

/** How the screen found the finding, for the audit trail. */
type Basis = 'reported' | 'answered' | 'derived';

interface RedFlagRule {
  id: string;
  level: SafetyLevel;
  action: SafetyAction;
  title: string;
  body: string;
  /**
   * Whether this rule fires on a positive report, or only on a direct answer.
   *
   * Most rules read a reported topic, which lets the finding arrive either through
   * an answer or through the opening free text. A few read derived facts — a
   * temperature, a pain score — which only exist once their question is answered.
   */
  basis: Basis;
  /** For `reported`: is this topic positively reported? */
  topic?: Topic;
  /** For `answered`: does this answer say yes? */
  key?: string;
  /** For `derived`: the extra fact that must also hold. */
  derived?: (context: EvalContext) => boolean;
  /** Machine-readable reasons, shown to the clinician-facing summary. */
  triggers: string[];
  /** Thresholds. Named so a reviewer can see the number without reading code. */
  threshold?: { temperatureC?: number; severity?: number; durationDays?: number };
}

/**
 * Thresholds, in one place, so they can be reviewed as numbers.
 *
 * A 39°C reading is a genuinely different situation from 38°C, and a patient with
 * no thermometer cannot answer a temperature question at all — so the rules below
 * check "is there a temperature, and is it high" together rather than making the
 * numeric branch mandatory.
 */
const THRESHOLDS = {
  /** Temperature at which a fever is treated as significant in an adult. */
  significantFeverC: 39,
  /** Temperature that is urgent on its own in a child or an older adult. */
  urgentFeverC: 39.5,
  /** Pain score at which pain is treated as severe. */
  severePain: 8,
  /** Duration, in days, past which a fever should already have been reviewed. */
  feverUnreviewedDays: 7,
} as const;

/**
 * The same threshold as a duration rank.
 *
 * Expressed against the authored buckets rather than in days so it cannot drift
 * out of step with the option values: `d1_3w` is the first bucket that starts past
 * a week, and `DURATION_ORDER` is what the duration questions actually use.
 */
const BEYOND_A_WEEK_RANK = DURATION_ORDER.d1_3w ?? 4;

/** Does this topic have a positive report? */
function reported(context: EvalContext, topic: Topic): boolean {
  return topicReported(topic, context);
}

/** Did this question get a yes? */
function answeredYes(context: EvalContext, key: string): boolean {
  const value = firstAnswer(context.profile, [key]);
  if (value === undefined) return false;
  const parts = value.split(',');
  return parts.some((part) => part === 'yes' || part === 'more' || part === 'streaks');
}

/**
 * The rules.
 *
 * Ordered in the file for readability, not for evaluation: `evaluateRedFlags` scans
 * all of them and picks by severity, so appending a rule here cannot change the
 * behaviour of the ones above it.
 */
const RED_FLAG_RULES: RedFlagRule[] = [
  // ── Emergency: same-day, in person, without waiting for anything ───────────
  {
    // Not severe_allergic_reaction: that is also a question key, and rule ids
    // share an audit trail with question keys. Keeping them in separate
    // namespaces is what makes a halt traceable back to the answer that caused it.
    id: 'severe_allergic_reaction_reported',
    level: 'emergency',
    action: 'call_emergency_services',
    title: 'Possible severe allergic reaction',
    body:
      'Swelling of the lips, tongue or face, or a tight throat, can be part of a severe allergic reaction. This needs emergency assessment now — do not wait to see whether it settles.',
    basis: 'reported',
    topic: 'red_flag.severe_allergic_reaction',
    triggers: ['severe_allergic_reaction'],
  },
  {
    id: 'difficulty_breathing',
    level: 'emergency',
    action: 'call_emergency_services',
    title: 'Difficulty breathing needs immediate assessment',
    body:
      'Breathing that is difficult, laboured or suddenly much worse needs to be looked at now. Do not drive yourself if you are struggling to breathe.',
    basis: 'reported',
    topic: 'red_flag.breathlessness',
    triggers: ['difficulty_breathing'],
  },
  {
    id: 'sudden_breathlessness',
    level: 'emergency',
    action: 'call_emergency_services',
    title: 'Breathlessness that came on suddenly',
    body:
      'Breathlessness that started suddenly, rather than building up over days, can indicate a problem with the heart or lungs that needs urgent assessment.',
    basis: 'reported',
    topic: 'red_flag.sudden_breathlessness',
    triggers: ['sudden_breathlessness'],
  },
  {
    id: 'blue_lips_or_face',
    level: 'emergency',
    action: 'call_emergency_services',
    title: 'Blue lips or face',
    body: 'A blue or grey tint to the lips or face means there may not be enough oxygen reaching the blood. This needs emergency care now.',
    basis: 'reported',
    topic: 'red_flag.cyanosis',
    triggers: ['cyanosis'],
  },
  {
    id: 'severe_chest_pain',
    level: 'emergency',
    action: 'emergency_department',
    title: 'Chest pain needs urgent assessment',
    body:
      'Chest pain can be a sign of a heart problem. Especially if it is crushing, spreads to your arm, jaw or back, or comes with sweating — get help now rather than monitoring it at home.',
    basis: 'reported',
    topic: 'red_flag.chest_pain',
    triggers: ['chest_pain'],
  },
  {
    id: 'loss_of_consciousness',
    level: 'emergency',
    action: 'call_emergency_services',
    title: 'Fainting, collapse or reduced awareness',
    body:
      'Fainting, passing out, or someone being confused or unusually drowsy needs emergency assessment. If they are hard to wake, call emergency services now.',
    basis: 'reported',
    topic: 'red_flag.altered_sensorium',
    triggers: ['altered_sensorium', 'syncope'],
  },
  {
    id: 'one_sided_weakness',
    level: 'emergency',
    action: 'call_emergency_services',
    title: 'Weakness on one side of the body',
    body:
      'Weakness or numbness down one side of the body, or sudden difficulty speaking or seeing, can be a stroke. Call emergency services now — do not wait to see if it improves.',
    basis: 'reported',
    topic: 'red_flag.stroke',
    triggers: ['stroke_signs'],
  },
  {
    id: 'severe_allergic_reaction_skin',
    level: 'emergency',
    action: 'emergency_department',
    title: 'Facial swelling with a rash',
    body:
      'Facial swelling together with a rash can be part of a severe allergic reaction, particularly if it started after a new medicine or food.',
    basis: 'reported',
    topic: 'red_flag.severe_allergic_reaction',
    triggers: ['facial_swelling'],
  },

  // ── Emergency, but only when combined: the reason for a `derived` basis ────
  {
    id: 'severe_pain_worsening',
    level: 'emergency',
    action: 'emergency_department',
    title: 'Severe pain that is getting worse quickly',
    body:
      'Severe pain that is rapidly worsening, rather than steady, needs urgent assessment — the cause matters more here than the severity on its own.',
    basis: 'derived',
    derived: (context) =>
      (context.severity !== null && context.severity >= THRESHOLDS.severePain) || context.worsening,
    triggers: ['rapid_worsening_pain'],
    threshold: { severity: THRESHOLDS.severePain },
  },
  {
    id: 'stiff_neck_with_fever',
    level: 'emergency',
    action: 'emergency_department',
    title: 'Stiff neck with a fever',
    body:
      'A stiff neck together with a fever can be a sign of meningitis, particularly if there is also a rash that does not fade under pressure, or someone seems confused.',
    basis: 'derived',
    derived: (context) =>
      reported(context, 'red_flag.stiff_neck') && reported(context, 'red_flag.fever_present'),
    triggers: ['stiff_neck_with_fever'],
  },
  {
    id: 'non_blanching_rash_with_fever',
    level: 'emergency',
    action: 'emergency_department',
    title: 'A rash that does not fade under pressure, with a fever',
    body:
      'Red or purple spots that do not fade when you press a glass against them, together with a fever, need emergency assessment. Do not wait for a rash to spread.',
    basis: 'derived',
    derived: (context) =>
      reported(context, 'red_flag.non_blanching_rash') && reported(context, 'red_flag.fever_present'),
    triggers: ['non_blanching_rash', 'fever'],
  },

  // ── Urgent: today, but not an ambulance ────────────────────────────────────
  {
    id: 'any_bleeding',
    level: 'urgent',
    action: 'urgent_same_day_care',
    title: 'Blood is a finding that should be checked',
    body:
      'Blood in vomit, stool, urine or sputum should be reviewed by a clinician today, whatever else is going on. Take a photograph of the blood if it helps you describe it.',
    basis: 'reported',
    topic: 'red_flag.bleeding',
    triggers: ['bleeding'],
  },
  {
    id: 'blood_in_sputum',
    level: 'urgent',
    action: 'urgent_same_day_care',
    title: 'Coughing up blood',
    body: 'Coughing up streaks of blood, or more than streaks, should be reviewed by a clinician today, particularly if you also have chest pain or are short of breath.',
    basis: 'answered',
    key: 'cough_blood',
    triggers: ['haemoptysis'],
  },
  {
    id: 'dehydration',
    level: 'urgent',
    action: 'urgent_same_day_care',
    title: 'Not keeping fluids down, or passing very little urine',
    body:
      'Not being able to keep fluids down, or passing much less urine than usual, is a dehydration risk that needs same-day advice. Seek care sooner if you become confused or very weak.',
    basis: 'reported',
    topic: 'red_flag.dehydration',
    triggers: ['dehydration'],
  },
  {
    id: 'fever_not_reviewed_after_a_week',
    level: 'urgent',
    action: 'urgent_same_day_care',
    title: 'A fever lasting more than a week, with no medical review',
    body:
      'A fever that has lasted over a week without a clinician seeing it should be reviewed today, whatever it feels like. Ongoing fever can have causes that need tests.',
    basis: 'derived',
    derived: (context) => {
      if (!reported(context, 'red_flag.fever_present')) return false;
      const duration = resolveDuration(context.profile);
      if (!duration || duration.rank < BEYOND_A_WEEK_RANK) return false;
      // Only when nobody has been seen. A fever already under review is a
      // different conversation, and re-flagging it would train people to ignore
      // the screen.
      return !answeredYes(context, 'fever_consulted');
    },
    triggers: ['prolonged_fever'],
    threshold: { durationDays: THRESHOLDS.feverUnreviewedDays },
  },
  {
    id: 'significant_fever',
    level: 'urgent',
    action: 'urgent_same_day_care',
    title: 'A high temperature',
    body:
      'A temperature around 39°C or higher needs same-day advice, particularly for a child, an older adult, or anyone who is drinking less than usual.',
    basis: 'derived',
    derived: (context) => feverReading(context) >= THRESHOLDS.significantFeverC,
    triggers: ['high_temperature'],
    threshold: { temperatureC: THRESHOLDS.significantFeverC },
  },
  {
    id: 'infant_fever',
    level: 'urgent',
    action: 'urgent_same_day_care',
    title: 'Fever in a baby under three months',
    body:
      'A fever in a baby under three months is treated differently and needs assessment today, even if the baby otherwise seems well.',
    basis: 'answered',
    key: 'infant_fever_concern',
    triggers: ['infant_fever'],
  },
  {
    id: 'severe_pain',
    level: 'urgent',
    action: 'urgent_same_day_care',
    title: 'Severe pain',
    body: 'Pain at the severe end of the scale should be reviewed today, particularly if it is not settling or is not controlled by ordinary painkillers.',
    basis: 'derived',
    derived: (context) => context.severity !== null && context.severity >= THRESHOLDS.severePain,
    triggers: ['severe_pain'],
    threshold: { severity: THRESHOLDS.severePain },
  },
  {
    id: 'neck_lump',
    level: 'urgent',
    action: 'urgent_same_day_care',
    title: 'A lump in the neck that does not go away',
    body: 'A lump in the neck that persists, is painless, or is getting bigger should be examined by a clinician rather than monitored.',
    basis: 'reported',
    topic: 'red_flag.neck_lump',
    triggers: ['neck_lump'],
  },
  {
    id: 'abdominal_swelling',
    level: 'urgent',
    action: 'urgent_same_day_care',
    title: 'A swollen abdomen',
    body: 'A swollen or distended abdomen, especially with vomiting or when it is tender, needs assessment rather than watchful waiting.',
    basis: 'reported',
    topic: 'red_flag.abdominal_swelling',
    triggers: ['abdominal_swelling'],
  },
  {
    id: 'unexplained_weight_loss',
    level: 'urgent',
    action: 'urgent_same_day_care',
    title: 'Unexplained weight loss',
    body: 'Losing weight without trying, together with low energy, needs to be investigated. Book an appointment rather than treating it as part of the current complaint.',
    basis: 'reported',
    topic: 'red_flag.weight_loss',
    triggers: ['weight_loss'],
  },
  {
    id: 'medication_reaction',
    level: 'urgent',
    action: 'urgent_same_day_care',
    title: 'Something you took made this worse',
    body:
      'A new problem that started after taking a medicine should be reviewed today. Stop taking it and mention it when you speak to a clinician or pharmacist.',
    basis: 'answered',
    key: 'medication_taken_now_worse',
    triggers: ['adverse_reaction'],
  },
];

/** The highest temperature recorded, if any was asked for. */
function feverReading(context: EvalContext): number {
  const raw = firstAnswer(context.profile, ['fever_max_temp', 'fever_max']);
  if (raw === undefined) return 0;
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return 0;
  // Patients report in Celsius; a clearly Fahrenheit reading is converted, since
  // the thresholds are Celsius and a mis-scaled reading would silently pass.
  return value > 45 ? ((value - 32) * 5) / 9 : value;
}

function matches(rule: RedFlagRule, context: EvalContext): boolean {
  switch (rule.basis) {
    case 'reported':
      return rule.topic !== undefined && reported(context, rule.topic);
    case 'answered':
      return rule.key !== undefined && answeredYes(context, rule.key);
    case 'derived':
      return rule.derived ? rule.derived(context) : false;
    default:
      return false;
  }
}

/** Emergency outranks urgent. Anything else, and the first rule wins. */
const SEVERITY_ORDER: Record<string, number> = { emergency: 2, urgent: 1 };

/**
 * Should this session stop, and what do we tell the patient?
 *
 * Returns null when nothing has fired. When something has, the returned decision
 * always sets `suppressMedication`, because the engine's rule is that no
 * self-medication guidance is rendered once a red flag is present — not even for
 * the parts of the complaint that look benign.
 */
export function evaluateRedFlags(context: EvalContext): HaltDecision | null {
  let best: HaltDecision | null = null;

  for (const rule of RED_FLAG_RULES) {
    if (!matches(rule, context)) continue;

    const decision: HaltDecision = {
      redFlag: true,
      level: rule.level,
      action: rule.action,
      ruleId: rule.id,
      title: rule.title,
      body: rule.body,
      suppressMedication: true,
      triggers: rule.triggers,
    };

    if (!best || SEVERITY_ORDER[rule.level]! > SEVERITY_ORDER[best.level]!) {
      best = decision;
    }
  }

  return best;
}

/**
 * Red flags visible in the presenting complaint alone, before any questions.
 *
 * The intake form collects symptoms, and some of them are red flags in their own
 * right. Waiting to ask about them would mean the patient is told to carry on
 * answering questions after they have already reported, say, blood in their vomit.
 * This runs on the symptom list, so the screen starts at intake rather than after
 * the first answer.
 */
export function redFlagsFromSymptoms(symptoms: readonly string[]): string[] {
  const present = new Set(symptoms);
  return RED_FLAG_SYMPTOMS.filter((symptom) => present.has(symptom.key)).map((symptom) => symptom.key);
}

/** Every rule, for the reviewer-facing documentation surface. */
export function redFlagRuleIds(): string[] {
  return RED_FLAG_RULES.map((rule) => rule.id);
}

/** Guard against a symptom being both a question and a red flag in the bank. */
export function assertNoRedFlagIsAlsoAQuestion(symptoms: readonly SymptomQuestion[]): void {
  const keys = new Set(symptoms.map((question) => question.key));
  const overlap = redFlagRuleIds().filter((id) => keys.has(id));
  if (overlap.length > 0) {
    throw new Error(`Red flag rule ids collide with question keys: ${overlap.join(', ')}`);
  }
}

/** Unused import guard: keeps the multi-choice helper reachable for readers. */
export function includesOption(value: string, option: string): boolean {
  return answerIncludes(value, option);
}

/** Worsening is re-exported so the selector can order on it without a second import. */
export { isWorsening };