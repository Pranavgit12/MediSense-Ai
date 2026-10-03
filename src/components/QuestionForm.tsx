'use client';

import { useActionState, useState } from 'react';

import { answerQuestionAction, type AnswerState } from '@/app/actions/consult';
import { validateAnswer } from '@/data/question-validation';
import { FormError, SubmitButton, inputClass } from '@/components/ui';
import type { SymptomQuestion } from '@/types/medical';

const initial: AnswerState = { error: null };

/** Radio-style options, used for booleans and single choices. */
function ChoiceOptions({
  question,
  selected,
  onSelect,
}: {
  question: SymptomQuestion;
  selected: string;
  onSelect: (value: string) => void;
}) {
  const selectedValues = selected.split(',').map((value) => value.trim()).filter(Boolean);

  return (
    <div className="mt-5 grid gap-2.5">
      {question.options.map((option) => {
        const isSelected = selectedValues.includes(option.value);
        return (
          <label
            key={option.value}
            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm transition ${
              isSelected
                ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-500/20'
                : 'border-ink-200 bg-white hover:border-ink-300 hover:bg-sand-50'
            }`}
          >
            <input
              type={question.kind === 'multi_choice' ? 'checkbox' : 'radio'}
              name={`opt_${question.key}`}
              value={option.value}
              checked={isSelected}
              onChange={() => {
                if (question.kind !== 'multi_choice') {
                  onSelect(option.value);
                  return;
                }
                const next = isSelected
                  ? selectedValues.filter((value) => value !== option.value)
                  : [...selectedValues, option.value];
                onSelect(next.join(','));
              }}
              className="mt-0.5 h-4 w-4 border-ink-300 text-brand-600 focus:ring-brand-500"
            />
            <span>
              <span className="block font-medium text-ink-900">{option.label}</span>
              {option.followUpPrompt ? (
                <span className="mt-0.5 block text-xs leading-relaxed text-ink-500">
                  {option.followUpPrompt}
                </span>
              ) : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}

/**
 * A question is only answerable if the form offers an input its `kind` needs.
 *
 * The bank deliberately mixes kinds: booleans and choices have `options`, but a
 * severity scale, a temperature, a duration, and two free-text questions do not.
 * Rendering radios for those would leave the user with nothing to click and
 * stall the consultation, so each kind gets its own control.
 */
function AnswerControl({
  question,
  selected,
  onSelect,
}: {
  question: SymptomQuestion;
  selected: string;
  onSelect: (value: string) => void;
}) {
  switch (question.kind) {
    case 'boolean':
    case 'single_choice':
    case 'multi_choice':
      return (
        <ChoiceOptions
          question={question}
          selected={selected}
          onSelect={onSelect}
        />
      );

    case 'scale': {
      const min = question.min ?? 0;
      const max = question.max ?? 10;
      const steps: number[] = [];
      for (let n = min; n <= max; n += 1) steps.push(n);
      return (
        <div className="mt-5">
          <div className="flex flex-wrap gap-2">
            {steps.map((n) => {
              const isSelected = selected === String(n);
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => onSelect(String(n))}
                  aria-pressed={isSelected}
                  className={`h-11 w-11 rounded-xl border text-sm font-semibold transition ${
                    isSelected
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300 hover:bg-sand-50'
                  }`}
                >
                  {n}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-xs text-ink-500">
            <span>{min} &middot; nothing at all</span>
            <span>{max} &middot; the worst imaginable</span>
          </div>
        </div>
      );
    }

    case 'number':
      return (
        <div className="mt-5 flex flex-col gap-1.5">
          <label htmlFor={`a_${question.key}`} className="text-xs font-medium text-ink-700">
            {question.unit ? `In ${question.unit}` : 'Enter a number'}
          </label>
          <input
            id={`a_${question.key}`}
            type="number"
            inputMode="decimal"
            min={question.min ?? undefined}
            max={question.max ?? undefined}
            value={selected}
            onChange={(e) => onSelect(e.target.value)}
            placeholder="Leave blank if you do not know"
            className={`${inputClass} max-w-48`}
          />
        </div>
      );

    case 'duration':
      return (
        <div className="mt-5 flex flex-col gap-1.5">
          <label htmlFor={`a_${question.key}`} className="text-xs font-medium text-ink-700">
            For example: two days, or about a month
          </label>
          <input
            id={`a_${question.key}`}
            type="text"
            value={selected}
            onChange={(e) => onSelect(e.target.value)}
            className={inputClass}
          />
        </div>
      );

    case 'text':
      return (
        <div className="mt-5 flex flex-col gap-1.5">
          <label htmlFor={`a_${question.key}`} className="text-xs font-medium text-ink-700">
            Type &quot;none&quot; if there are none
          </label>
          <textarea
            id={`a_${question.key}`}
            rows={3}
            value={selected}
            onChange={(e) => onSelect(e.target.value)}
            className={inputClass}
          />
        </div>
      );

    default:
      return (
        <div className="mt-5">
          <input
            id={`a_${question.key}`}
            type="text"
            value={selected}
            onChange={(e) => onSelect(e.target.value)}
            className={inputClass}
          />
        </div>
      );
  }
}

export function QuestionForm({
  sessionId,
  question,
}: {
  sessionId: string;
  question: SymptomQuestion;
}) {
  const [state, action, pending] = useActionState(answerQuestionAction, initial);
  const [value, setValue] = useState('');

  const problem = value === '' ? null : validateAnswer(question, value);
  const canSubmit = value.trim() !== '' && !problem;

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="questionKey" value={question.key} />
      <input type="hidden" name="value" value={value} />

      <FormError error={state.error} />

      <fieldset>
        <legend className="text-lg font-semibold leading-snug tracking-tight text-ink-900">
          {question.prompt}
        </legend>
        {question.helpText ? (
          <p className="mt-2 text-sm leading-relaxed text-ink-500">{question.helpText}</p>
        ) : null}

        <AnswerControl question={question} selected={value} onSelect={setValue} />

        {problem ? (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {problem}
          </p>
        ) : null}
      </fieldset>

      <SubmitButton pending={pending} disabled={!canSubmit}>
        Continue
      </SubmitButton>
    </form>
  );
}
