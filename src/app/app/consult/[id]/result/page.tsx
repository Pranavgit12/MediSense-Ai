import Link from 'next/link';
import { notFound } from 'next/navigation';

import { TRIAGE_PLAIN_LANGUAGE } from '@/medical/triage';
import { getCurrentUser } from '@/lib/local-user';
import { getConsultation } from '@/server/consultation-store';
import { Card, Disclaimer, SafetyNoticeList, levelStyle } from '@/components/ui';

export const metadata = { title: 'Your summary · MediSense' };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold tracking-tight text-ink-900">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default async function ConsultResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();

  const session = await getConsultation(user.id, id);
  if (!session) notFound();

  if (session.triage.emergency) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <SafetyNoticeList
          level="emergency"
          title="Get help now"
          notices={session.triage.notices}
        />
        <Link
          href={`/app/consult/${id}/urgent`}
          className="mt-6 inline-flex items-center rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white"
        >
          What to do next
        </Link>
      </div>
    );
  }

  // Ahead of the "not finished" branch below. A red flag stops the survey while
  // the status is still `collecting` and no assessment exists, so without this
  // check a halted consultation would offer to "continue the questions" — the
  // exact opposite of what it should do.
  if (session.halt) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <SafetyNoticeList
          level={session.halt.level}
          title={session.halt.title}
          notices={[{ id: session.halt.ruleId, title: session.halt.title, body: session.halt.body }]}
        />
        <Card className="mt-6 border-2 p-6">
          <h2 className="text-base font-semibold text-ink-900">No self-treatment advice</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-700">
            While this needs medical assessment we will not suggest any medicine or remedy, including
            for the parts that look minor. Treating a symptom here can delay the thing that actually
            helps.
          </p>
        </Card>
        <Link
          href={`/app/consult/${id}/urgent`}
          className="mt-6 inline-flex items-center rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white"
        >
          What to do next
        </Link>
      </div>
    );
  }

  if (session.status === 'collecting' || !session.assessment) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <Card className="p-6">
          <h1 className="text-lg font-semibold text-ink-900">This check is not finished</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            There are still questions to answer before a summary can be written.
          </p>
          <Link
            href={`/app/consult/${id}`}
            className="mt-5 inline-flex items-center rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white"
          >
            Continue the questions
          </Link>
        </Card>
      </div>
    );
  }

  const a = session.assessment;
  const style = levelStyle(session.triage.level);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <Link href="/app" className="text-sm font-medium text-brand-700 hover:underline">
        &larr; Back to dashboard
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink-900">Your summary</h1>
      <p className="mt-1.5 text-sm text-ink-500">
        Written from what you described and answered. Show this to your clinician.
      </p>

      {/* Urgency first, always. */}
      <Card className={`mt-6 border-2 p-6 ${style.box}`} role="status">
        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${style.badge}`}>
          {style.label}
        </span>
        <p className="mt-3 text-base font-semibold leading-relaxed text-ink-900">
          {TRIAGE_PLAIN_LANGUAGE[session.triage.action]}
        </p>
      </Card>

      {session.triage.notices.length > 0 ? (
        <div className="mt-6">
          <SafetyNoticeList
            level={session.triage.level}
            title="Why this was flagged"
            notices={session.triage.notices}
          />
        </div>
      ) : null}

      <Card className="mt-6 p-6">
        <h2 className="text-base font-semibold text-ink-900">In summary</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-700">{a.summary}</p>
        <p className="mt-3 border-l-2 border-ink-200 pl-3 text-sm italic leading-relaxed text-ink-500">
          You described: &ldquo;{session.initialComplaint}&rdquo;
        </p>
      </Card>

      {a.structured ? (
        <Card className="mt-6 p-6">
          <h2 className="text-base font-semibold text-ink-900">Your symptom summary</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            {a.structured.mainConcern ? (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                  Main concern
                </dt>
                <dd className="mt-1 text-sm text-ink-900">{a.structured.mainConcern}</dd>
              </div>
            ) : null}
            {a.structured.duration ? (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                  How long
                </dt>
                <dd className="mt-1 text-sm text-ink-900">{a.structured.duration}</dd>
              </div>
            ) : null}
            {a.structured.severityNow !== null ? (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                  Severity now (0-10)
                </dt>
                <dd className="mt-1 text-sm text-ink-900">{a.structured.severityNow}</dd>
              </div>
            ) : null}
            {a.structured.trajectory && a.structured.trajectory !== 'unclear' ? (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                  Trajectory
                </dt>
                <dd className="mt-1 text-sm text-ink-900">{a.structured.trajectory}</dd>
              </div>
            ) : null}
          </dl>
          {a.structured.answers.length > 0 ? (
            <>
              <h3 className="mt-5 text-sm font-semibold text-ink-900">What you answered</h3>
              <ul className="mt-2 space-y-2">
                {a.structured.answers.map((item, i) => (
                  <li key={i} className="rounded-xl border border-ink-200 bg-sand-50 p-3">
                    <p className="text-xs font-medium text-ink-600">{item.question}</p>
                    <p className="mt-1 text-sm text-ink-900">{item.answer}</p>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Card>
      ) : null}

      {a.insufficientInformation ? (
        <Card className="mt-6 border-amber-300 bg-amber-50 p-6">
          <h2 className="text-base font-semibold text-ink-900">
            There is not enough here to narrow this down
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-700">
            Nothing in your answers pointed to a specific symptom pattern, so this summary stays
            general on purpose. Being clear about that is more useful than guessing.
          </p>
        </Card>
      ) : null}

      <Section title="What a clinician would usually consider">
        <ul className="space-y-3">
          {a.possibleExplanations.map((p) => (
            <Card as="li" key={p} className="p-5">
              <p className="text-sm leading-relaxed text-ink-800">{p}</p>
            </Card>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-ink-500">
          These are possibilities a clinician would consider, not findings about you. This is not a
          diagnosis.
        </p>
      </Section>

      <Section title="What to do next">
        <ol className="space-y-3">
          {a.whatToDoNext.map((s, i) => (
            <Card as="li" key={s} className="flex gap-3 p-5">
              <span
                aria-hidden
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white"
              >
                {i + 1}
              </span>
              <p className="text-sm leading-relaxed text-ink-800">{s}</p>
            </Card>
          ))}
        </ol>
      </Section>

      <Section title="Over-the-counter options">
        {session.advice.suppressed ? (
          <Card className="border-amber-300 bg-amber-50 p-5">
            <p className="text-sm leading-relaxed text-ink-700">
              {session.advice.suppressedReason}
            </p>
          </Card>
        ) : session.advice.suggestions.length > 0 ? (
          <>
            <p className="mb-3 text-sm leading-relaxed text-ink-600">
              These are categories of product, not named medicines, and no doses. A pharmacist chooses
              the right one once they know your allergies, your other medicines and your health.
            </p>
            <ul className="space-y-3">
              {session.advice.suggestions.map((s) => (
                <Card as="li" key={s.category} className="p-5">
                  <p className="text-sm font-semibold text-ink-900">{s.label}</p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-700">{s.because}</p>
                  {s.neverFor.length > 0 ? (
                    <div className="mt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                        Do not use for
                      </p>
                      <ul className="mt-1 space-y-1">
                        {s.neverFor.map((n) => (
                          <li key={n} className="text-sm leading-relaxed text-ink-700">
                            &middot; {n}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {s.askPharmacist.length > 0 ? (
                    <div className="mt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                        Mention when you speak to the pharmacist
                      </p>
                      <ul className="mt-1 space-y-1">
                        {s.askPharmacist.map((n) => (
                          <li key={n} className="text-sm leading-relaxed text-ink-700">
                            &middot; {n}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </Card>
              ))}
            </ul>
          </>
        ) : (
          <Card className="p-5">
            <p className="text-sm leading-relaxed text-ink-700">
              Nothing here suggests treating this yourself. That is a deliberate answer, not a gap:
              some complaints are better assessed than managed at home.
            </p>
          </Card>
        )}
        <ul className="mt-4 space-y-2">
          {session.advice.generalAdvice.map((g) => (
            <li key={g} className="text-sm leading-relaxed text-ink-600">
              &middot; {g}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-ink-500">
          This symptom check cannot safely choose a medicine or dose for you. Ask a pharmacist or
          clinician before starting anything, follow package directions, and never use someone
          else&apos;s prescription or start antibiotics without a clinician.
        </p>
      </Section>

      <Section title="Warning signs to watch for">
        <Card className="p-5">
          <ul className="space-y-2.5">
            {a.warningSigns.map((w) => (
              <li key={w} className="flex gap-2.5 text-sm leading-relaxed text-ink-700">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                {w}
              </li>
            ))}
          </ul>
        </Card>
      </Section>

      {a.missingInformation.length > 0 ? (
        <Section title="What we could not establish">
          <Card className="p-5">
            <p className="mb-3 text-sm leading-relaxed text-ink-600">
              Saying what is missing matters more than sounding certain.
            </p>
            <ul className="space-y-2">
              {a.missingInformation.map((m) => (
                <li key={m} className="text-sm leading-relaxed text-ink-700">
                  &middot; {m}
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      ) : null}

      <Section title="Ask your doctor these">
        <ul className="space-y-3">
          {a.questionsForDoctor.map((q) => (
            <Card as="li" key={q} className="p-5">
              <p className="text-sm leading-relaxed text-ink-800">{q}</p>
            </Card>
          ))}
        </ul>
      </Section>

      <Section title="What we screened for">
        <Card className="p-5">
          <p className="mb-3 text-sm leading-relaxed text-ink-600">
            These warning signs were checked as part of your questions. Answering no is a screening
            answer, not proof that a problem is not there.
          </p>
          <ul className="space-y-2">
            {a.redFlagScreen.map((r) => (
              <li key={r} className="text-sm leading-relaxed text-ink-700">
                &middot; {r}
              </li>
            ))}
          </ul>
        </Card>
      </Section>

      <div className="mt-8 space-y-4">
        <Disclaimer>{a.disclaimer}</Disclaimer>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/app/consult"
            className="inline-flex items-center rounded-xl border border-ink-300 bg-white px-5 py-2.5 text-sm font-semibold text-ink-800 transition hover:bg-sand-100"
          >
            Start another check
          </Link>
          <Link
            href="/app"
            className="inline-flex items-center rounded-xl border border-ink-300 bg-white px-5 py-2.5 text-sm font-semibold text-ink-800 transition hover:bg-sand-100"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
