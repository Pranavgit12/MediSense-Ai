/**
 * Integration tests for the persistence layer, against a real PGlite database
 * using the real migrations.
 *
 * The unit tests stub the stores, so nothing here would have caught a question
 * kind the answer validator rejected, or a report that could not be reloaded.
 *
 * PGlite is a single-writer embedded database, so these tests must not run while
 * a dev server is using the same data directory. `tests/setup.ts` points tests
 * at `.pgdata/test`, which is separate from the dev database.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * `redirect()` signals by throwing, so the actions under test never return. A
 * sentinel carrying the target lets the tests below assert where the action sent
 * the caller, which is the only observable outcome of a successful call.
 */
class RedirectSignal extends Error {
  constructor(readonly to: string) {
    super(`redirect:${to}`);
  }
}

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new RedirectSignal(to);
  },
}));

import { getDb, closeDb } from '../src/database/client';
import { runMigrations } from '../src/database/migrate';
import { getCurrentUser } from '../src/lib/local-user';
import { startConsultationAction } from '../src/app/actions/consult';
import { decryptStringFromText, hashPassword } from '../src/utils/crypto';
import { parseLabReport } from '../src/medical/report-parser';
import { analyzeReport } from '../src/medical/analyze';
import { saveReport, getReportForUser, listReportsForUser } from '../src/server/report-store';
import {
  completeConsultation,
  createConsultation,
  getConsultation,
  listConsultations,
  saveAnswer,
} from '../src/server/consultation-store';
import { buildSyntheticCbcDataset, buildSyntheticReportText } from '../src/data/synthetic-reports';
import { MAX_QUESTIONS_PER_SESSION } from '../src/data/question-bank';
import type { SymptomQuestion } from '../src/types/medical';

/** A valid, non-escalating answer for any question kind. */
function safeAnswer(q: SymptomQuestion): string {
  switch (q.kind) {
    case 'scale':
      return '5';
    case 'number':
      return '';
    case 'text':
      return 'none';
    case 'duration':
      return 'two days';
    default:
      return q.options.find((o) => o.value === 'no')?.value ?? q.options[0]?.value ?? 'x';
  }
}

async function makeUser(email: string) {
  const db = await getDb();
  const { hash } = await hashPassword('TestingPass123');
  const now = new Date();
  return db
    .insertInto('users')
    .values({
      email,
      password_hash: hash,
      full_name: 'Integration User',
      role: 'patient',
      is_active: true,
      failed_login_count: 0,
      created_at: now,
      updated_at: now,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
}

beforeAll(async () => {
  await getDb();
  await runMigrations(await getDb());
}, 60_000);

afterAll(async () => {
  await closeDb();
});

/**
 * Every page resolves its `user_id` through this, so a failure here means no
 * feature works at all — and it has to survive a database that has never been
 * used, because that is the state a first run starts from.
 */
describe('local profile', () => {
  it('creates the profile on first use and reuses it afterwards', async () => {
    const first = await getCurrentUser();
    const second = await getCurrentUser();

    expect(first.id).toBe(second.id);
    expect(first.email).toBe('local@medisense.invalid');

    // The second read must come back to the row rather than inserting again, so
    // there is exactly one local profile in the table.
    const db = await getDb();
    const rows = await db
      .selectFrom('users')
      .select('id')
      .where((eb) => eb(eb.fn('lower', ['email']), '=', 'local@medisense.invalid'))
      .execute();
    expect(rows).toHaveLength(1);
  }, 30_000);
});

/**
 * The feature entry points themselves, called with no cookie, no session and no
 * credential of any kind.
 *
 * This is the test that fails if anyone reintroduces a sign-in requirement: every
 * mutation the UI performs goes through one of these server actions, and each one
 * resolves the local profile on its own. A guard that redirected would surface
 * here as a `RedirectSignal` pointing at `/login`, not as the resource the caller
 * asked for.
 */
describe('features work without signing in', () => {
  async function startConsultation(fields: Record<string, string | string[]>): Promise<string> {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      for (const v of Array.isArray(value) ? value : [value]) form.append(key, v);
    }
    try {
      await startConsultationAction({ error: null, complaint: '' }, form);
    } catch (error) {
      if (error instanceof RedirectSignal) return error.to;
      throw error;
    }
    throw new Error('expected the action to redirect');
  }

  it('starts a symptom check and stores it against the local profile', async () => {
    const target = await startConsultation({
      symptoms: ['headache', 'nausea'],
      complaint: 'Mild headache for two days',
      age: '34',
    });

    const id = target.split('/').pop()!;
    expect(target).toMatch(/^\/app\/consult\/[0-9a-f-]{36}$/);

    const user = await getCurrentUser();
    const session = await getConsultation(user.id, id);
    expect(session).not.toBeNull();
    expect(session!.initialComplaint).toContain('headache');
  }, 30_000);

  it('still validates the form rather than accepting anything', async () => {
    // A removed guard must not become a removed check. This returns state instead
    // of redirecting, which is how a refusal is distinguishable from success.
    const form = new FormData();
    form.append('complaint', '');
    const state = await startConsultationAction({ error: null, complaint: '' }, form);
    expect(state.error).toBeTruthy();
  }, 30_000);
});

describe('report pipeline', () => {
  it('parses, analyses, saves, and reloads a report', async () => {
    const user = await makeUser(`report-${Date.now()}@example.com`);
    const record = buildSyntheticCbcDataset(80).find((r) => r.scenario === 'low_hb')!;
    const parsed = parseLabReport(buildSyntheticReportText([record], 7)[0]!.text);
    expect(parsed.results.length).toBeGreaterThan(0);

    const { analysis } = await analyzeReport(parsed);
    const id = await saveReport({
      userId: user.id,
      report: parsed,
      summary: analysis.overview,
      explanations: analysis.explanations,
      pages: [{ pageNumber: 1, text: 'patient report page text', confidence: null }],
    });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);

    const db = await getDb();
    const savedPage = await db
      .selectFrom('report_pages')
      .select('ocr_text')
      .where('report_id', '=', id)
      .executeTakeFirstOrThrow();
    expect(savedPage.ocr_text).not.toContain('patient report page text');
    expect(decryptStringFromText(savedPage.ocr_text)).toBe('patient report page text');

    const reloaded = await getReportForUser(user.id, id);
    expect(reloaded).not.toBeNull();
    expect(reloaded!.analysis.results.length).toBe(parsed.results.length);
    expect(reloaded!.analysis.overview).toBe(analysis.overview);
    // Explanations are rebuilt on read, so a reload must still produce them.
    expect(reloaded!.analysis.explanations.length).toBeGreaterThan(0);
    expect(reloaded!.analysis.doctorQuestions.length).toBeGreaterThan(0);

    const listed = await listReportsForUser(user.id);
    expect(listed.some((r) => r.id === id)).toBe(true);
  });

  it('does not leak a report to another user', async () => {
    const owner = await makeUser(`owner-${Date.now()}@example.com`);
    const other = await makeUser(`other-${Date.now()}@example.com`);
    const parsed = parseLabReport(buildSyntheticReportText([buildSyntheticCbcDataset(80)[0]!], 4)[0]!.text);
    const id = await saveReport({ userId: owner.id, report: parsed, summary: 's', explanations: [] });

    expect(await getReportForUser(other.id, id)).toBeNull();
    expect((await listReportsForUser(other.id)).some((r) => r.id === id)).toBe(false);
  });

  it('returns null for a malformed id instead of raising a database error', async () => {
    const user = await makeUser(`malformed-${Date.now()}@example.com`);
    expect(await getReportForUser(user.id, 'not-a-uuid')).toBeNull();
  });
});

describe('consultation flow', () => {
  it('uses selected symptoms in the initial safety screen', async () => {
    const user = await makeUser(`selected-symptom-${Date.now()}@example.com`);
    const id = await createConsultation(user.id, '', 40, ['chest_pain']);
    const session = await getConsultation(user.id, id);

    expect(session?.initialComplaint).toContain('Chest pain');
    expect(session?.triage.emergency).toBe(true);
    expect(session?.triage.action).toBe('call_emergency_services');
  });

  it('retains age when recalculating triage at consultation completion', async () => {
    const user = await makeUser(`young-consult-${Date.now()}@example.com`);
    const id = await createConsultation(user.id, '', 3, ['itching', 'headache', 'nausea', 'fatigue']);
    let session = await getConsultation(user.id, id);

    while (session?.nextQuestion) {
      const question = session.nextQuestion;
      const result = await saveAnswer(user.id, id, question.key, safeAnswer(question));
      expect(result.error).toBeNull();
      session = result.session;
    }

    const done = await completeConsultation(user.id, id);
    expect(done.error).toBeNull();
    expect(done.session?.ageYears).toBe(3);
    expect(done.session?.triage.action).toBe('clinician_within_24_48h');
  });

  it('advances to a different question after saving an answer', async () => {
    const user = await makeUser(`advance-${Date.now()}@example.com`);
    const id = await createConsultation(user.id, 'I feel unwell', 30);
    const first = await getConsultation(user.id, id);
    const firstQuestion = first!.nextQuestion!;

    const result = await saveAnswer(user.id, id, firstQuestion.key, safeAnswer(firstQuestion));

    expect(result.error).toBeNull();
    expect(result.session?.answeredCount).toBe(1);
    expect(result.session?.nextQuestion?.key).not.toBe(firstQuestion.key);
  });

  it('asks between 10 and 15 questions and can be completed', async () => {
    const user = await makeUser(`consult-${Date.now()}@example.com`);
    const id = await createConsultation(user.id, 'I have had a mild headache for two days', 34);
    let session = await getConsultation(user.id, id);
    expect(session).not.toBeNull();
    expect(session!.nextQuestion).not.toBeNull();
    expect(session!.symptomSetNames).toContain('Headache');

    let asked = 0;
    const askedKeys = new Set<string>();
    let guard = 0;
    while (session?.nextQuestion && guard < 40) {
      guard += 1;
      const q = session.nextQuestion;
      askedKeys.add(q.key);
      const answer = safeAnswer(q);
      const res = await saveAnswer(user.id, id, q.key, answer);
      expect(res.error, `answering ${q.key} (${q.kind}) = ${answer}: ${res.error ?? ''}`).toBeNull();
      asked += 1;
      session = res.session;
      if (!session?.nextQuestion) break;
    }

    expect(asked).toBeGreaterThanOrEqual(10);
    expect(asked).toBeLessThanOrEqual(MAX_QUESTIONS_PER_SESSION);
    // "for two days" is already in the complaint, so the engine must not ask it
    // again. Re-asking a fact the patient has already given is precisely the
    // redundancy the adaptive selector exists to remove.
    expect(askedKeys.has('headache_duration')).toBe(false);
    // Every question in the bank must be answerable, whatever its kind.
    expect(session!.nextQuestion).toBeNull();

    const done = await completeConsultation(user.id, id);
    expect(done.error).toBeNull();
    expect(done.session?.status).toBe('complete');

    const assessment = done.session!.assessment;
    expect(assessment, 'a completed session stores its assessment').toBeTruthy();
    expect(assessment!.possibleExplanations.length).toBeGreaterThan(0);
    expect(assessment!.summary.toLowerCase()).toContain('headache');
    expect(assessment!.whatToDoNext.length).toBeGreaterThan(0);
    expect(assessment!.questionsForDoctor.length).toBeGreaterThan(0);
    // It must state what it could not work out, rather than guessing.
    expect(assessment!.missingInformation.length).toBeGreaterThan(0);
    // It must disclaim, in words, that it is not diagnosing.
    expect(assessment!.disclaimer.toLowerCase()).toContain('not a diagnosis');
    expect(assessment!.possibleExplanations.join(' ').toLowerCase()).not.toMatch(/\byou (are|have) (a|an) \w+/);
  });

  it('asks for a duration that the complaint did not already give', async () => {
    const user = await makeUser(`noduration-${Date.now()}@example.com`);
    // No "for two days" here, so the duration question is genuinely outstanding
    // and must be asked. Together with the assertion above this pins both halves
    // of the rule: ask what is missing, never re-ask what was given.
    const id = await createConsultation(user.id, 'I have a headache', 34);
    let session = await getConsultation(user.id, id);
    expect(session).not.toBeNull();

    const askedKeys = new Set<string>();
    let guard = 0;
    while (session?.nextQuestion && guard < 40) {
      guard += 1;
      const q = session.nextQuestion;
      askedKeys.add(q.key);
      const res = await saveAnswer(user.id, id, q.key, safeAnswer(q));
      expect(res.error).toBeNull();
      session = res.session;
    }

    expect(askedKeys.has('headache_duration')).toBe(true);
  });

  it('escalates from the free text alone', async () => {
    const user = await makeUser(`emergency-${Date.now()}@example.com`);
    const id = await createConsultation(user.id, 'crushing chest pain and I cannot breathe', 40);
    const session = await getConsultation(user.id, id);
    expect(session!.triage.emergency).toBe(true);
    expect(session!.triage.action).toBe('call_emergency_services');
    expect(session!.triage.notices.length).toBeGreaterThan(0);
  });

  it('rejects invalid answers without recording them', async () => {
    const user = await makeUser(`invalid-${Date.now()}@example.com`);
    const id = await createConsultation(user.id, 'mild tiredness', 30);
    const session = await getConsultation(user.id, id);
    const key = session!.nextQuestion!.key;

    // Never asked.
    expect((await saveAnswer(user.id, id, 'not_a_question', 'yes')).error).not.toBeNull();
    // Outside the allowed values.
    expect((await saveAnswer(user.id, id, key, 'banana')).error).not.toBeNull();

    const after = await getConsultation(user.id, id);
    expect(after!.answers.size).toBe(0);
  });

  it('rejects an out-of-range scale answer and accepts one in range', async () => {
    const user = await makeUser(`scale-${Date.now()}@example.com`);
    const id = await createConsultation(user.id, 'mild tiredness', 30);

    // Walk to the severity question.
    let session = await getConsultation(user.id, id);
    let guard = 0;
    while (session?.nextQuestion && session.nextQuestion.key !== 'severity' && guard < 20) {
      guard += 1;
      session = (await saveAnswer(user.id, id, session.nextQuestion.key, safeAnswer(session.nextQuestion))).session;
    }
    expect(session?.nextQuestion?.key).toBe('severity');

    expect((await saveAnswer(user.id, id, 'severity', '99')).error).not.toBeNull();
    expect((await saveAnswer(user.id, id, 'severity', '3.5')).error).not.toBeNull();
    expect((await saveAnswer(user.id, id, 'severity', '')).error).not.toBeNull();
    const good = await saveAnswer(user.id, id, 'severity', '7');
    expect(good.error).toBeNull();
    expect(good.session?.answers.get('severity')).toBe('7');
  });

  it('does not leak a consultation to another user', async () => {
    const owner = await makeUser(`cowner-${Date.now()}@example.com`);
    const other = await makeUser(`cother-${Date.now()}@example.com`);
    const id = await createConsultation(owner.id, 'mild tiredness', 30);
    expect(await getConsultation(other.id, id)).toBeNull();
    expect((await listConsultations(other.id)).some((c) => c.id === id)).toBe(false);
    expect(await getConsultation(owner.id, 'not-a-uuid')).toBeNull();
  });
});

/**
 * The questionnaire is the only source of red-flag answers for someone whose
 * free text was vague, so the answers themselves must reach the safety engine.
 *
 * This regressed: the symptom keys were collected with a `symptom_` prefix that
 * no question actually uses, so `present` was always empty on completion. Every
 * completed session therefore triaged as routine, and a user who answered
 * "yes" to chest pain was told to self-care.
 */
describe('red flags answered in the questionnaire', () => {
  async function answerWith(
    userId: string,
    sessionId: string,
    overrides: Record<string, string>,
  ): Promise<Awaited<ReturnType<typeof getConsultation>>> {
    let session = await getConsultation(userId, sessionId);
    let guard = 0;
    while (session?.nextQuestion && guard < 40) {
      guard += 1;
      const q = session.nextQuestion;
      const answer = overrides[q.key] ?? safeAnswer(q);
      session = (await saveAnswer(userId, sessionId, q.key, answer)).session;
    }
    return session;
  }

  it('escalates a chest-pain answer to an emergency', async () => {
    const user = await makeUser(`rf-chest-${Date.now()}@example.com`);
    // Deliberately bland free text: the escalation must come from the answers.
    const id = await createConsultation(user.id, 'not feeling great', 40);

    const done = await completeConsultation(
      user.id,
      await answerWith(user.id, id, { chest_pain: 'yes' }).then((s) => s!.id),
    );

    expect(done.session!.triage.level).toBe('emergency');
    expect(done.session!.triage.action).toBe('call_emergency_services');
    expect(done.session!.triage.emergency).toBe(true);
    expect(done.session!.status).toBe('escalated');
    // The narrative is suppressed, not softened, when the answer is an emergency.
    expect(done.session!.assessment!.possibleExplanations).toEqual([]);
  }, 30_000);

  it('escalates a stiff neck with a high fever to an emergency', async () => {
    const user = await makeUser(`rf-neck-${Date.now()}@example.com`);
    const id = await createConsultation(user.id, 'feel off', 30);

    const done = await completeConsultation(
      user.id,
      await answerWith(user.id, id, { stiff_neck: 'yes', high_fever: 'yes' }).then((s) => s!.id),
    );

    // The combination rule, not just the individual parts, must fire.
    expect(done.session!.triage.evaluatedRuleIds).toContain('meningitis-pattern');
    expect(done.session!.triage.level).toBe('emergency');
  }, 30_000);

  it('keeps an all-no questionnaire at routine', async () => {
    const user = await makeUser(`rf-none-${Date.now()}@example.com`);
    const id = await createConsultation(user.id, 'just off', 30);

    const done = await completeConsultation(
      user.id,
      await answerWith(user.id, id, {}).then((s) => s!.id),
    );

    expect(done.session!.triage.emergency).toBe(false);
    expect(done.session!.triage.level).not.toBe('emergency');
    expect(done.session!.status).toBe('complete');
  }, 30_000);
});
