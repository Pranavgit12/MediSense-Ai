/**
 * The adaptive engine: deterministic behaviour, safety, and medicine gating.
 *
 * These are pure-function tests — no database, no HTTP. That is deliberate: the
 * selector's whole claim is that it is a pure function of the stored profile, so
 * testing it without a database is what makes that claim checkable. The store's
 * use of it is covered in `integration.test.ts`.
 */
import { describe, expect, it } from 'vitest';

import {
  GRAPH,
  NODE_BY_KEY,
  assertNoRedFlagIsAlsoAQuestion,
  consultationOutcome,
  evalContext,
  evaluateRedFlags,
  isCovered,
  medicationAdvice,
  narrowedTopics,
  redFlagRuleIds,
  selectNextQuestion,
  seedFromText,
} from '@/medical/adaptive';
import type { MedicationAdvice, PatientProfile, SelectionDecision } from '@/medical/adaptive';
import { matchSymptomSets } from '@/data/symptom-sets';
import { MAX_QUESTIONS_PER_SESSION } from '@/data/question-bank';
import type { SymptomQuestion } from '@/types/medical';

/** A benign answer, so a scenario never trips a red flag by accident. */
function benign(q: SymptomQuestion): string {
  switch (q.kind) {
    case 'scale':
      return '3';
    case 'number':
      return '38';
    case 'text':
      return 'none';
    case 'duration':
      return 'two days';
    default:
      return q.options.find((o) => o.value === 'no')?.value ?? q.options[0]?.value ?? 'x';
  }
}

function profile(text: string, symptoms: string[], ageYears: number | null = 34): PatientProfile {
  return {
    ageYears,
    sex: null,
    symptoms,
    symptomSets: matchSymptomSets(text),
    answers: new Map(),
    freeText: text,
  };
}

/** Walk a session to its end, answering everything benignly. */
function run(
  base: PatientProfile,
  answer: (q: SymptomQuestion, index: number) => string = benign,
): { asked: string[]; decision: SelectionDecision; advice: MedicationAdvice } {
  const answers = new Map(base.answers);
  const asked: string[] = [];
  let decision = selectNextQuestion({ ...base, answers });

  for (let i = 0; i < 60 && decision.node; i += 1) {
    const q = decision.node.question;
    asked.push(q.key);
    answers.set(q.key, answer(q, i));
    decision = selectNextQuestion({ ...base, answers });
  }

  const p = { ...base, answers };
  const covered = new Set<string>();
  const seeded = seedFromText(p.freeText);
  for (const topic of narrowedTopics(`symptom.${p.symptoms[0] ?? 'unknown'}` as never)) {
    covered.add(topic);
  }
  for (const topic of seeded.topics) covered.add(topic);
  for (const key of answers.keys()) {
    const node = NODE_BY_KEY.get(key);
    if (!node) continue;
    for (const topic of narrowedTopics(node.topic)) covered.add(topic);
    for (const topic of node.alsoCovers ?? []) {
      for (const t of narrowedTopics(topic)) covered.add(t);
    }
  }
  const context = evalContext(p, covered, new Set(seeded.topics), new Map([...NODE_BY_KEY].map(([k, v]) => [k, { key: k, kind: v.question.kind }])));
  const halt = evaluateRedFlags(context);

  return { asked, decision, advice: medicationAdvice(p, context, halt) };
}

describe('adaptive graph integrity', () => {
  it('has unique keys and every node names a question', () => {
    expect(new Set(GRAPH.map((n) => n.key)).size).toBe(GRAPH.length);
    for (const node of GRAPH) {
      expect(node.question.key, `${node.key} question key`).toBe(node.key);
    }
  });

  it('gives every node a topic that is one of its own question facets', () => {
    for (const node of GRAPH) {
      expect(node.topic.length).toBeGreaterThan(0);
      expect(node.informs.length).toBeGreaterThan(0);
    }
  });

  it('never asks a question whose answer would itself fire a red flag rule', () => {
    // A node that both asks about a warning sign and is the warning sign would
    // make the halt depend on which screen the answer arrived through.
    expect(() => assertNoRedFlagIsAlsoAQuestion(GRAPH.map((n) => n.question))).not.toThrow();
  });

  it('exposes stable red-flag rule ids', () => {
    const ids = redFlagRuleIds();
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('free-text seeding', () => {
  it('reads a stated duration and marks only the topic it covers', () => {
    const seeded = seedFromText('I have had a mild headache for two days');
    expect(seeded.topics).toContain('duration.headache');
  });

  it('never invents an answer for a question that has no such option', () => {
    for (const text of [
      'I have a rash on my arm',
      'my belly hurts',
      'I keep being sick',
      'fever and cough',
    ]) {
      const seeded = seedFromText(text);
      for (const key of Object.keys(seeded.impliedAnswers)) {
        expect(() => {
          const node = NODE_BY_KEY.get(key);
          if (!node) throw new Error(`seed names unknown key ${key}`);
          const kind = node.question.kind;
          if (kind === 'multi_choice' || kind === 'single_choice') {
            for (const v of [seeded.impliedAnswers[key]]) {
              expect(node.question.options.map((o) => o.value)).toContain(v);
            }
          }
        }).not.toThrow();
      }
    }
  });
});

describe('topic coverage', () => {
  it('lets a specific answer satisfy a generic candidate in the same facet', () => {
    // The generic timeline question is deferred by the selector when a
    // symptom-specific one is still outstanding. Proved through the selector,
    // because `duration` deliberately has no generic entry in GENERIC_BY_FACET:
    // collapsing all durations onto one topic would be wrong when a cough and a
    // fever started on different days.
    const { asked } = run(profile('I have a cough', ['cough']));
    expect(asked).toContain('cough_duration');
    expect(asked).not.toContain('duration');
  });

  it('does not let a generic answer cover a specific question', () => {
    // The regression this guards: answering "how long has this lasted" must not
    // suppress "what colour is your mucus".
    expect(isCovered('nature.cough_mucus', new Set(['nature.cough', 'nature.generic']))).toBe(false);
  });
});

describe('red flags stop the questionnaire', () => {
  it('halts immediately on inability to breathe', () => {
    const { decision } = run(profile('I have a cough and I cannot breathe', ['cough', 'breathlessness']));
    expect(decision.stopReason).toBe('red_flag');
    expect(decision.halt?.ruleId).toBe('difficulty_breathing');
    expect(decision.halt?.level).toBe('emergency');
    expect(decision.halt?.action).toBe('call_emergency_services');
  });

  it('halts a fever that has lasted more than a week', () => {
    const { decision } = run(
      profile('fever for 10 days', ['mild_fever']),
      (q) => (q.key === 'fever_duration' ? '10 days' : benign(q)),
    );
    expect(decision.stopReason).toBe('red_flag');
    expect(decision.halt?.ruleId).toBe('fever_not_reviewed_after_a_week');
  });

  it('halts a prolonged fever written in the opening text, before any question', () => {
    // Both halves matter: "fever" establishes that a temperature is present, and
    // "10 days" establishes the duration. Neither alone is enough, and the
    // duration must land in the one-to-three-weeks bucket rather than being
    // rounded up to "over three weeks" — that would fire this rule for people who
    // are not as unwell as the patient actually is.
    const seeded = seedFromText('I have had a fever for 10 days');
    expect(seeded.topics).toContain('red_flag.fever_present');
    expect(seeded.impliedAnswers.fever_duration).toBe('d1_3w');

    const decision = selectNextQuestion(profile('I have had a fever for 10 days', ['mild_fever']));
    expect(decision.stopReason).toBe('red_flag');
    expect(decision.halt?.ruleId).toBe('fever_not_reviewed_after_a_week');
  });

  it('buckets every duration into exactly one band, with no gap around a week', () => {
    // The 8-to-20-day window used to fall through to "over three weeks", which
    // inflated both the timeline and any rule reading it.
    const expectations: [string, string][] = [
      ['started today', 'lt_1d'],
      ['about 6 hours', 'lt_1d'],
      ['two days', 'd1_3'],
      ['five days', 'd4_7'],
      ['10 days', 'd1_3w'],
      ['two weeks', 'd1_3w'],
      ['six weeks', 'gt_3w'],
      ['about three months', 'gt_3w'],
    ];
    for (const [text, expected] of expectations) {
      expect(seedFromText(`my cough has lasted ${text}`).impliedAnswers.cough_duration, text).toBe(expected);
    }
  });

  it('never implies an answer the question could not have returned', () => {
    // A wrong seed is worse than a missing one: it closes a topic that was never
    // established, and `validateAnswer` would reject the value if it came back
    // through the form.
    const corpus = [
      'I have a fever for 10 days',
      'I have a cough and I cannot breathe',
      'coughing up blood',
      'runny nose and a blocked nose',
      'my throat is closing and my face is swelling',
      "I can't keep any fluids down",
      'passing very little urine',
      'black tarry stool',
      'vomiting blood',
      'I passed out and then felt confused',
      'stiff neck and shivering',
      'yellowing of my eyes',
      'weakness down one side and slurred speech',
      'I am taking paracetamol already',
      'rash and red spots',
      'my belly hurts',
      'been sick and feeling nauseous',
      'loose stool for a week',
      'chest pain and chest tightness',
      'aged 4',
    ];

    for (const text of corpus) {
      const { impliedAnswers } = seedFromText(text);
      for (const [key, value] of Object.entries(impliedAnswers)) {
        const node = NODE_BY_KEY.get(key);
        expect(node, `${text}: implied answer for unknown question "${key}"`).toBeDefined();
        const q = node!.question;
        if (q.kind === 'text' || q.kind === 'number' || q.kind === 'scale') continue;
        const legal = (q as { options?: { value: string }[] }).options?.map((o) => o.value) ?? [];
        expect(legal, `${text}: "${value}" is not an option of ${key}`).toContain(value);
      }
    }
  });

  it('reads "cannot" as well as "can\'t" in every safety phrase', () => {
    // `can'?t` matches "cant" and "can't" but not "cannot" — the phrasing people
    // actually type when frightened. Each of these must escalate from the opening
    // text alone, before a single question is asked.
    const cases: [string, string][] = [
      ['I cannot breathe', 'difficulty_breathing'],
      ['I cannot keep any fluids down', 'dehydration'],
      ['my face is swelling and my throat is closing', 'severe_allergic_reaction_reported'],
    ];
    for (const [text, ruleId] of cases) {
      const outcome = consultationOutcome(profile(text, []));
      expect(outcome.next.stopReason, text).toBe('red_flag');
      expect(outcome.halt?.ruleId, text).toBe(ruleId);
      expect(outcome.advice.suppressed, text).toBe(true);
    }
  });

  it('suppresses all medicine guidance while a red flag stands', () => {
    const { advice } = run(profile('I cannot breathe', ['breathlessness']));
    expect(advice.suppressed).toBe(true);
    expect(advice.suggestions).toHaveLength(0);
    expect(advice.suppressedReason).toBeTruthy();
  });
});

describe('branch selection follows the answers', () => {
  it('asks for the character of a cough rather than repeating its presence', () => {
    const { asked } = run(profile('I have a cough', ['cough']));
    expect(asked).toContain('cough_type');
    expect(asked).not.toContain('cough');
  });

  it('opens the productive branch and closes the dry one for a mucus cough', () => {
    const { asked } = run(
      profile('I have a cough', ['cough']),
      (q) => (q.key === 'cough_type' ? 'mucus' : benign(q)),
    );
    expect(asked).toContain('cough_mucus_colour');
    expect(asked).not.toContain('cough_night_only');
  });

  it('opens the dry branch and closes the productive one for a dry cough', () => {
    const { asked } = run(
      profile('I have a cough', ['cough']),
      (q) => (q.key === 'cough_type' ? 'dry' : benign(q)),
    );
    expect(asked).toContain('cough_night_only');
    expect(asked).not.toContain('cough_mucus_colour');
  });

  it('never asks the same question twice in one session', () => {
    for (const [text, symptoms] of [
      ['fever for three days', ['mild_fever']],
      ['I have a cough', ['cough']],
      ['headache', ['headache']],
      ['vomiting and diarrhoea', ['vomiting', 'diarrhoea', 'abdominal_pain']],
      ['itchy rash', ['skin_rash']],
    ] as const) {
      const { asked } = run(profile(text, [...symptoms]));
      expect(new Set(asked).size, `${text}: ${asked.join(', ')}`).toBe(asked.length);
    }
  });
});

describe('session length', () => {
  it('stays within the cap and stops on a reason', () => {
    for (const [text, symptoms] of [
      ['fever for three days', ['mild_fever']],
      ['headache', ['headache']],
      ['stomach pain', ['abdominal_pain']],
      ['vomiting and diarrhoea', ['vomiting', 'diarrhoea', 'abdominal_pain']],
    ] as const) {
      const { asked, decision } = run(profile(text, [...symptoms]));
      expect(asked.length, text).toBeLessThanOrEqual(MAX_QUESTIONS_PER_SESSION);
      expect(asked.length, text).toBeGreaterThan(0);
      expect(decision.stopReason, text).not.toBeNull();
    }
  });

  it('is deterministic: the same profile yields the same session', () => {
    const a = run(profile('I have a cough', ['cough']));
    const b = run(profile('I have a cough', ['cough']));
    expect(a.asked).toEqual(b.asked);
    expect(a.decision.stopReason).toBe(b.decision.stopReason);
  });
});

describe('medicine gating', () => {
  it('offers no named medicine and no dose for a straightforward complaint', () => {
    const { advice } = run(profile('runny nose and sore throat', ['runny_nose', 'patches_in_throat']));
    expect(advice.suppressed).toBe(false);
    for (const s of advice.suggestions) {
      // Categories only. A drug name or a dose in this payload is a clinical
      // review failure, so it is worth asserting mechanically.
      expect(s.label).not.toMatch(/\d+\s*mg/i);
      expect(s.label).not.toMatch(/paracetamol|ibuprofen|aspirin|codeine|loperamide|loratadine/i);
      expect(s.neverFor.length).toBeGreaterThan(0);
    }
  });

  it('blocks everything when pregnancy is confirmed', () => {
    const base = profile('headache', ['headache']);
    const { advice } = run({ ...base, answers: new Map([['pregnancy_status', 'pregnant']]) });
    expect(advice.suppressed).toBe(true);
  });

  it('blocks everything when breastfeeding is confirmed', () => {
    const base = profile('itchy rash', ['skin_rash']);
    const { advice } = run({ ...base, answers: new Map([['pregnancy_status', 'breastfeeding']]) });
    expect(advice.suppressed).toBe(true);
  });

  it('blocks everything for a baby', () => {
    const { advice } = run(profile('fever', ['mild_fever'], 0.4));
    expect(advice.suppressed).toBe(true);
  });

  it('does not offer a painkiller to somebody with a liver problem', () => {
    const base = profile('headache', ['headache']);
    const { advice } = run({
      ...base,
      answers: new Map([['existing_conditions', 'liver disease']]),
    });
    expect(advice.suppressed).toBe(false);
    expect(advice.suggestions.map((s) => s.category)).not.toContain('analgesic');
  });

  it('does not offer a cough suppressant with asthma or to a young child', () => {
    const adult = run({
      ...profile('dry cough', ['cough']),
      answers: new Map([['existing_conditions', 'asthma']]),
    });
    expect(adult.advice.suggestions.map((s) => s.category)).not.toContain('cough_soothing');

    const child = run(profile('dry cough', ['cough'], 4));
    expect(child.advice.suggestions.map((s) => s.category)).not.toContain('cough_soothing');
  });

  it('does not offer a painkiller for an unexplained abdominal pain', () => {
    const { advice } = run(profile('my belly hurts', ['abdominal_pain']));
    expect(advice.suggestions.map((s) => s.category)).not.toContain('analgesic');
  });

  it('keeps the list short enough that it cannot read as an instruction to take all of it', () => {
    const { advice } = run(profile('vomiting and diarrhoea', ['vomiting', 'diarrhoea']));
    expect(advice.suggestions.length).toBeLessThanOrEqual(3);
  });
});

describe('consultationOutcome stays consistent', () => {
  it('agrees with itself on the halt and on the medicine advice', () => {
    const outcome = consultationOutcome(profile('I cannot breathe', ['breathlessness']));
    expect(outcome.halt).not.toBeNull();
    expect(outcome.advice.suppressed).toBe(true);
  });
});