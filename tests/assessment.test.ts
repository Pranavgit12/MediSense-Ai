import { describe, expect, it } from 'vitest';

import { buildAssessment, detectSymptomsFromText } from '../src/medical/assessment';
import { evaluateTriage } from '../src/medical/triage';

describe('detectSymptomsFromText', () => {
  it('finds a symptom named in the user own words', () => {
    expect(detectSymptomsFromText('I have a bad headache and I feel dizzy')).toEqual(
      expect.arrayContaining(['headache']),
    );
  });

  it('returns nothing rather than guessing when no symptom is named', () => {
    expect(detectSymptomsFromText('I feel a bit off today')).toEqual([]);
  });

  it('does not treat a negation as a present symptom', () => {
    expect(detectSymptomsFromText('I do not have a headache or any dizziness')).not.toContain(
      'headache',
    );
  });

  it('does not let a negation carry across a contrast clause', () => {
    expect(detectSymptomsFromText('No headache, but I do have a cough.')).not.toContain('headache');
    expect(detectSymptomsFromText('No headache, but I do have a cough.')).toContain('cough');
  });
});

describe('buildAssessment', () => {
  const base = {
    complaint: 'I have had a headache for two days',
    present: ['headache'],
    answers: [
      { questionId: 'q_duration', questionKey: 'duration', value: 'two days' },
      { questionId: 'q_severity', questionKey: 'severity', value: 6 },
      { questionId: 'q_takes_medication', questionKey: 'takes_medication', value: 'no' },
    ],
  };

  it('never asserts a condition as a finding', () => {
    const a = buildAssessment(base);
    const all = [a.summary, a.why, ...a.possibleExplanations].join(' ').toLowerCase();
    for (const banned of [
      'you have a stroke',
      'you have anaemia',
      'you have anemia',
      'this is a ',
      'you are suffering from',
      'you are diagnosed with',
    ]) {
      expect(all, `diagnosis-like phrasing: ${banned}`).not.toContain(banned);
    }
  });

  it('frames possibilities as things a clinician would consider', () => {
    const a = buildAssessment(base);
    for (const line of a.possibleExplanations) {
      expect(
        /consider|worth considering|may be relevant|narrow/.test(line),
        `unhedged possibility: ${line}`,
      ).toBe(true);
    }
  });

  it('always carries a disclaimer and a questions list', () => {
    const a = buildAssessment(base);
    expect(a.disclaimer.length).toBeGreaterThan(20);
    expect(a.questionsForDoctor.length).toBeGreaterThan(0);
  });

  it('always offers at least one safety-net warning sign', () => {
    const a = buildAssessment({ ...base, present: [] });
    expect(a.warningSigns.length).toBeGreaterThan(0);
  });

  it('is deterministic for identical input', () => {
    expect(buildAssessment(base)).toEqual(buildAssessment(base));
  });

  it('records what it could not establish instead of guessing', () => {
    const a = buildAssessment({
      ...base,
      answers: [],
      present: [],
    });
    expect(a.missingInformation.length).toBeGreaterThan(0);
    expect(a.insufficientInformation).toBe(true);
  });

  it('suppresses the narrative entirely for an emergency', () => {
    const a = buildAssessment({
      ...base,
      present: ['chest_pain'],
      triage: evaluateTriage({ present: ['chest_pain'], completed: true }),
    });
    expect(a.possibleExplanations).toEqual([]);
    expect(a.questionsForDoctor).toEqual([]);
    expect(a.summary).toMatch(/emergency/i);
  });

  it('escalates advice when the user says it is getting worse', () => {
    const steady = buildAssessment({
      ...base,
      answers: [...base.answers, { questionId: 'q_t', questionKey: 'trajectory', value: 'same' }],
    });
    const worsening = buildAssessment({
      ...base,
      answers: [...base.answers, { questionId: 'q_t', questionKey: 'trajectory', value: 'worse' }],
    });
    expect(worsening.whatToDoNext.length).toBeGreaterThan(steady.whatToDoNext.length);
  });
});
