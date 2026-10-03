import Link from 'next/link';
import { notFound } from 'next/navigation';

import { toResultRows } from '@/medical/analyze';
import { getCurrentUser } from '@/lib/local-user';
import { getReportForUser } from '@/server/report-store';
import {
  Card,
  Disclaimer,
  EmptyState,
  ProvenanceNote,
  SafetyNoticeList,
  StatusBadge,
} from '@/components/ui';

export const metadata = { title: 'Report summary · MediSense' };

export default async function ReportResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  const { notice } = await searchParams;

  const stored = await getReportForUser(user.id, id);
  if (!stored) notFound();

  const { analysis } = stored;
  // `rows` already carries the formatted value, range, and unit for display.
  const rows = toResultRows(
    {
      header: analysis.header,
      results: analysis.results,
      unparsed: [],
      pipeline: { parser: '', terminology: '', safety: '' },
    },
    analysis.explanations,
  );
  const urgent = analysis.safetyNotices[0];
  const level = urgent?.level ?? (analysis.abnormal.length ? 'soon' : 'routine');

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <Link href="/app" className="text-sm font-medium text-brand-700 hover:underline">
        &larr; Back to dashboard
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{analysis.header.title}</h1>
          <p className="mt-1.5 text-sm text-ink-500">
            {[
              analysis.header.laboratory,
              analysis.header.reportDate,
              analysis.header.patientAgeYears !== null
                ? `Age ${analysis.header.patientAgeYears}`
                : null,
            ]
              .filter(Boolean)
              .join(' · ') || 'No laboratory or date on this report'}
          </p>
        </div>
        {analysis.abnormal.length > 0 ? (
          <span className="rounded-full bg-ink-100 px-3 py-1 text-xs font-medium text-ink-700">
            {analysis.abnormal.length} of {analysis.results.length} outside range
          </span>
        ) : null}
      </div>

      {notice ? (
        <p
          role="status"
          className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {notice}
        </p>
      ) : null}

      {/* Safety first, above everything else on the page. */}
      {urgent ? (
        <div className="mt-6">
          <SafetyNoticeList
            level={level}
            title="This result needs attention"
            notices={analysis.safetyNotices}
          />
        </div>
      ) : null}

      <Card className="mt-6 p-6">
        <h2 className="text-lg font-semibold tracking-tight text-ink-900">In plain words</h2>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-700">
          {analysis.overview.split(/\n{2,}/).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      </Card>

      <section className="mt-6">
        <h2 className="text-lg font-semibold tracking-tight text-ink-900">Every result</h2>
        <p className="mt-1.5 text-xs text-ink-500">
          Ranges are the ones printed on your report, not ones we chose.
        </p>

        {rows.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="No results could be read"
              body="The parser did not find recognisable test lines in that text. Try copying the report again, or type the results out one per line as: test name, value, unit, low, high."
            />
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <Card className="mt-4 hidden overflow-hidden md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-ink-200 bg-ink-50/60 text-xs uppercase tracking-wide text-ink-600">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">Test</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Your result</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Reference range</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {rows.map((r) => (
                    <tr key={r.id} className="align-top">
                      <th scope="row" className="px-4 py-3.5 font-medium text-ink-900">
                        {r.name}
                        {r.hasExplanation ? null : (
                          <span className="mt-0.5 block text-[11px] font-normal text-ink-400">
                            No plain-language note for this test yet
                          </span>
                        )}
                      </th>
                      <td className="px-4 py-3.5 tabular-nums text-ink-900">
                        {r.value}
                        <span className="block text-xs text-ink-500">{r.unitPhrase}</span>
                      </td>
                      <td className="px-4 py-3.5 tabular-nums text-ink-600">{r.reference}</td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            {/* Mobile cards */}
            <ul className="mt-4 space-y-3 md:hidden">
              {rows.map((r) => (
                <Card as="li" key={r.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-ink-900">{r.name}</p>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="mt-2 text-sm tabular-nums text-ink-800">
                    {r.value} <span className="text-ink-500">{r.unitPhrase}</span>
                  </p>
                  <p className="mt-0.5 text-xs tabular-nums text-ink-500">
                    Reference {r.reference}
                  </p>
                </Card>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight text-ink-900">
          What each test measures
        </h2>
        <div className="mt-4 space-y-4">
          {analysis.explanations
            .filter((e) => e.grounded)
            .map((e) => (
              <Card key={e.testName} className="p-5">
                <h3 className="text-sm font-semibold text-ink-900">{e.testName}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-700">{e.whatItMeasures}</p>
                {e.whyItMayDiffer ? (
                  <div className="mt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                      Why a result may sit outside the range
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-ink-600">{e.whyItMayDiffer}</p>
                  </div>
                ) : null}
                {e.otherRelevantInfo ? (
                  <div className="mt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                      Also worth knowing
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-ink-600">{e.otherRelevantInfo}</p>
                  </div>
                ) : null}
                <p className="mt-3">
                  <ProvenanceNote provenance={e.provenance} />
                </p>
              </Card>
            ))}
        </div>
        {analysis.explanations.every((e) => !e.grounded) ? (
          <div className="mt-4">
            <EmptyState
              title="We do not have plain-language notes for these tests yet"
              body="The numbers above are still read from your report and judged against its ranges. We would rather say nothing than guess at what a test means."
            />
          </div>
        ) : null}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight text-ink-900">
          Questions to ask your doctor
        </h2>
        <ul className="mt-4 space-y-3">
          {analysis.doctorQuestions.map((q) => (
            <Card as="li" key={q} className="p-5">
              <p className="text-sm leading-relaxed text-ink-800">{q}</p>
            </Card>
          ))}
        </ul>
      </section>

      <div className="mt-8 space-y-4">
        <Disclaimer>{analysis.disclaimer}</Disclaimer>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/app/report"
            className="inline-flex items-center rounded-xl border border-ink-300 bg-white px-5 py-2.5 text-sm font-semibold text-ink-800 transition hover:bg-sand-100"
          >
            Paste another report
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
