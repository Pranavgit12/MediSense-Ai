import Link from 'next/link';

import { ReportPasteForm } from '@/components/ReportPasteForm';
import { ReportUploadForm } from '@/components/ReportUploadForm';
import { Card } from '@/components/ui';
import { exampleReportText } from '@/lib/example-report';

export const metadata = { title: 'Explain a report · MediSense' };

export default function NewReportPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Explain my test report</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-600">
        Upload a PDF or a photo, or paste the text. Every value is read from what you give us, and
        each one is compared against the reference range printed on your own report.
      </p>

      <div className="mt-8 space-y-6">
        <Card className="p-6">
          <h2 className="text-base font-semibold text-ink-900">Upload a file</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
            PDF, JPG or PNG, up to 10&nbsp;MB. A PDF that contains real text is read exactly. A
            photo or a scan is read by optical character recognition, which is less reliable with
            digits &mdash; you will be told when that is how it was read.
          </p>
          <div className="mt-5">
            <ReportUploadForm />
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-base font-semibold text-ink-900">Or paste the text</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
            The most reliable option, and the only one that works for a report your clinic will not
            send as a file. Most clinics and patient apps can give you the text of a report.
          </p>
          <div className="mt-5">
            <ReportPasteForm example={exampleReportText()} />
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-sm font-semibold text-ink-900">If a photo does not read well</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            Photography is the least reliable way to get numbers out of a report. Lay the paper flat,
            fill the frame, avoid shadows across the page, and make sure the text is sharp rather
            than merely large. A single misread digit can turn a result that is in range into one
            that is not, which is why the results page always tells you how the text was obtained.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ink-600">
            If you are unsure of a number,{' '}
            <Link href="/app/report" className="font-medium text-brand-700 hover:underline">
              paste the text instead
            </Link>{' '}
            or check the value against your paper report. Nothing here should be acted on without
            checking it.
          </p>
        </Card>
      </div>
    </div>
  );
}
