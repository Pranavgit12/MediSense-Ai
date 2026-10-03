'use server';

import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/local-user';
import {
  completeConsultation,
  createConsultation,
  saveAnswer,
} from '@/server/consultation-store';
import { ASKABLE_SYMPTOMS } from '@/data/symptom-catalog';
import type { PatientSex } from '@/medical/adaptive';

/** The only sex values the engine knows how to branch on. */
const SEX_VALUES: PatientSex[] = ['female', 'male', 'other', 'prefer_not_to_say'];

export interface StartConsultationState {
  error: string | null;
  complaint: string;
}

const MAX_COMPLAINT = 2_000;

export async function startConsultationAction(
  _prev: StartConsultationState,
  formData: FormData,
): Promise<StartConsultationState> {
  const user = await getCurrentUser();

  const raw = formData.get('complaint');
  const complaint = typeof raw === 'string' ? raw.trim() : '';
  const rawSymptoms = formData.getAll('symptoms');
  const selectedSymptoms = rawSymptoms.filter((value): value is string => typeof value === 'string');
  const ageRaw = formData.get('age');
  const age = typeof ageRaw === 'string' && ageRaw.trim() ? Number(ageRaw) : null;

  // Sex is optional by design. It gates a small number of adaptive branches and
  // medicine blocks, and it is never a reason to refuse somebody an assessment —
  // so a missing or unrecognised value falls through to "not stated" rather than
  // erroring, and the engine treats it accordingly.
  const sexRaw = formData.get('sex');
  const sex: PatientSex =
    typeof sexRaw === 'string' && SEX_VALUES.includes(sexRaw as PatientSex)
      ? (sexRaw as PatientSex)
      : null;

  const allowedSymptoms = new Set(ASKABLE_SYMPTOMS.map((symptom) => symptom.key));
  if (selectedSymptoms.some((key) => !allowedSymptoms.has(key))) {
    return { error: 'Please choose symptoms from the list.', complaint };
  }
  if (selectedSymptoms.length === 0 && complaint.length < 5) {
    return { error: 'Choose a symptom or add a short description of at least 5 characters.', complaint };
  }
  if (complaint.length > MAX_COMPLAINT) {
    return { error: 'Please shorten that to a few sentences.', complaint: complaint.slice(0, MAX_COMPLAINT) };
  }
  if (age !== null && (!Number.isFinite(age) || age < 0 || age > 130)) {
    return { error: 'Enter your age as a number between 0 and 130, or leave it blank.', complaint };
  }

  const sessionId = await createConsultation(user.id, complaint, age, selectedSymptoms, sex);
  redirect(`/app/consult/${sessionId}`);
}

export interface AnswerState {
  error: string | null;
}

/**
 * Record one answer.
 *
 * The page re-renders from the database afterwards, so this action does not
 * decide what is asked next. When the last outstanding question is answered it
 * completes the consultation and redirects to the written assessment.
 */
export async function answerQuestionAction(
  _prev: AnswerState,
  formData: FormData,
): Promise<AnswerState> {
  const user = await getCurrentUser();
  const sessionId = String(formData.get('sessionId') ?? '');
  const questionKey = String(formData.get('questionKey') ?? '');
  const value = String(formData.get('value') ?? '');

  if (!sessionId || !questionKey) {
    return { error: 'That submission was incomplete.' };
  }

  const { session, error } = await saveAnswer(user.id, sessionId, questionKey, value);
  if (error) return { error };

  // Questions are recomputed server-side; if none are left, finish and show the
  // assessment. An emergency result short-circuits to the urgent page instead.
  if (!session?.nextQuestion) {
    const done = await completeConsultation(user.id, sessionId);
    if (done.session?.status === 'escalated') {
      redirect(`/app/consult/${sessionId}/urgent`);
    }
    redirect(`/app/consult/${sessionId}/result`);
  }

  redirect(`/app/consult/${sessionId}`);
}
