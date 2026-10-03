/**
 * Kysely table types. These mirror `src/database/migrations/001_initial_schema.sql`.
 *
 * We use Kysely rather than an ORM because the dev database (PGlite) and the
 * production database (PostgreSQL) speak the *same* dialect, so the exact same
 * typed SQL runs in both environments with no dialect switch.
 */

import type { Generated } from 'kysely';

export type Timestamp = Date;
export type Json = unknown;

/**
 * A column wrapped in `Generated<T>` is supplied by the database via a DEFAULT
 * clause. Reads still yield `T`, but inserts may omit it. Columns that are
 * `NOT NULL DEFAULT ...` in the SQL are wrapped here, otherwise TypeScript
 * wrongly demands them on every insert.
 */

export interface UsersTable {
  id: Generated<string>;
  email: string;
  email_verified_at: Timestamp | null;
  password_hash: string | null;
  full_name: string | null;
  role: 'patient' | 'clinician' | 'reviewer' | 'admin';
  // Which credential this account actually uses. 'local' is the profile every
  // request resolves to now that sign-in has been removed; it has no credential
  // at all, which is why password_hash is null for it.
  auth_method: Generated<'password' | 'otp' | 'local'>;
  date_of_birth: string | null;
  // Minimal-data-collection defaults; users opt in per purpose.
  analytics_opt_in: Generated<boolean>;
  marketing_opt_in: Generated<boolean>;
  locale: Generated<string>;
  timezone: Generated<string>;
  emergency_region: string | null;
  is_active: boolean;
  failed_login_count: number;
  locked_until: Timestamp | null;
  last_login_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  deleted_at: Timestamp | null;
}

export interface SessionsTable {
  id: Generated<string>;
  user_id: string;
  token_hash: string;
  user_agent: string | null;
  ip_hash: string | null;
  expires_at: Timestamp;
  revoked_at: Timestamp | null;
  last_seen_at: Timestamp;
  created_at: Timestamp;
}

export interface ReportsTable {
  id: Generated<string>;
  user_id: string;
  patient_display_ref: string | null;
  title: string;
  report_type: string;
  report_date: string | null;
  collected_at: string | null;
  laboratory: string | null;
  patient_age_years: string | null;
  patient_sex: string | null;
  referring_doctor: string | null;
  ocr_text_encrypted: Uint8Array | null;
  ocr_provider: string | null;
  ocr_confidence: string | null;
  storage_key: string | null;
  original_filename: string | null;
  mime_type: string | null;
  size_bytes: string | null;
  sha256: string | null;
  page_count: number;
  pipeline_version: Json | null;
  overall_status: 'low' | 'high' | 'normal' | 'critical_low' | 'critical_high' | 'unknown';
  summary: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  deleted_at: Timestamp | null;
}

export interface ReportPagesTable {
  id: string;
  report_id: string;
  page_number: number;
  storage_key: string | null;
  /** Encrypted, base64-encoded value with an `enc:v1:` prefix. */
  ocr_text: string | null;
  width: number | null;
  height: number | null;
  confidence: string | null;
  created_at: Timestamp;
}

export interface LabResultsTable {
  id: Generated<string>;
  report_id: string;
  result_key: string;
  name: string;
  normalized_name: string;
  code: string | null;
  value: string | null;
  raw_value: string;
  unit: string | null;
  unit_raw: string | null;
  reference_low: string | null;
  reference_high: string | null;
  reference_raw: string | null;
  reference_source:
    | 'user_report'
    | 'report_reference_range'
    | 'knowledge_base'
    | 'computed'
    | 'ai_generated'
    | 'user_reported';
  status: 'low' | 'high' | 'normal' | 'critical_low' | 'critical_high' | 'unknown';
  reported_flag: string | null;
  deviation: string | null;
  note: string | null;
  explanation_json: Json | null;
  created_at: Timestamp;
}

export interface TermAliasesTable {
  id: string;
  alias: string;
  alias_normalized: string;
  canonical_name: string;
  code: string | null;
  system: string;
  system_version: string | null;
  review_status: 'draft' | 'in_review' | 'approved' | 'retired';
  reviewer_id: string | null;
  reviewed_at: string | null;
  source_url: string | null;
  version: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface TestReferenceRangesTable {
  id: string;
  normalized_name: string;
  code: string | null;
  sex: string;
  age_min_years: string;
  age_max_years: string;
  unit: string | null;
  ref_low: string | null;
  ref_high: string | null;
  ref_text: string | null;
  source_id: string | null;
  source_url: string | null;
  source_title: string | null;
  license: string | null;
  publication_date: string | null;
  last_reviewed: string;
  review_status: 'draft' | 'in_review' | 'approved' | 'retired';
  reviewed_by: string | null;
  version: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface MedicalSourcesTable {
  id: string;
  slug: string;
  title: string;
  publisher: string;
  url: string;
  publication_date: string | null;
  last_reviewed: string;
  license: string;
  authority_note: string | null;
  licensed: boolean;
  redistribution_allowed: boolean;
  language: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface MedicalConceptsTable {
  id: string;
  slug: string;
  concept_name: string;
  synonyms: string[];
  category: string;
  plain_summary: string;
  measures: string | null;
  variation_causes: string | null;
  other_context: string | null;
  reading_level: string;
  keywords: string[];
  source_id: string | null;
  provenance: 'user_report' | 'report_reference_range' | 'knowledge_base' | 'computed' | 'ai_generated' | 'user_reported';
  review_status: 'draft' | 'in_review' | 'approved' | 'retired';
  reviewed_by: string | null;
  reviewed_at: string | null;
  version: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface KnowledgeChunksTable {
  id: string;
  concept_id: string;
  chunk_index: number;
  title: string;
  body: string;
  token_count: number | null;
  source_id: string | null;
  provenance: 'user_report' | 'report_reference_range' | 'knowledge_base' | 'computed' | 'ai_generated' | 'user_reported';
  review_status: 'draft' | 'in_review' | 'approved' | 'retired';
  reviewed_by: string | null;
  reviewed_at: string | null;
  version: string;
  created_at: Timestamp;
}

export interface KnowledgeEmbeddingsTable {
  chunk_id: string;
  model: string;
  dimensions: number;
  embedding: string;
  created_at: Timestamp;
}

export interface ClinicalRulesTable {
  id: string;
  rule_key: string;
  version: string;
  title: string;
  description: string | null;
  symptom_keys: string[];
  trigger_type:
    | 'symptom_present'
    | 'answer_value'
    | 'answer_numeric'
    | 'combination'
    | 'age_value';
  predicate: Json;
  level: 'emergency' | 'urgent' | 'soon' | 'routine' | 'unknown';
  action: 'call_emergency_services' | 'emergency_department' | 'urgent_same_day_care' | 'clinician_within_24_48h' | 'clinician_within_1_2_weeks' | 'self_care_with_safety_netting' | 'insufficient_information';
  title_out: string;
  body_out: string;
  suppress_narrative: boolean;
  source_id: string | null;
  source_url: string | null;
  source_title: string | null;
  review_status: 'draft' | 'in_review' | 'approved' | 'retired';
  reviewed_by: string | null;
  reviewed_at: string | null;
  effective_from: string;
  effective_to: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface SymptomSessionsTable {
  id: Generated<string>;
  user_id: string | null;
  initial_complaint: string;
  detected_symptoms: string[];
  age_years: number | null;
  /** Self-reported sex, used for adaptive branching and medicine safety gates. */
  sex: string | null;
  /**
   * Adaptive engine audit trail: graph version, facts seeded from the opening
   * free text, covered topics, and why each skipped question was skipped.
   */
  adaptive_json: Json | null;
  triage_level: 'emergency' | 'urgent' | 'soon' | 'routine' | 'unknown';
  triage_action: 'call_emergency_services' | 'emergency_department' | 'urgent_same_day_care' | 'clinician_within_24_48h' | 'clinician_within_1_2_weeks' | 'self_care_with_safety_netting' | 'insufficient_information';
  triage_json: Json | null;
  assessment_json: Json | null;
  rule_set_version: string | null;
  status: 'collecting' | 'complete' | 'escalated';
  question_set_version: string | null;
  llm_provider: string | null;
  llm_model: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  deleted_at: Timestamp | null;
}

export interface SymptomQuestionsTable {
  id: string;
  question_key: string;
  version: string;
  prompt: string;
  help_text: string | null;
  kind: string;
  options: Json;
  depends_on_key: string | null;
  depends_on_values: string[];
  skip_if_key: string | null;
  skip_if_values: string[];
  priority: number;
  target_symptoms: string[];
  safety_critical: boolean;
  min_value: string | null;
  max_value: string | null;
  unit: string | null;
  reviewer_note: string | null;
  source_id: string | null;
  review_status: 'draft' | 'in_review' | 'approved' | 'retired';
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface SymptomAnswersTable {
  id: Generated<string>;
  session_id: string;
  question_id: string | null;
  question_key: string;
  value_text: string | null;
  value_number: string | null;
  value_bool: boolean | null;
  value_json: Json | null;
  asked_at: Timestamp;
  answered_at: Timestamp | null;
}

export interface DoctorsTable {
  id: string;
  full_name: string;
  specialty: string;
  credentials: string | null;
  bio: string | null;
  languages: string[];
  years_experience: number | null;
  verified: boolean;
  verification_note: string | null;
  accepting_patients: boolean;
  review_status: 'draft' | 'in_review' | 'approved' | 'retired';
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ConsultationsTable {
  id: string;
  user_id: string;
  doctor_id: string | null;
  specialty: string;
  status: 'draft' | 'requested' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';
  summary_draft: Json | null;
  summary_confirmed_at: Timestamp | null;
  summary_snapshot: Json | null;
  related_report_ids: string[];
  related_symptom_session_ids: string[];
  scheduled_at: Timestamp | null;
  notes_encrypted: Uint8Array | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  deleted_at: Timestamp | null;
}

export interface UserConsentsTable {
  id: string;
  user_id: string;
  purpose: string;
  granted: boolean;
  policy_version: string;
  granted_at: Timestamp | null;
  revoked_at: Timestamp | null;
  created_at: Timestamp;
}

export interface AuditLogsTable {
  id: string;
  occurred_at: Timestamp;
  actor_user_id: string | null;
  actor_role: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  outcome: 'success' | 'failure' | 'denied' | 'error';
  ip_hash: string | null;
  user_agent_hash: string | null;
  request_id: string | null;
  metadata: Json | null;
}

export interface RateLimitsTable {
  bucket: string;
  window_started_at: Timestamp;
  count: number;
  expires_at: Timestamp;
}

/**
 * A one-time sign-in code requested by email.
 *
 * `code_hash` is an HMAC, never the code itself: a six-digit code carries only
 * about 20 bits of entropy, so storing it even hashed with a fast function
 * would be trivially recoverable from a database dump.
 */
export interface LoginCodesTable {
  id: Generated<string>;
  email: string;
  user_id: Generated<string> | null;
  code_hash: string;
  purpose: string;
  attempts: Generated<number>;
  max_attempts: Generated<number>;
  expires_at: Timestamp;
  consumed_at: Timestamp | null;
  request_ip_hash: string | null;
  created_at: Generated<Timestamp>;
}

export interface SchemaMetaTable {
  key: string;
  value: string;
}

export interface Database {
  users: UsersTable;
  sessions: SessionsTable;
  reports: ReportsTable;
  report_pages: ReportPagesTable;
  lab_results: LabResultsTable;
  term_aliases: TermAliasesTable;
  test_reference_ranges: TestReferenceRangesTable;
  medical_sources: MedicalSourcesTable;
  medical_concepts: MedicalConceptsTable;
  knowledge_chunks: KnowledgeChunksTable;
  knowledge_embeddings: KnowledgeEmbeddingsTable;
  clinical_rules: ClinicalRulesTable;
  symptom_sessions: SymptomSessionsTable;
  symptom_questions: SymptomQuestionsTable;
  symptom_answers: SymptomAnswersTable;
  doctors: DoctorsTable;
  consultations: ConsultationsTable;
  user_consents: UserConsentsTable;
  audit_logs: AuditLogsTable;
  rate_limits: RateLimitsTable;
  login_codes: LoginCodesTable;
  schema_meta: SchemaMetaTable;
}
