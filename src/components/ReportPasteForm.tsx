'use client';

import { useActionState } from 'react';

import { analyzeReportAction, type ReportFormState } from '@/app/actions/report';
import { FormError, SubmitButton, inputClass } from '@/components/ui';

const initial: ReportFormState = { error: null, text: '' };

export function ReportPasteForm({ example }: { example: string }) {
  const [state, action, pending] = useActionState(analyzeReportAction, initial);

  return (
    <form action={action} className="space-y-5">
      <FormError error={state.error} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="text" className="text-sm font-medium text-ink-800">
          Paste your report text
        </label>
        <p className="text-xs leading-relaxed text-ink-500">
          Open the report as text, select all of it, and paste it here. Include the reference
          ranges if they are on the report, because we compare against those.
        </p>
        <textarea
          id="text"
          name="text"
          required
          rows={14}
          defaultValue={state.text}
          spellCheck={false}
          placeholder={'Haemoglobin\t12.1 g/dL\t13.0 - 17.0\nWhite cell count\t11.4 x10^9/L\t4.0 - 11.0'}
          className={`${inputClass} font-mono text-[13px] leading-relaxed`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            name="dayFirstDates"
            className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
          />
          My dates are day/month/year
        </label>
        <button
          type="button"
          onClick={() => {
            const el = document.getElementById('text') as HTMLTextAreaElement | null;
            if (el) {
              el.value = example;
              el.focus();
            }
          }}
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          Use the example report
        </button>
      </div>

      <SubmitButton pending={pending}>Explain this report</SubmitButton>
    </form>
  );
}
