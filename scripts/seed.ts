/**
 * `npm run db:seed`
 *
 * Loads the curated, licence-checked knowledge base from the TypeScript modules
 * in `src/data` and `src/medical` into the database tables that mirror it.
 *
 * The application itself reads these datasets from code, so this script is not
 * needed to run the app. It exists so the knowledge base is inspectable and
 * auditable in SQL, and so the `data:verify-*` scripts have rows to check.
 *
 * Safe to re-run: the curated tables are entirely derived from the code, so each
 * run replaces their contents in one transaction. That is stronger than an
 * upsert, which could never remove a row whose catalogue entry was deleted.
 *
 * These tables hold curated reference data only. No table written here contains
 * a user's reports, answers, or accounts.
 */
import { createHash } from 'node:crypto';

import type { Insertable } from 'kysely';

import { getDb, closeDb, activeDialect } from '../src/database/client';
import { CORE_QUESTIONS, QUESTION_SET_VERSION } from '../src/data/question-bank';
import { LAB_TEST_RECORDS, REFERENCE_RANGES } from '../src/data/lab-tests';
import { SOURCE_REGISTRY } from '../src/data/source-registry';
import { SYMPTOM_BY_KEY } from '../src/data/symptom-catalog';
import { TEST_CONCEPTS } from '../src/medical/concepts';
import {
  COMBINATION_RULES,
  EMERGENCY_SYMPTOMS,
  TRIAGE_RULE_SET_VERSION,
  URGENT_SYMPTOMS,
} from '../src/medical/triage';
import { PROVENANCE } from '../src/types/medical';
import type { DB } from '../src/database/client';
import type {
  ClinicalRulesTable,
  KnowledgeChunksTable,
  MedicalConceptsTable,
  TermAliasesTable,
} from '../src/database/schema';

type clinicalRuleRow = Insertable<ClinicalRulesTable>;
type conceptRow = Insertable<MedicalConceptsTable>;
type chunkRow = Insertable<KnowledgeChunksTable>;

/** Deterministic UUID from a natural key, so re-seeding updates in place. */
function stableUuid(name: string): string {
  const h = createHash('sha256').update(`medisense:${name}`).digest('hex');
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    `5${h.slice(13, 16)}`,
    ((parseInt(h.slice(16, 17), 16) & 0x3) | 0x8).toString(16) + h.slice(17, 20),
    h.slice(20, 32),
  ].join('-');
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Rough token estimate; only used to size retrieval chunks. */
function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function labelFor(key: string): string {
  return SYMPTOM_BY_KEY.get(key)?.label ?? key;
}

async function main(): Promise<void> {
  const db: DB = await getDb();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const counts: Record<string, number> = {};

  // -------------------------------------------------------------- sources
  const sourceRows = SOURCE_REGISTRY.filter((s) => s.reviewStatus !== 'retired').map((s) => ({
    id: stableUuid(`source:${s.slug}`),
    slug: s.slug,
    title: s.title,
    publisher: s.publisher,
    url: s.url,
    publication_date: null,
    last_reviewed: s.lastReviewed,
    license: s.license,
    authority_note: s.quality.notes,
    licensed: true,
    redistribution_allowed: s.quality.redistributionAllowed,
    language: 'en',
    created_at: now,
    updated_at: now,
  }));
  counts.medical_sources = sourceRows.length;
  const sourceId = new Map(sourceRows.map((s) => [s.slug, s.id]));

  // -------------------------------------------------- reference ranges
  const rangeRows = REFERENCE_RANGES.map((r) => ({
    id: stableUuid(`range:${r.normalizedName}:${r.sex}:${r.ageMinYears}:${r.ageMaxYears}:${r.unit ?? ''}`),
    normalized_name: r.normalizedName,
    code: LAB_TEST_RECORDS.find((t) => t.normalizedName === r.normalizedName)?.code ?? null,
    sex: r.sex,
    age_min_years: String(r.ageMinYears),
    age_max_years: String(r.ageMaxYears),
    unit: r.unit,
    ref_low: r.refLow === null ? null : String(r.refLow),
    ref_high: r.refHigh === null ? null : String(r.refHigh),
    ref_text: r.refText,
    source_id: null,
    source_url: r.sourceUrl,
    source_title: r.sourceTitle,
    license: r.license,
    publication_date: null,
    last_reviewed: r.lastReviewed,
    review_status: r.reviewStatus,
    reviewed_by: r.reviewedBy,
    version: r.version,
    created_at: now,
    updated_at: now,
  }));
  counts.test_reference_ranges = rangeRows.length;

  // ------------------------------------------------------- term aliases
  // "Na" and "Na+" normalize to the same key, so dedupe within a test. An alias
  // claimed by two different tests is genuinely ambiguous and must not be
  // stored: resolving it to the wrong analyte would explain the wrong test.
  const aliasOwner = new Map<string, string>();
  const ambiguous: string[] = [];
  const aliasRows: (Insertable<TermAliasesTable>)[] = [];
  for (const t of LAB_TEST_RECORDS) {
    const seen = new Set<string>();
    for (const alias of [t.normalizedName, ...t.synonyms]) {
      const key = alias.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (!key || seen.has(key)) continue;
      const owner = aliasOwner.get(key);
      if (owner && owner !== t.normalizedName) {
        ambiguous.push(`${alias} (${owner} / ${t.normalizedName})`);
        continue;
      }
      seen.add(key);
      aliasOwner.set(key, t.normalizedName);
      aliasRows.push({
        id: stableUuid(`alias:${key}`),
        alias,
        alias_normalized: key,
        canonical_name: t.normalizedName,
        code: t.code,
        system: 'medisense',
        system_version: null,
        review_status: 'approved',
        reviewer_id: null,
        reviewed_at: today,
        source_url: t.sourceUrl,
        version: '1.0.0',
        created_at: now,
        updated_at: now,
      });
    }
  }
  if (ambiguous.length) {
    console.warn(`skipped ${ambiguous.length} ambiguous alias(es): ${ambiguous.join(', ')}`);
  }
  counts.term_aliases = aliasRows.length;

  // ------------------------------------------- concepts and KB chunks
  const conceptRows: conceptRow[] = [];
  const chunkRows: chunkRow[] = [];
  for (const concept of TEST_CONCEPTS) {
    const test = LAB_TEST_RECORDS.find((t) => t.normalizedName === concept.name);
    const id = stableUuid(`concept:${concept.name}`);
    const conceptSourceId = test?.sourceSlug ? (sourceId.get(test.sourceSlug) ?? null) : null;

    conceptRows.push({
      id,
      slug: slugify(concept.name),
      concept_name: concept.name,
      synonyms: test?.synonyms ?? [],
      category: test?.category ?? 'other',
      plain_summary: concept.whatItMeasures,
      measures: concept.whatItMeasures,
      variation_causes: concept.whyItMayDiffer,
      other_context: concept.otherRelevantInfo,
      reading_level: 'grade-8',
      keywords: slugify(concept.name).split('-'),
      source_id: conceptSourceId,
      provenance: PROVENANCE.KNOWLEDGE_BASE,
      review_status: 'approved',
      reviewed_by: null,
      reviewed_at: today,
      version: '1.0.0',
      created_at: now,
      updated_at: now,
    });

    // One chunk per section, so retrieval can cite the part it actually used.
    const sections: [string, string][] = [
      ['What this test measures', concept.whatItMeasures],
      ['Why a result can differ', concept.whyItMayDiffer],
      ['What else is worth knowing', concept.otherRelevantInfo],
      ['Typical next step', concept.typicalNextStep],
    ];
    for (const [i, [title, body]] of sections.entries()) {
      chunkRows.push({
        id: stableUuid(`chunk:${concept.name}:${i}`),
        concept_id: id,
        chunk_index: i,
        title,
        body,
        token_count: approxTokens(body),
        source_id: conceptSourceId,
        provenance: PROVENANCE.KNOWLEDGE_BASE,
        review_status: 'approved',
        reviewed_by: null,
        reviewed_at: today,
        version: '1.0.0',
        created_at: now,
      });
    }
  }
  counts.medical_concepts = conceptRows.length;
  counts.knowledge_chunks = chunkRows.length;

  // -------------------------------------------------- symptom questions
  const questionRows = CORE_QUESTIONS.map((q) => ({
    id: stableUuid(`question:${q.key}:${q.version}`),
    question_key: q.key,
    version: q.version,
    prompt: q.prompt,
    help_text: q.helpText,
    kind: q.kind,
    options: q.options,
    depends_on_key: q.dependsOnKey,
    depends_on_values: q.dependsOnValues,
    skip_if_key: q.skipIfKey,
    skip_if_values: q.skipIfValues,
    priority: q.priority,
    target_symptoms: q.targetSymptoms,
    safety_critical: q.safetyCritical,
    min_value: q.min === null ? null : String(q.min),
    max_value: q.max === null ? null : String(q.max),
    unit: q.unit,
    reviewer_note: q.reviewerNote,
    source_id: null,
    review_status: 'approved' as const,
    reviewed_by: null,
    reviewed_at: today,
    created_at: now,
    updated_at: now,
  }));
  counts.symptom_questions = questionRows.length;

  // ------------------------------------------------------ clinical rules
  const ruleRows: clinicalRuleRow[] = [];
  for (const key of EMERGENCY_SYMPTOMS) {
    ruleRows.push({
      id: stableUuid(`rule:emergency-symptom:${key}`),
      rule_key: `emergency-symptom:${key}`,
      version: TRIAGE_RULE_SET_VERSION,
      title: labelFor(key),
      description: SYMPTOM_BY_KEY.get(key)?.prompt ?? null,
      symptom_keys: [key],
      trigger_type: 'symptom_present',
      predicate: { symptom: key },
      level: 'emergency',
      action: 'call_emergency_services',
      title_out: `${labelFor(key)} needs emergency care`,
      body_out: `A report of ${labelFor(key).toLowerCase()} is treated as an emergency warning sign. Please contact your local emergency number or go to an emergency department now.`,
      suppress_narrative: false,
      source_id: null,
      source_url: null,
      source_title: null,
      review_status: 'approved',
      reviewed_by: null,
      reviewed_at: today,
      effective_from: today,
      effective_to: null,
      created_at: now,
      updated_at: now,
    });
  }
  for (const key of URGENT_SYMPTOMS) {
    ruleRows.push({
      id: stableUuid(`rule:urgent-symptom:${key}`),
      rule_key: `urgent-symptom:${key}`,
      version: TRIAGE_RULE_SET_VERSION,
      title: labelFor(key),
      description: SYMPTOM_BY_KEY.get(key)?.prompt ?? null,
      symptom_keys: [key],
      trigger_type: 'symptom_present',
      predicate: { symptom: key },
      level: 'urgent',
      action: 'urgent_same_day_care',
      title_out: `${labelFor(key)} should be seen today`,
      body_out: `A report of ${labelFor(key).toLowerCase()} should be assessed by a clinician today. If it gets worse, or you feel very unwell, contact your local emergency number.`,
      suppress_narrative: false,
      source_id: null,
      source_url: null,
      source_title: null,
      review_status: 'approved',
      reviewed_by: null,
      reviewed_at: today,
      effective_from: today,
      effective_to: null,
      created_at: now,
      updated_at: now,
    });
  }
  for (const rule of COMBINATION_RULES) {
    ruleRows.push({
      id: stableUuid(`rule:combination:${rule.id}`),
      rule_key: `combination:${rule.id}`,
      version: TRIAGE_RULE_SET_VERSION,
      title: rule.title,
      description: rule.body,
      symptom_keys: rule.all,
      trigger_type: 'combination',
      predicate: { all: rule.all },
      level: rule.level,
      action: rule.action,
      title_out: rule.title,
      body_out: rule.body,
      suppress_narrative: rule.suppressNarrative,
      source_id: null,
      source_url: null,
      source_title: null,
      review_status: 'approved',
      reviewed_by: null,
      reviewed_at: today,
      effective_from: today,
      effective_to: null,
      created_at: now,
      updated_at: now,
    });
  }
  counts.clinical_rules = ruleRows.length;

  // Replace the curated tables in one transaction. Deletes run children first
  // so the source_id foreign keys stay satisfied, and inserts run in the
  // reverse order. PGlite has no concurrent-writer support, so this must not
  // overlap with a running dev server.
  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom('knowledge_chunks').execute();
    await trx.deleteFrom('medical_concepts').execute();
    await trx.deleteFrom('symptom_questions').execute();
    await trx.deleteFrom('clinical_rules').execute();
    await trx.deleteFrom('test_reference_ranges').execute();
    await trx.deleteFrom('term_aliases').execute();
    await trx.deleteFrom('medical_sources').execute();

    if (sourceRows.length) await trx.insertInto('medical_sources').values(sourceRows).execute();
    if (rangeRows.length) await trx.insertInto('test_reference_ranges').values(rangeRows).execute();
    if (aliasRows.length) await trx.insertInto('term_aliases').values(aliasRows).execute();
    if (conceptRows.length) await trx.insertInto('medical_concepts').values(conceptRows).execute();
    if (chunkRows.length) await trx.insertInto('knowledge_chunks').values(chunkRows).execute();
    if (questionRows.length) await trx.insertInto('symptom_questions').values(questionRows).execute();
    if (ruleRows.length) await trx.insertInto('clinical_rules').values(ruleRows).execute();
  });

  console.log(`dialect: ${activeDialect()}`);
  for (const [table, n] of Object.entries(counts)) {
    console.log(`  ${table.padEnd(24)} ${n}`);
  }
  console.log(`\nquestion set: ${QUESTION_SET_VERSION}; safety rules: ${TRIAGE_RULE_SET_VERSION}`);
}

main()
  .then(closeDb)
  .catch(async (err) => {
    console.error(err);
    await closeDb();
    process.exitCode = 1;
  });
