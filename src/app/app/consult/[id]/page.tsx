import Link from 'next/link';
import { notFound } from 'next/navigation';

import { QuestionForm } from '@/components/QuestionForm';
import { Card, SafetyNoticeList } from '@/components/ui';
import { TRIAGE_PLAIN_LANGUAGE } from '@/medical/triage';
import { getCurrentUser } from '@/lib/local-user';
import { getConsultation } from '@/server/consultation-store';

export const metadata = { title: 'Symptom questions · MediSense' };

export default async function ConsultQuestionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();

  const session = await getConsultation(user.id, id);
  if (!session) notFound();

  // An emergency finding stops the questionnaire. Asking more questions after a
  // red flag would delay the advice the user actually needs.
  if (session.triage.emergency) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <SafetyNoticeList
          level="emergency"
          title="Stop and get help now"
          notices={session.triage.notices}
        />
        <div className="mt-6">
          <Link
            href={`/app/consult/${id}/urgent`}
            className="inline-flex items-center rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white"
          >
            See what to do next
          </Link>
        </div>
      </div>
    );
  }

  const question = session.nextQuestion;

  // A red flag found by the adaptive engine stops the questionnaire here, before
  // the question is rendered. This sits ahead of the `!question` branch on
  // purpose: a halt and "nothing left to ask" both leave `nextQuestion` null, but
  // only one of them means stop and get help.
  if (session.halt) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <SafetyNoticeList
          level={session.halt.level}
          title={session.halt.title}
          notices={[{ id: session.halt.ruleId, title: session.halt.title, body: session.halt.body }]}
        />
        <p className="mt-4 text-sm leading-relaxed text-ink-600">
          We have stopped asking questions. Nothing here can replace being assessed
          in person, and we will not suggest any treatment while this is unresolved.
        </p>
        <div className="mt-6">
          <Link
            href={`/app/consult/${id}/urgent`}
            className="inline-flex items-center rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white"
          >
            See what to do next
          </Link>
        </div>
      </div>
    );
  }

  if (!question) {
    // Nothing outstanding, but status is still "collecting" (for example after a
    // back-navigation). Send them to the finished result.
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <Link href={`/app/consult/${id}/result`} className="text-sm font-semibold text-brand-700 hover:underline">
          View your summary
        </Link>
      </div>
    );
  }

  const total = session.totalQuestions;

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <Link href="/app" className="text-sm font-medium text-brand-700 hover:underline">
        &larr; Back to dashboard
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink-900">
        A few questions
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-600">
        {session.answeredCount === 0
          ? `These questions are selected for your concern${session.symptomSetNames.length ? ` (${session.symptomSetNames.join(', ')})` : ''} and include checks for warning signs. Please answer as accurately as you can.`
          : 'Keep going, we are nearly there.'}
      </p>

      <Card className="mt-6 p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
          Question {session.answeredCount + 1}
          {total > 0 ? ` of about ${total}` : ''}
        </p>
        <div
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-100"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={session.answeredCount}
          aria-label="Questions answered"
        >
          <div
            className="h-full rounded-full bg-brand-500 transition-all"
            style={{
              width: `${total > 0 ? Math.round((session.answeredCount / total) * 100) : 0}%`,
            }}
          />
        </div>

        <div className="mt-6">
          <QuestionForm sessionId={session.id} question={question} />
        </div>
      </Card>

      {session.triage.notices.length > 0 ? (
        <div className="mt-6">
          <SafetyNoticeList
            level={session.triage.level}
            title={TRIAGE_PLAIN_LANGUAGE[session.triage.action]}
            notices={session.triage.notices}
          />
        </div>
      ) : null}
    </div>
  );
}
