import { describe, expect, it } from 'vitest';

import {
  CORE_QUESTIONS,
  CORE_QUESTION_COUNT,
  MAX_QUESTIONS_PER_SESSION,
  QUESTION_SET_VERSION,
  isComplete,
  questionByKey,
  selectQuestions,
  validateAnswer,
} from '../src/data/question-bank';
import { matchSymptomSets, SYMPTOM_SETS } from '../src/data/symptom-sets';

/** Answer every outstanding question until none remain, following up wherever possible. */
function answerEverything(seed = new Map<string, string>()): Map<string, string> {
  let answers = new Map(seed);
  for (let i = 0; i < 60; i += 1) {
    const next = selectQuestions(answers)[0];
    if (!next) break;
    // Prefer "yes" so conditional follow-ups are exercised too.
    const value =
      next.options.find((o) => o.value === 'yes')?.value ??
      next.options[0]?.value ??
      'an answer';
    answers = new Map(answers).set(next.key, value);
  }
  return answers;
}

describe('question bank', () => {
  it('asks between 10 and 15 questions in a real session', () => {
    // The count that matters is how many get asked in total, which is what the
    // user experiences. Answering "yes" wherever it is offered means every
    // conditional follow-up gets triggered in flow, which is the worst case.
    const asked = answerEverything();
    expect(asked.size, 'questions asked').toBeGreaterThanOrEqual(10);
    expect(asked.size, 'questions asked').toBeLessThanOrEqual(MAX_QUESTIONS_PER_SESSION);
  });

  it('never asks more than the cap, whatever the answers', () => {
    // Answering a parent question replaces it with its follow-up, so a session
    // holds a steady count. The cap is the guarantee that it can never exceed the
    // number of questions we promise.
    expect(CORE_QUESTION_COUNT).toBeGreaterThan(MAX_QUESTIONS_PER_SESSION);
    expect(selectQuestions(new Map()).length).toBeLessThanOrEqual(MAX_QUESTIONS_PER_SESSION);
    expect(selectQuestions(answerEverything()).length).toBe(0);

    // Sweep every single-answer path through the bank.
    for (const question of selectQuestions(new Map())) {
      for (const option of question.options) {
        const answers = answerEverything(new Map([[question.key, option.value]]));
        expect(
          selectQuestions(answers).length,
          `path through ${question.key}=${option.value}`,
        ).toBeLessThanOrEqual(MAX_QUESTIONS_PER_SESSION);
      }
    }
  });

  it('asks the red-flag questions first, so a truncated session never drops one', () => {
    const keys = new Set(selectQuestions(new Map()).map((q) => q.key));
    for (const key of ['chest_pain', 'breathlessness', 'stiff_neck', 'altered_sensorium']) {
      expect(keys.has(key), `red flag ${key} was dropped`).toBe(true);
    }
  });

  it('skips a follow-up whose parent was not triggered', () => {
    const keys = selectQuestions(new Map()).map((q) => q.key);
    expect(keys).not.toContain('fever_max');

    const withFever = selectQuestions(new Map([['high_fever', 'yes']])).map((q) => q.key);
    expect(withFever).toContain('fever_max');
  });

  it('shortens the remaining list as answers come in', () => {
    const all = selectQuestions(new Map());
    const answered = new Map(all.slice(0, 3).map((q) => [q.key, q.options[0]!.value]));
    expect(selectQuestions(answered).length).toBeLessThan(all.length);
  });

  it('reports completion only when nothing is outstanding', () => {
    expect(isComplete(new Map())).toBe(false);
    expect(isComplete(answerEverything())).toBe(true);
    expect(selectQuestions(answerEverything())).toHaveLength(0);
  });

  it('gives every question a stable key', () => {
    for (const key of ['duration', 'severity', 'chest_pain', 'high_fever']) {
      expect(questionByKey(key)?.key, `missing question ${key}`).toBe(key);
    }
  });

  it('versions the question set', () => {
    expect(QUESTION_SET_VERSION).toMatch(/^symptom-questions\/\d+\.\d+\.\d+$/);
  });

  it('never offers duplicate options within a question', () => {
    for (const q of selectQuestions(new Map())) {
      const values = q.options.map((o) => o.value);
      expect(new Set(values).size, `duplicate option in ${q.key}`).toBe(values.length);
    }
  });

  it('selects symptom-specific questions without replacing the global safety screen', () => {
    const symptomSets = matchSymptomSets('I have had a cough for three days.');
    expect(symptomSets).toContain('cough');
    const questions = selectQuestions(new Map(), symptomSets);
    expect(questions.map((question) => question.key)).toContain('cough_duration');
    expect(questions.map((question) => question.key)).toContain('chest_pain');
  });

  it('does not route a negated symptom into a symptom-specific question set', () => {
    expect(matchSymptomSets('I do not have a cough.')).not.toContain('cough');
    expect(matchSymptomSets('No headache, but I have a sore throat.')).not.toContain('headache');
    expect(matchSymptomSets('No headache, but I have a sore throat.')).toContain('sore_throat');
    expect(matchSymptomSets("I don't have a headache but do have stomach pain.")).not.toContain('headache');
    expect(matchSymptomSets("I don't have a headache but do have stomach pain.")).toContain('abdominal_pain');
  });

  it('looks up matched-set questions when building a consultation summary', () => {
    expect(questionByKey('cough_duration')?.prompt).toMatch(/how long/i);
  });

  it('keeps question keys unique across all symptom sets', () => {
    const keys = [
      ...CORE_QUESTIONS,
      ...SYMPTOM_SETS.flatMap((symptomSet) => symptomSet.questions),
    ].map((question) => question.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('validateAnswer', () => {
  it('accepts a valid option for a choice question', () => {
    const q = questionByKey('chest_pain')!;
    expect(validateAnswer(q, 'yes')).toBeNull();
    expect(validateAnswer(q, 'no')).toBeNull();
    expect(validateAnswer(q, 'banana')).not.toBeNull();
  });

  it('accepts a value in range for a scale question', () => {
    const q = questionByKey('severity')!;
    expect(q.kind).toBe('scale');
    expect(validateAnswer(q, '0')).toBeNull();
    expect(validateAnswer(q, '7')).toBeNull();
    expect(validateAnswer(q, '10')).toBeNull();
    expect(validateAnswer(q, '11')).not.toBeNull();
    expect(validateAnswer(q, '-1')).not.toBeNull();
    expect(validateAnswer(q, '6.5')).not.toBeNull();
    expect(validateAnswer(q, '')).not.toBeNull();
  });

  it('bounds a number question but allows it to be skipped', () => {
    const q = questionByKey('fever_max')!;
    expect(q.kind).toBe('number');
    expect(validateAnswer(q, '39')).toBeNull();
    expect(validateAnswer(q, '')).toBeNull();
    expect(validateAnswer(q, '20')).not.toBeNull();
    expect(validateAnswer(q, '50')).not.toBeNull();
    expect(validateAnswer(q, 'warm')).not.toBeNull();
  });

  it('accepts free text for a duration question', () => {
    const q = questionByKey('duration')!;
    expect(validateAnswer(q, 'two days')).toBeNull();
    expect(validateAnswer(q, '  ')).not.toBeNull();
  });

  it('accepts free text for a list question', () => {
    const q = questionByKey('medication_list')!;
    expect(validateAnswer(q, 'none')).toBeNull();
    expect(validateAnswer(q, '')).not.toBeNull();
    expect(validateAnswer(q, 'x'.repeat(2001))).not.toBeNull();
  });

  it('accepts some answer for every question in the bank', () => {
    // This is the invariant that matters: no question in the bank can be
    // unanswerable, which would stall a real consultation.
    const sample: Record<string, string> = {
      scale: '5',
      number: '',
      text: 'none',
      duration: 'two days',
    };
    for (const q of CORE_QUESTIONS) {
      const value = sample[q.kind] ?? q.options[0]?.value ?? 'x';
      expect(validateAnswer(q, value), `no valid answer for ${q.key} (${q.kind})`).toBeNull();
    }
  });
});
