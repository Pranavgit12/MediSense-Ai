/**
 * Deterministic safety triage.
 *
 * This module decides how urgently someone should be seen. It is deliberately
 * pure, table-driven and LLM-free: routing must never depend on a model that
 * could be unavailable, mis-tuned, or persuaded by the user's own wording.
 *
 * The clinical content is taken from the red-flag notes curated in
 * `src/data/symptom-catalog.ts`; the routing levels below are the code's own
 * conservative reading of them.
 */
import { PROVENANCE } from '../types/medical';
import type { Provenance, SafetyAction, SafetyLevel, SafetyNotice, TriageResult } from '../types/medical';
import { isRedFlag, redFlagGuidance } from '../data/symptom-catalog';

export const TRIAGE_RULE_SET_VERSION = 'safety-rules/1.0.0';

/** Red flags that mean: emergency services now. */
export const EMERGENCY_SYMPTOMS: ReadonlySet<string> = new Set([
  'chest_pain',
  'coma',
  'weakness_of_one_body_side',
  'slurred_speech',
  'altered_sensorium',
  'stomach_bleeding',
  'acute_liver_failure',
]);

/** Red flags that mean: seen the same day. */
export const URGENT_SYMPTOMS: ReadonlySet<string> = new Set([
  'high_fever',
  'breathlessness',
  'blood_in_sputum',
  'rusty_sputum',
  'dehydration',
  'sunken_eyes',
  'toxic_look_typhos',
  'red_spots_over_body',
  'bloody_stool',
  'bruising',
  'stiff_neck',
  'swelled_lymph_nodes',
  'yellowing_of_eyes',
  'yellowish_skin',
  'swelling_of_stomach',
  'loss_of_balance',
]);

/**
 * Combinations that escalate above the level of their individual parts.
 * `all` must ALL be present for the rule to fire.
 */
interface CombinationRule {
  id: string;
  all: string[];
  level: SafetyLevel;
  action: SafetyAction;
  title: string;
  body: string;
  suppressNarrative: boolean;
}

export const COMBINATION_RULES: CombinationRule[] = [
  {
    id: 'meningitis-pattern',
    all: ['stiff_neck', 'high_fever'],
    level: 'emergency',
    action: 'call_emergency_services',
    title: 'Stiff neck together with a high fever',
    body: 'A stiff neck with a high fever can be a sign of meningitis, which needs emergency assessment now. Please call your local emergency number or go to an emergency department.',
    suppressNarrative: true,
  },
  {
    id: 'meningitis-pattern-rash',
    all: ['high_fever', 'red_spots_over_body'],
    level: 'emergency',
    action: 'call_emergency_services',
    title: 'High fever with a rash that does not fade',
    body: 'A rash that does not fade when you press a glass against the skin, together with a high fever, can be a medical emergency. Please seek emergency care now.',
    suppressNarrative: true,
  },
  {
    id: 'fever-confusion',
    all: ['high_fever', 'altered_sensorium'],
    level: 'emergency',
    action: 'call_emergency_services',
    title: 'High fever with confusion or reduced awareness',
    body: 'A high fever together with confusion, drowsiness or difficulty waking needs emergency assessment now.',
    suppressNarrative: true,
  },
  {
    id: 'chest-pain-breathless',
    all: ['chest_pain', 'breathlessness'],
    level: 'emergency',
    action: 'call_emergency_services',
    title: 'Chest pain together with breathlessness',
    body: 'Chest pain with difficulty breathing needs emergency assessment. Please call your local emergency number now.',
    suppressNarrative: true,
  },
  {
    id: 'stroke-pattern',
    all: ['weakness_of_one_body_side', 'slurred_speech'],
    level: 'emergency',
    action: 'call_emergency_services',
    title: 'One-sided weakness together with slurred speech',
    body: 'Weakness down one side of the body with slurred speech can be a stroke. This is an emergency. Note the time the symptoms started and tell the emergency services when they arrive.',
    suppressNarrative: true,
  },
  {
    id: 'bleeding-dizziness',
    all: ['stomach_bleeding', 'blood_in_sputum'],
    level: 'emergency',
    action: 'emergency_department',
    title: 'Signs of internal bleeding',
    body: 'Blood in vomit together with blood in phlegm suggests internal bleeding. Please go to an emergency department now, and do not drive yourself.',
    suppressNarrative: true,
  },
];

export interface TriageInput {
  /** Symptom keys the user answered "yes" to. */
  present: string[];
  /** Declined or unanswered symptom keys. */
  absent?: string[];
  ageYears?: number | null;
  /** Whether the questionnaire was completed. */
  completed?: boolean;
}

function noticeFor(key: string, level: SafetyLevel, action: SafetyAction): SafetyNotice {
  const guidance = redFlagGuidance(key) ?? `This symptom (${key.replace(/_/g, ' ')}) is treated as a warning sign.`;
  return {
    id: `notice_${key}`,
    level,
    action,
    title: key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
    body: guidance,
    triggers: [key],
    ruleId: `red_flag_${key}`,
    ruleVersion: TRIAGE_RULE_SET_VERSION,
    source: null,
    suppressNarrative: level === 'emergency',
  };
}

function emptyResult(level: SafetyLevel, action: SafetyAction): TriageResult {
  return {
    level,
    action,
    notices: [],
    emergency: level === 'emergency',
    evaluatedRuleIds: [],
    ruleSetVersion: TRIAGE_RULE_SET_VERSION,
    missingInformation: [],
  };
}

const EMPTY_TRIAGE = emptyResult('routine', 'self_care_with_safety_netting');

/**
 * Route the user. Most severe finding wins; an emergency finding suppresses the
 * narrative entirely rather than softening it.
 */
export function evaluateTriage(input: TriageInput): TriageResult {
  const present = new Set(input.present);
  const notices: SafetyNotice[] = [];
  const evaluatedRuleIds: string[] = [];
  const missingInformation: string[] = [];

  // 1. Combination rules first: they outrank the individual parts.
  for (const rule of COMBINATION_RULES) {
    if (rule.all.every((k) => present.has(k))) {
      evaluatedRuleIds.push(rule.id);
      notices.push({
        id: `notice_${rule.id}`,
        level: rule.level,
        action: rule.action,
        title: rule.title,
        body: rule.body,
        triggers: [...rule.all],
        ruleId: rule.id,
        ruleVersion: TRIAGE_RULE_SET_VERSION,
        source: null,
        suppressNarrative: rule.suppressNarrative,
      });
    }
  }

  // 2. Individual red flags, so nothing is lost when a combination also fired.
  for (const key of input.present) {
    if (!isRedFlag(key)) continue;
    const emergency = EMERGENCY_SYMPTOMS.has(key);
    notices.push(noticeFor(key, emergency ? 'emergency' : 'urgent', emergency ? 'call_emergency_services' : 'urgent_same_day_care'));
    evaluatedRuleIds.push(`red_flag_${key}`);
  }

  // 3. Resolve the overall level: emergency beats everything.
  if (notices.some((n) => n.level === 'emergency')) {
    return {
      level: 'emergency',
      action: 'call_emergency_services',
      notices,
      emergency: true,
      evaluatedRuleIds,
      ruleSetVersion: TRIAGE_RULE_SET_VERSION,
      missingInformation,
    };
  }

  if (notices.some((n) => n.level === 'urgent')) {
    return {
      level: 'urgent',
      action: 'urgent_same_day_care',
      notices,
      emergency: false,
      evaluatedRuleIds,
      ruleSetVersion: TRIAGE_RULE_SET_VERSION,
      missingInformation,
    };
  }

  // 4. No red flags. Route on how much non-emergency symptom burden there is.
  const symptomCount = input.present.length;
  const age = input.ageYears;

  if (input.present.length === 0) {
    if (input.completed === false) missingInformation.push('No symptoms were selected, so there is nothing to go on.');
    return { ...EMPTY_TRIAGE, missingInformation, evaluatedRuleIds };
  }

  if (symptomCount >= 8) {
    return {
      ...emptyResult('soon', 'clinician_within_24_48h'),
      notices,
      evaluatedRuleIds,
      missingInformation,
    };
  }

  // Very young and very old people are routed earlier for the same symptoms.
  const vulnerable = age !== null && age !== undefined && (age < 5 || age > 65);
  if (vulnerable && symptomCount >= 4) {
    return {
      ...emptyResult('soon', 'clinician_within_24_48h'),
      notices,
      evaluatedRuleIds,
      missingInformation,
    };
  }

  if (symptomCount >= 4) {
    return {
      ...emptyResult('soon', 'clinician_within_1_2_weeks'),
      notices,
      evaluatedRuleIds,
      missingInformation,
    };
  }

  return {
    ...emptyResult('routine', 'self_care_with_safety_netting'),
    notices,
    evaluatedRuleIds,
    missingInformation,
  };
}

const LEVEL_ORDER: Record<SafetyLevel, number> = {
  emergency: 0,
  urgent: 1,
  soon: 2,
  routine: 3,
  unknown: 4,
};

/** Escalate to the more urgent of two results. Used to fold in a lab finding. */
export function escalate(a: TriageResult, b: TriageResult): TriageResult {
  return LEVEL_ORDER[a.level] <= LEVEL_ORDER[b.level] ? a : b;
}

export const TRIAGE_PLAIN_LANGUAGE: Record<SafetyAction, string> = {
  call_emergency_services: 'Call your local emergency number now, or go to an emergency department.',
  emergency_department: 'Go to an emergency department as soon as possible.',
  urgent_same_day_care: 'Get this reviewed by a clinician today.',
  clinician_within_24_48h: 'Book to see a clinician within the next day or two.',
  clinician_within_1_2_weeks: 'Book an appointment with a clinician in the next week or two.',
  self_care_with_safety_netting: 'Self-care may be reasonable, but keep an eye on the safety points below.',
  insufficient_information: 'There is not enough information here to suggest what to do next.',
};

export const TRIAGE_PROVENANCE: Provenance = PROVENANCE.COMPUTED;
