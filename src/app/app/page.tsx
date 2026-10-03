import Link from 'next/link';

import { Card, EmptyState, SectionHeading, StatusBadge } from '@/components/ui';
import { getCurrentUser } from '@/lib/local-user';
import { listConsultations } from '@/server/consultation-store';
import { listReportsForUser } from '@/server/report-store';
import { levelStyle } from '@/components/ui';

const CHOICES = [
  {
    href: '/app/report',
    title: 'Explain my test report',
    body: 'Paste the text from a lab report and get a plain-English summary of every result, judged against the range printed on your own report.',
    cta: 'Paste a report',
  },
  {
    href: '/app/consult',
    title: 'Check a symptom',
    body: 'Describe what is wrong in your own words, answer a short set of questions, and get a summary written the way a doctor would summarise it.',
    cta: 'Start a check',
  },
];

function formatDate(d: Date | string | null): string {
  if (!d) return 'No date on report';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return 'No date on report';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const [reports, consultations] = await Promise.all([
    listReportsForUser(user.id),
    listConsultations(user.id, 5),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <SectionHeading
        eyebrow="Dashboard"
        title="Your dashboard"
        lede="Two things you can do. Pick whichever fits today."
      />

      <div className="mt-8 grid gap-5 md:grid-cols-2">
        {CHOICES.map((c) => (
          <Card key={c.href} as="article" className="flex flex-col p-7">
            <h2 className="text-lg font-semibold tracking-tight text-ink-900">{c.title}</h2>
            <p className="mt-2.5 flex-1 text-sm leading-relaxed text-ink-600">{c.body}</p>
            <Link
              href={c.href}
              className="mt-6 inline-flex items-center justify-center rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              {c.cta}
            </Link>
          </Card>
        ))}
      </div>

      <div className="mt-14 grid gap-10 lg:grid-cols-2">
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-semibold text-ink-900">Your reports</h2>
            <Link href="/app/report" className="text-sm font-medium text-brand-700 hover:underline">
              New report
            </Link>
          </div>
          <div className="mt-4">
            {reports.length === 0 ? (
              <EmptyState
                title="No reports yet"
                body="Paste the text of a lab report and it will appear here with a summary you can come back to."
              />
            ) : (
              <ul className="space-y-3">
                {reports.map((r) => (
                  <Card as="li" key={r.id} className="p-4">
                    <Link href={`/app/report/${r.id}`} className="block">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink-900">{r.title}</p>
                          <p className="mt-0.5 text-xs text-ink-500">
                            {formatDate(r.reportDate)} &middot; {r.abnormalCount} outside range
                          </p>
                        </div>
                        <StatusBadge status={r.overallStatus} />
                      </div>
                    </Link>
                  </Card>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-semibold text-ink-900">Your symptom checks</h2>
            <Link href="/app/consult" className="text-sm font-medium text-brand-700 hover:underline">
              New check
            </Link>
          </div>
          <div className="mt-4">
            {consultations.length === 0 ? (
              <EmptyState
                title="No symptom checks yet"
                body="Describe how you feel and answer a few questions to get a written summary and advice on how soon to be seen."
              />
            ) : (
              <ul className="space-y-3">
                {consultations.map((c) => {
                  const style = levelStyle(c.triageLevel);
                  const href =
                    c.status === 'collecting'
                      ? `/app/consult/${c.id}`
                      : `/app/consult/${c.id}/result`;
                  return (
                    <Card as="li" key={c.id} className="p-4">
                      <Link href={href} className="block">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-ink-900">
                              {c.complaint}
                            </p>
                            <p className="mt-0.5 text-xs text-ink-500">
                              {formatDate(c.createdAt)} &middot;{' '}
                              {c.status === 'collecting' ? 'Not finished' : 'Complete'}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${style.badge}`}
                          >
                            {style.label}
                          </span>
                        </div>
                      </Link>
                    </Card>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
