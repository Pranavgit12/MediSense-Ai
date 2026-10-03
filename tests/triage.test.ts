import { describe, expect, it } from 'vitest';

import { TRIAGE_RULE_SET_VERSION, escalate, evaluateTriage } from '../src/medical/triage';

describe('evaluateTriage', () => {
  it('routes a single clear emergency to emergency services', () => {
    const result = evaluateTriage({ present: ['chest_pain'], completed: true });
    expect(result.emergency).toBe(true);
    expect(result.level).toBe('emergency');
    expect(result.action).toBe('call_emergency_services');
  });

  it('is deterministic: the same input always gives the same result', () => {
    const input = { present: ['high_fever', 'red_spots_over_body'], completed: true };
    expect(evaluateTriage(input)).toEqual(evaluateTriage(input));
  });

  it('fires a combination rule that no single symptom would trigger', () => {
    // Neither stiff neck nor high fever is an emergency on its own.
    expect(evaluateTriage({ present: ['stiff_neck'], completed: true }).level).not.toBe('emergency');
    expect(evaluateTriage({ present: ['high_fever'], completed: true }).level).not.toBe('emergency');

    const both = evaluateTriage({ present: ['stiff_neck', 'high_fever'], completed: true });
    expect(both.level).toBe('emergency');
    expect(both.evaluatedRuleIds).toContain('meningitis-pattern');
  });

  it('records the rule set version for audit', () => {
    expect(evaluateTriage({ present: [], completed: true }).ruleSetVersion).toBe(
      TRIAGE_RULE_SET_VERSION,
    );
  });

  it('does not claim a clean result while the questionnaire is unfinished', () => {
    const result = evaluateTriage({ present: [], completed: false });
    expect(result.missingInformation.length).toBeGreaterThan(0);
  });

  it('never lets a mild finding downgrade a serious one', () => {
    const severe = evaluateTriage({ present: ['breathlessness'], completed: true });
    const mild = evaluateTriage({ present: ['dizziness'], completed: true });
    expect(escalate(mild, severe).level).toBe(severe.level);
    expect(escalate(severe, mild).level).toBe(severe.level);
  });

  it('suppresses the narrative on every emergency finding', () => {
    const result = evaluateTriage({ present: ['chest_pain'], completed: true });
    expect(result.notices.length).toBeGreaterThan(0);
    for (const notice of result.notices) {
      expect(notice.suppressNarrative).toBe(true);
    }
  });

  it('suppresses the narrative when only a combination is an emergency', () => {
    // breathlessness on its own is "urgent", not an emergency, but together with
    // chest pain it is. The combination notice must still suppress the narrative.
    const result = evaluateTriage({ present: ['chest_pain', 'breathlessness'], completed: true });
    expect(result.level).toBe('emergency');
    const combination = result.notices.find((n) => n.ruleId === 'chest-pain-breathless');
    expect(combination?.suppressNarrative).toBe(true);
  });

  it('gives a non-emergency result for a mild, non-specific presentation', () => {
    const result = evaluateTriage({ present: ['dizziness'], completed: true });
    expect(result.emergency).toBe(false);
  });
});
