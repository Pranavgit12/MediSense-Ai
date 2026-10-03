/**
 * Consultation persistence.
 *
 * The questionnaire is server-driven: after every answer the server recomputes
 * which questions are still outstanding from the stored answers, so the client
 * never decides what to ask and a skipped or replayed request cannot skip a
 * safety question.
 */
import { getDb } from '../database/client';
import { isUuid } from './ids';
import { matchSymptomSets, symptomSetName } from '../data/symptom-sets';
import {
  MAX_QUESTIONS_PER_SESSION,
  QUESTION_SET_VERSION,
  isComplete,
  questionByKey,
  validateAnswer,
} from '../data/question-bank';
import { detectSymptomsFromText, buildAssessment, presentSymptomsFromAnswers } from '../medical/assessment';
import { ASKABLE_SYMPTOMS, symptomLabel } from '../data/symptom-catalog';
import { TRIAGE_RULE_SET_VERSION, evaluateTriage } from '../medical/triage';
import { consultationOutcome } from '../medical/adaptive';
import type {
  HaltDecision,
  MedicationAdvice,
  PatientProfile,
  PatientSex,
  SelectionDecision,
} from '../medical/adaptive';
import type { SymptomAssessment, SymptomQuestion, TriageResult } from '../types/medical';

export interface ConsultationSession {
  id: string;
  initialComplaint: string;
  ageYears: number | null;
  status: 'collecting' | 'complete' | 'escalated';
  answers: Map<string, string>;
  triage: TriageResult;
  assessment: SymptomAssessment | null;
  nextQuestion: SymptomQuestion | null;
  answeredCount: number;
  totalQuestions: number;
  symptomSetIds: string[];
  symptomSetNames: string[];
  /** Why the questionnaire stopped, when it stopped. */
  stopReason: SelectionDecision['stopReason'];
  /**
   * The red-flag decision, when one has fired.
   *
   * Binding rather than advisory: while this is present the questionnaire must not
   * ask anything further and no medicine advice may be shown, whatever the
   * questionnaire status happens to say.
   */
  halt: HaltDecision | null;
  /** Generic over-the-counter categories, or an explanation of why there are none. */
  advice: MedicationAdvice;
}

function decode(row: Record<string, unknown>, key: string): TriageResult {
  const raw = row[key];
  if (!raw || typeof raw !== 'object') {
    return evaluateTriage({ present: [], completed: false });
  }
  return raw as TriageResult;
}

function decodeAssessment(row: Record<string, unknown>): SymptomAssessment | null {
  const raw = row.assessment_json;
  return raw && typeof raw === 'object' ? (raw as SymptomAssessment) : null;
}

/**
 * Rebuild the adaptive profile from stored state.
 *
 * The selector is a pure function of exactly these inputs, which is what keeps the
 * server-driven guarantee intact: the client cannot influence which question comes
 * next, because the client is never consulted. A replayed or tampered request
 * recomputes the same decision from the same stored facts.
 *
 * `initial_complaint` is passed as the free text even though it also contains the
 * appended `Selected symptoms:` line. That is deliberate — the seeding step reads
 * it for phrases the person typed, and a duplicated symptom list is harmless there
 * in a way that dropping their own words would not be.
 */
export function profileFor(
  row: {
    initial_complaint: string;
    age_years: number | null;
    sex: string | null;
    detected_symptoms: string[] | null;
  },
  answers: Map<string, string>,
): PatientProfile {
  return {
    ageYears: row.age_years,
    sex: (row.sex as PatientSex) ?? null,
    symptoms: row.detected_symptoms ?? [],
    symptomSets: matchSymptomSets(row.initial_complaint),
    answers,
    freeText: row.initial_complaint,
  };
}

export async function createConsultation(
  userId: string,
  complaint: string,
  ageYears: number | null,
  selectedSymptoms: string[] = [],
  sex: PatientSex = null,
): Promise<string> {
  const db = await getDb();
  const now = new Date();

  const allowedSymptoms = new Set(ASKABLE_SYMPTOMS.map((symptom) => symptom.key));
  if (selectedSymptoms.some((key) => !allowedSymptoms.has(key))) {
    throw new Error('Consultation includes an unknown symptom selection.');
  }
  // Validated against the same list the adaptive engine branches on, so a forged
  // value cannot smuggle in a sex that unlocks a different medicine gate.
  const allowedSexes = new Set<PatientSex>([
    null,
    'female',
    'male',
    'other',
    'prefer_not_to_say',
  ]);
  if (!allowedSexes.has(sex)) {
    throw new Error('Consultation includes an unknown sex value.');
  }
  const uniqueSelectedSymptoms = [...new Set(selectedSymptoms)];
  const initialComplaint = [
    complaint.trim(),
    uniqueSelectedSymptoms.length
      ? `Selected symptoms: ${uniqueSelectedSymptoms.map(symptomLabel).join(', ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  // Symptoms the user already named in their own words, so the first triage is
  // meaningful even before the questionnaire is finished.
  const detected = [
    ...new Set([...detectSymptomsFromText(complaint), ...uniqueSelectedSymptoms]),
  ];
  const triage = evaluateTriage({ present: detected, ageYears, completed: false });

  const row = await db
    .insertInto('symptom_sessions')
    .values({
      user_id: userId,
      initial_complaint: initialComplaint,
      detected_symptoms: detected,
      age_years: ageYears,
      sex,
      triage_level: triage.level,
      triage_action: triage.action,
      triage_json: triage,
      status: triage.emergency ? 'escalated' : 'collecting',
      question_set_version: QUESTION_SET_VERSION,
      rule_set_version: TRIAGE_RULE_SET_VERSION,
      created_at: now,
      updated_at: now,
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  return row.id;
}

async function loadAnswers(sessionId: string): Promise<Map<string, string>> {
  const db = await getDb();
  const rows = await db
    .selectFrom('symptom_answers')
    .select(['question_key', 'value_text'])
    .where('session_id', '=', sessionId)
    .orderBy('asked_at', 'asc')
    .execute();

  const answers = new Map<string, string>();
  for (const r of rows) {
    if (r.value_text !== null) answers.set(r.question_key, r.value_text);
  }
  return answers;
}

export async function getConsultation(
  userId: string,
  sessionId: string,
): Promise<ConsultationSession | null> {
  if (!isUuid(sessionId)) return null;
  const db = await getDb();

  const row = await db
    .selectFrom('symptom_sessions')
    .selectAll()
    .where('id', '=', sessionId)
    .where('user_id', '=', userId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();

  if (!row) return null;

  const answers = await loadAnswers(sessionId);
  const profile = profileFor(
    {
      initial_complaint: row.initial_complaint,
      age_years: row.age_years,
      sex: row.sex,
      detected_symptoms: row.detected_symptoms,
    },
    answers,
  );
  const outcome = consultationOutcome(profile);
  const symptomSetIds = profile.symptomSets;

  return {
    id: row.id,
    initialComplaint: row.initial_complaint,
    ageYears: row.age_years,
    status: row.status,
    answers,
    triage: decode(row as Record<string, unknown>, 'triage_json'),
    assessment: decodeAssessment(row as Record<string, unknown>),
    // `node.question` is already the shape the form renders, so the adaptive
    // engine hands the UI exactly what the legacy bank used to.
    nextQuestion: outcome.next.node?.question ?? null,
    answeredCount: answers.size,
    symptomSetIds,
    symptomSetNames: symptomSetIds.map(symptomSetName),
    // The selector adapts, so the final count is not knowable up front. Advertise
    // the cap rather than a guess: it is the one number that cannot be wrong in a
    // way that matters, and the client is not using it for anything.
    totalQuestions: MAX_QUESTIONS_PER_SESSION,
    stopReason: outcome.next.stopReason,
    halt: outcome.halt,
    advice: outcome.advice,
  };
}

export interface SaveAnswerResult {
  session: ConsultationSession | null;
  error: string | null;
}

/**
 * Record one answer. The question is re-validated server-side against the bank,
 * so a tampered or stale form cannot record a key that was never asked.
 */
export async function saveAnswer(
  userId: string,
  sessionId: string,
  questionKey: string,
  value: string,
): Promise<SaveAnswerResult> {
  const db = await getDb();

  const current = await getConsultation(userId, sessionId);
  if (!current) return { session: null, error: 'That consultation could not be found.' };
  if (current.status !== 'collecting') {
    return { session: current, error: 'This consultation is already finished.' };
  }

  // A red flag stops the questionnaire. Not "hides the next question" — there is
  // no next question, and accepting an answer here would imply the survey carried
  // on past the point where it must hand over to real care.
  if (current.halt) {
    return {
      session: current,
      error: 'This consultation has stopped because it needs medical assessment.',
    };
  }

  // Only the question the selector actually chose may be answered. This is
  // stricter than the old check, which accepted any question still outstanding:
  // under adaptation "outstanding" is not a stable set, so accepting a key the
  // selector did not pick would let a client walk the graph in an order the
  // engine never chose.
  const question = current.nextQuestion;
  if (!question || question.key !== questionKey) {
    // A replayed submission for an already-answered question is not an error
    // worth failing the form over; it just means there is nothing to record.
    if (current.answers.has(questionKey)) return { session: current, error: null };
    return { session: current, error: 'That question is not the current question.' };
  }

  const problem = validateAnswer(question, value);
  if (problem) {
    return { session: current, error: problem };
  }

  const now = new Date();
  await db
    .insertInto('symptom_answers')
    .values({
      session_id: sessionId,
      question_id: null,
      question_key: questionKey,
      value_text: value,
      asked_at: now,
      answered_at: now,
    })
    .execute();

  return { session: await getConsultation(userId, sessionId), error: null };
}

/** Re-run triage on the finished answers and build the written assessment. */
export async function completeConsultation(
  userId: string,
  sessionId: string,
): Promise<SaveAnswerResult> {
  const db = await getDb();
  const current = await getConsultation(userId, sessionId);
  if (!current) return { session: null, error: 'That consultation could not be found.' };

  const present = [
    ...new Set([
      ...detectSymptomsFromText(current.initialComplaint),
      ...presentSymptomsFromAnswers(
        [...current.answers].map(([questionKey, value]) => ({
          questionKey,
          value,
          kind: questionByKey(questionKey)?.kind,
        })),
      ),
    ]),
  ];

  const triage = evaluateTriage({
    present,
    absent: [],
    ageYears: current.ageYears,
    completed: isComplete(current.answers, current.symptomSetIds),
  });

  const assessment = buildAssessment({
    complaint: current.initialComplaint,
    present,
    answers: [...current.answers].map(([questionKey, value]) => ({
      questionId: questionByKey(questionKey)?.id ?? questionKey,
      questionKey,
      value,
    })),
    triage,
  });

  await db
    .updateTable('symptom_sessions')
    .set({
      triage_level: triage.level,
      triage_action: triage.action,
      triage_json: triage,
      assessment_json: assessment,
      status: triage.emergency ? 'escalated' : 'complete',
      updated_at: new Date(),
    })
    .where('id', '=', sessionId)
    .execute();

  return { session: await getConsultation(userId, sessionId), error: null };
}

export interface ConsultationListItem {
  id: string;
  complaint: string;
  status: 'collecting' | 'complete' | 'escalated';
  triageLevel: TriageResult['level'];
  createdAt: Date;
}

export async function listConsultations(
  userId: string,
  limit = 20,
): Promise<ConsultationListItem[]> {
  const db = await getDb();
  const rows = await db
    .selectFrom('symptom_sessions')
    .select(['id', 'initial_complaint', 'status', 'triage_level', 'created_at'])
    .where('user_id', '=', userId)
    .where('deleted_at', 'is', null)
    .orderBy('created_at', 'desc')
    .limit(limit)
    .execute();

  return rows.map((r) => ({
    id: r.id,
    complaint: r.initial_complaint,
    status: r.status,
    triageLevel: r.triage_level as TriageResult['level'],
    createdAt: r.created_at,
  }));
}
