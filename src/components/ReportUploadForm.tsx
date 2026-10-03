'use client';

import { useActionState, useState } from 'react';

import { uploadReportAction, type ReportFormState } from '@/app/actions/report';
import { FormError, SubmitButton, inputClass } from '@/components/ui';

const initial: ReportFormState = { error: null, text: '' };

const ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

export function ReportUploadForm() {
  const [state, action, pending] = useActionState(uploadReportAction, initial);
  const [name, setName] = useState<string | null>(null);

  return (
    <form action={action} className="space-y-5">
      <FormError error={state.error} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="file" className="text-sm font-medium text-ink-800">
          Upload the report
        </label>
        <p className="text-xs leading-relaxed text-ink-500">
          A PDF straight from your clinic is read from its own text, which is exact. A photo is read
          by optical character recognition, which can misread a digit &mdash; you will be told when
          that happens, and the numbers are worth checking against your paper copy.
        </p>
        <input
          id="file"
          name="file"
          type="file"
          accept={ACCEPT}
          required
          onChange={(event) => setName(event.currentTarget.files?.[0]?.name ?? null)}
          className={`${inputClass} file:mr-3 file:rounded-lg file:border-0 file:bg-ink-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink-800`}
        />
        {name ? <p className="text-xs text-ink-500">Selected: {name}</p> : null}
      </div>

      <label className="flex items-center gap-2 text-sm text-ink-700">
        <input
          type="checkbox"
          name="dayFirstDates"
          className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
        />
        My dates are day/month/year
      </label>

      <SubmitButton pending={pending}>Explain this report</SubmitButton>
    </form>
  );
}
