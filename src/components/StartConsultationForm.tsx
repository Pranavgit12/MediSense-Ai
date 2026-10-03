'use client';

import { useActionState, useState } from 'react';

import { startConsultationAction, type StartConsultationState } from '@/app/actions/consult';
import { Field, FormError, SubmitButton, inputClass } from '@/components/ui';
import { ASKABLE_SYMPTOMS } from '@/data/symptom-catalog';

const initial: StartConsultationState = { error: null, complaint: '' };
const COMMON_SYMPTOM_KEYS = [
  'headache',
  'high_fever',
  'cough',
  'breathlessness',
  'chest_pain',
  'belly_pain',
  'nausea',
  'fatigue',
  'dizziness',
  'skin_rash',
  'back_pain',
  'joint_pain',
];
const symptomByKey = new Map(ASKABLE_SYMPTOMS.map((symptom) => [symptom.key, symptom]));
const commonSymptoms = COMMON_SYMPTOM_KEYS.flatMap((key) => {
  const symptom = symptomByKey.get(key);
  return symptom ? [symptom] : [];
});

export function StartConsultationForm() {
  const [state, action, pending] = useActionState(startConsultationAction, initial);
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [symptomSearch, setSymptomSearch] = useState('');

  const query = symptomSearch.trim().toLocaleLowerCase();
  const matchingSymptoms = query
    ? ASKABLE_SYMPTOMS.filter((symptom) => symptom.label.toLocaleLowerCase().includes(query)).slice(0, 12)
    : [];
  const displayedSymptoms = [
    ...commonSymptoms,
    ...matchingSymptoms.filter((symptom) => !COMMON_SYMPTOM_KEYS.includes(symptom.key)),
  ];
  const displayedKeys = new Set(displayedSymptoms.map((symptom) => symptom.key));

  function toggleSymptom(key: string) {
    setSelectedSymptoms((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  }

  return (
    <form action={action} className="space-y-5">
      <FormError error={state.error} />

      <fieldset>
        <legend className="text-sm font-medium text-ink-900">
          Which symptoms are you experiencing?
        </legend>
        <p className="mt-1 text-xs leading-relaxed text-ink-500">
          Choose any that apply. These are symptoms, not diagnoses.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {displayedSymptoms.map((symptom) => (
            <label
              key={symptom.key}
              className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition ${
                selectedSymptoms.includes(symptom.key)
                  ? 'border-brand-600 bg-brand-50 text-ink-900'
                  : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300'
              }`}
            >
              <input
                type="checkbox"
                name="symptoms"
                value={symptom.key}
                checked={selectedSymptoms.includes(symptom.key)}
                onChange={() => toggleSymptom(symptom.key)}
                className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
              />
              {symptom.label}
            </label>
          ))}
        </div>
        {selectedSymptoms.filter((key) => !displayedKeys.has(key)).map((key) => (
          <input key={key} type="hidden" name="symptoms" value={key} />
        ))}
        <label htmlFor="symptomSearch" className="mt-4 block text-xs font-medium text-ink-700">
          Find another symptom
        </label>
        <input
          id="symptomSearch"
          type="search"
          value={symptomSearch}
          onChange={(event) => setSymptomSearch(event.target.value)}
          className={`${inputClass} mt-1`}
          placeholder="Search symptoms"
        />
        {query && matchingSymptoms.length === 0 ? (
          <p className="mt-2 text-xs text-ink-500">No matching symptoms. You can describe it below.</p>
        ) : null}
      </fieldset>

      <Field
        label="Anything else you would like to describe?"
        htmlFor="complaint"
        hint="Optional. For example: The headache started two days ago and is worse on the right side."
      >
        <textarea
          id="complaint"
          name="complaint"
          rows={4}
          defaultValue={state.complaint}
          className={inputClass}
        />
      </Field>

      <Field
        label="Your age"
        htmlFor="age"
        hint="Optional, but some warning signs are treated more carefully in younger and older patients."
      >
        <input
          id="age"
          name="age"
          type="number"
          min={0}
          max={130}
          inputMode="numeric"
          className={`${inputClass} max-w-32`}
        />
      </Field>

      <Field
        label="Your sex"
        htmlFor="sex"
        hint="Optional. Used only to check whether a treatment is safe for you, and to decide which questions are relevant."
      >
        <select id="sex" name="sex" className={`${inputClass} max-w-64`} defaultValue="">
          <option value="">Prefer not to say</option>
          <option value="female">Female</option>
          <option value="male">Male</option>
          <option value="other">Another description</option>
        </select>
      </Field>

      <SubmitButton pending={pending}>Continue to questions</SubmitButton>
    </form>
  );
}
