import Link from 'next/link';
import { notFound } from 'next/navigation';

import { TRIAGE_PLAIN_LANGUAGE } from '@/medical/triage';
import { getCurrentUser } from '@/lib/local-user';
import { getConsultation } from '@/server/consultation-store';
import { Card, SafetyNoticeList } from '@/components/ui';

export const metadata = { title: 'Get help now · MediSense', robots: { index: false } };

/**
 * The emergency page. Deliberately short, unstyled by anything decorative, and
 * states the action first. It is reached the moment a red flag is answered, and
 * it never asks a follow-up question.
 */
export default async function UrgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();

  const session = await getConsultation(user.id, id);
  if (!session) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <SafetyNoticeList
        level="emergency"
        title="Contact emergency services now"
        notices={session.triage.notices}
      />

      <Card className="mt-6 border-red-300 p-6">
        <h2 className="text-lg font-semibold text-ink-900">What to do</h2>
        <ol className="mt-3 space-y-3">
          <li className="flex gap-3 text-sm leading-relaxed text-ink-800">
            <span aria-hidden className="font-bold text-red-600">1.</span>
            Call your local emergency number now. Do not wait to see whether this settles down.
          </li>
          <li className="flex gap-3 text-sm leading-relaxed text-ink-800">
            <span aria-hidden className="font-bold text-red-600">2.</span>
            Say that you have the symptoms below and when they started. You do not need a
            diagnosis for the call to be taken seriously.
          </li>
          <li className="flex gap-3 text-sm leading-relaxed text-ink-800">
            <span aria-hidden className="font-bold text-red-600">3.</span>
            If you are alone, unlock the door and keep your phone with you.
          </li>
          <li className="flex gap-3 text-sm leading-relaxed text-ink-800">
            <span aria-hidden className="font-bold text-red-600">4.</span>
            If you become unconscious or stop breathing normally, tell the call handler immediately.
          </li>
        </ol>

        <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm leading-relaxed text-ink-700">
          {TRIAGE_PLAIN_LANGUAGE[session.triage.action]}
        </p>
      </Card>

      <Card className="mt-6 p-6">
        <h2 className="text-base font-semibold text-ink-900">What you told us</h2>
        <p className="mt-2 text-sm italic leading-relaxed text-ink-600">
          &ldquo;{session.initialComplaint}&rdquo;
        </p>
        <p className="mt-3 text-xs leading-relaxed text-ink-500">
          You can show this to the clinician who sees you. It is a record of what you reported, not a
          diagnosis.
        </p>
      </Card>

      <div className="mt-6">
        <Link
          href="/app"
          className="inline-flex items-center rounded-xl border border-ink-300 bg-white px-5 py-2.5 text-sm font-semibold text-ink-800 transition hover:bg-sand-100"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
