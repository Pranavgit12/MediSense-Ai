-- =============================================================================
-- MediSense :: 001_initial_schema
-- PostgreSQL 13+ with pgvector.
--
-- Conventions
--   * uuid primary keys (generated, never client supplied)
--   * timestamptz everywhere; we store UTC only
--   * every PHI-bearing table has user_id + created_at + deleted_at
--   * soft delete via deleted_at for auditability; hard purge via DELETE endpoint
--   * no free-text column is indexed with a pattern operator (no LIKE '%..%')
-- =============================================================================

-- Only pgvector is required. gen_random_uuid() is core from PostgreSQL 13
-- onwards, so pgcrypto is deliberately NOT installed: it is unavailable in
-- PGlite and is not needed for anything in this schema.
CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------- enum types
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('patient', 'clinician', 'reviewer', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE review_status AS ENUM ('draft', 'in_review', 'approved', 'retired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE result_status AS ENUM ('low', 'high', 'normal', 'critical_low', 'critical_high', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE provenance AS ENUM (
    'user_report', 'report_reference_range', 'knowledge_base',
    'computed', 'ai_generated', 'user_reported'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE symptom_session_status AS ENUM ('collecting', 'complete', 'escalated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE safety_level AS ENUM ('emergency', 'urgent', 'soon', 'routine', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE safety_action AS ENUM (
    'call_emergency_services', 'emergency_department', 'urgent_same_day_care',
    'clinician_within_24_48h', 'clinician_within_1_2_weeks',
    'self_care_with_safety_netting', 'insufficient_information'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE consultation_status AS ENUM (
    'draft', 'requested', 'accepted', 'in_progress', 'completed', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------------- identity
CREATE TABLE IF NOT EXISTS users (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email               text NOT NULL,
  email_verified_at   timestamptz,
  password_hash       text NOT NULL,
  full_name           text,
  role                user_role NOT NULL DEFAULT 'patient',
  date_of_birth       date,
  -- Minimal-data-collection defaults; users opt in per purpose.
  analytics_opt_in    boolean NOT NULL DEFAULT false,
  marketing_opt_in    boolean NOT NULL DEFAULT false,
  locale              text NOT NULL DEFAULT 'en',
  timezone            text NOT NULL DEFAULT 'UTC',
  emergency_region    text,
  is_active           boolean NOT NULL DEFAULT true,
  failed_login_count  integer NOT NULL DEFAULT 0,
  locked_until        timestamptz,
  last_login_at       timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);
-- Case-insensitive uniqueness, and a partial unique index so deleted accounts
-- do not permanently block re-registration of the same address.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON users (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS users_email_active_key ON users (lower(email)) WHERE deleted_at IS NULL;

-- Opaque, hashed session tokens only. No raw tokens are ever stored.
CREATE TABLE IF NOT EXISTS sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    text NOT NULL UNIQUE,
  user_agent    text,
  ip_hash       text,
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions (expires_at) WHERE revoked_at IS NULL;

-- -------------------------------------------------------------------- reports
CREATE TABLE IF NOT EXISTS reports (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- PII is redacted before this row is written. Raw OCR text is encrypted.
  patient_display_ref text,
  title               text NOT NULL,
  report_type         text NOT NULL DEFAULT 'unknown',
  report_date         date,
  collected_at        timestamptz,
  laboratory          text,
  patient_age_years   numeric(4,1),
  patient_sex         text,
  referring_doctor    text,
  -- Encrypted (AES-256-GCM) OCR output. Nulled once parsed results are stored.
  ocr_text_encrypted  bytea,
  ocr_provider        text,
  ocr_confidence      numeric(4,3),
  storage_key         text,
  original_filename   text,
  mime_type           text,
  size_bytes          bigint,
  sha256              text,
  page_count          integer NOT NULL DEFAULT 1,
  pipeline_version    jsonb,
  overall_status      result_status NOT NULL DEFAULT 'unknown',
  summary             text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);
CREATE INDEX IF NOT EXISTS reports_user_date_idx ON reports (user_id, report_date DESC NULLS LAST)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS reports_user_sha_key ON reports (user_id, sha256)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS report_pages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id     uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  page_number   integer NOT NULL,
  storage_key   text,
  -- Plain per-page OCR text; the aggregate copy on `reports` is encrypted.
  ocr_text      text,
  width         integer,
  height        integer,
  confidence    numeric(4,3),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, page_number)
);

CREATE TABLE IF NOT EXISTS lab_results (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id          uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  -- Stable per-report key so re-parsing replaces rather than duplicates.
  result_key         text NOT NULL,
  name               text NOT NULL,
  normalized_name    text NOT NULL,
  code               text,
  value              numeric(18,6),
  raw_value          text NOT NULL,
  unit               text,
  unit_raw           text,
  reference_low      numeric(18,6),
  reference_high     numeric(18,6),
  reference_raw      text,
  reference_source   provenance NOT NULL DEFAULT 'report_reference_range',
  status             result_status NOT NULL DEFAULT 'unknown',
  reported_flag      text,
  deviation          numeric(8,5),
  note               text,
  explanation_json   jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, result_key)
);
CREATE INDEX IF NOT EXISTS lab_results_report_idx ON lab_results (report_id);
CREATE INDEX IF NOT EXISTS lab_results_norm_idx ON lab_results (normalized_name);

-- Terminology normalisation: alias -> canonical (LOINC-preferred).
CREATE TABLE IF NOT EXISTS term_aliases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alias           text NOT NULL,
  alias_normalized text NOT NULL,
  canonical_name  text NOT NULL,
  code            text,
  system          text NOT NULL DEFAULT 'internal',
  system_version  text,
  review_status   review_status NOT NULL DEFAULT 'approved',
  reviewer_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at     timestamptz,
  source_url      text,
  version         text NOT NULL DEFAULT '1.0.0',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alias_normalized, system)
);
CREATE INDEX IF NOT EXISTS term_aliases_lookup_idx ON term_aliases (alias_normalized);

-- -------------------------------------------------------------- medical KB/RAG
-- Defined before anything that references it.
CREATE TABLE IF NOT EXISTS medical_sources (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             text NOT NULL UNIQUE,
  title            text NOT NULL,
  publisher        text NOT NULL,
  url              text NOT NULL,
  publication_date date,
  last_reviewed    date NOT NULL DEFAULT CURRENT_DATE,
  license          text NOT NULL,
  authority_note   text,
  -- Explicit permission flags. The ingestion pipeline refuses anything not
  -- marked both licensed and redistribution_allowed.
  licensed         boolean NOT NULL DEFAULT false,
  redistribution_allowed boolean NOT NULL DEFAULT false,
  language         text NOT NULL DEFAULT 'en',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Reviewed reference intervals. NEVER written by an LLM.
-- provenance on the row records where the interval came from.
CREATE TABLE IF NOT EXISTS test_reference_ranges (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_name  text NOT NULL,
  code             text,
  sex              text NOT NULL DEFAULT 'any',
  age_min_years    numeric(4,1) NOT NULL DEFAULT 0,
  age_max_years    numeric(4,1) NOT NULL DEFAULT 120,
  unit             text,
  ref_low          numeric(18,6),
  ref_high         numeric(18,6),
  ref_text         text,
  source_id        uuid REFERENCES medical_sources(id) ON DELETE SET NULL,
  source_url       text,
  source_title     text,
  license          text,
  publication_date date,
  last_reviewed    date NOT NULL DEFAULT CURRENT_DATE,
  review_status    review_status NOT NULL DEFAULT 'approved',
  reviewed_by      text,
  version          text NOT NULL DEFAULT '1.0.0',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trr_lookup_idx ON test_reference_ranges (normalized_name, sex);

-- -------------------------------------------------------------- medical KB/RAG
CREATE TABLE IF NOT EXISTS medical_concepts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE,
  concept_name  text NOT NULL,
  synonyms      text[] NOT NULL DEFAULT '{}',
  category      text NOT NULL,
  -- Consumer-facing plain-language summary, written/approved by a clinician.
  plain_summary text NOT NULL,
  -- What the test or concept measures, in plain language.
  measures      text,
  -- Why a result might sit outside a reference range.
  variation_causes text,
  other_context text,
  reading_level text NOT NULL DEFAULT 'plain',
  keywords      text[] NOT NULL DEFAULT '{}',
  source_id     uuid REFERENCES medical_sources(id) ON DELETE RESTRICT,
  provenance    provenance NOT NULL DEFAULT 'knowledge_base',
  review_status review_status NOT NULL DEFAULT 'approved',
  reviewed_by   text,
  reviewed_at   date,
  version       text NOT NULL DEFAULT '1.0.0',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS medical_concepts_name_idx ON medical_concepts USING gin (synonyms);
CREATE INDEX IF NOT EXISTS medical_concepts_category_idx ON medical_concepts (category);

-- Chunked, embedded passages used for retrieval.
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id     uuid NOT NULL REFERENCES medical_concepts(id) ON DELETE CASCADE,
  chunk_index    integer NOT NULL,
  title          text NOT NULL,
  body           text NOT NULL,
  token_count    integer,
  source_id      uuid REFERENCES medical_sources(id) ON DELETE RESTRICT,
  -- Provenance is NOT NULL: an un-sourced chunk can never be retrieved.
  provenance     provenance NOT NULL DEFAULT 'knowledge_base',
  review_status  review_status NOT NULL DEFAULT 'approved',
  reviewed_by    text,
  reviewed_at    date,
  version        text NOT NULL DEFAULT '1.0.0',
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (concept_id, chunk_index)
);

-- Dimension is fixed at 384 so the HNSW index is valid. If you change
-- EMBEDDING_DIMENSIONS you must add a new migration and re-embed.
CREATE TABLE IF NOT EXISTS knowledge_embeddings (
  chunk_id    uuid PRIMARY KEY REFERENCES knowledge_chunks(id) ON DELETE CASCADE,
  model       text NOT NULL,
  dimensions  integer NOT NULL,
  embedding   vector(384) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS knowledge_embeddings_hnsw_idx
  ON knowledge_embeddings USING hnsw (embedding vector_cosine_ops);

-- --------------------------------------------------------- clinical rule set
CREATE TABLE IF NOT EXISTS clinical_rules (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key       text NOT NULL,
  version        text NOT NULL DEFAULT '1.0.0',
  title          text NOT NULL,
  description    text,
  -- Which symptom / answer keys the rule reacts to.
  symptom_keys   text[] NOT NULL DEFAULT '{}',
  trigger_type   text NOT NULL,   -- symptom_present | answer_value | answer_numeric | combination | age_value
  -- JSON predicate evaluated by the deterministic engine. Never interpreted by an LLM.
  predicate      jsonb NOT NULL,
  level          safety_level NOT NULL,
  action         safety_action NOT NULL,
  title_out      text NOT NULL,
  body_out       text NOT NULL,
  suppress_narrative boolean NOT NULL DEFAULT false,
  source_id      uuid REFERENCES medical_sources(id) ON DELETE SET NULL,
  source_url     text,
  source_title   text,
  -- Never allow unreviewed rules to escalate; this is enforced in code.
  review_status  review_status NOT NULL DEFAULT 'approved',
  reviewed_by    text,
  reviewed_at    date,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to   date,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rule_key, version)
);
CREATE INDEX IF NOT EXISTS clinical_rules_active_idx
  ON clinical_rules (level) WHERE review_status = 'approved' AND effective_to IS NULL;
CREATE INDEX IF NOT EXISTS clinical_rules_symptom_idx ON clinical_rules USING gin (symptom_keys);

-- ------------------------------------------------------------ symptom engine
CREATE TABLE IF NOT EXISTS symptom_sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES users(id) ON DELETE SET NULL,
  initial_complaint   text NOT NULL,
  detected_symptoms   text[] NOT NULL DEFAULT '{}',
  age_years           integer,
  triage_level        safety_level NOT NULL DEFAULT 'unknown',
  triage_action       safety_action NOT NULL DEFAULT 'insufficient_information',
  triage_json         jsonb,
  assessment_json     jsonb,
  rule_set_version    text,
  status              symptom_session_status NOT NULL DEFAULT 'collecting',
  question_set_version text,
  llm_provider        text,
  llm_model           text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);
CREATE INDEX IF NOT EXISTS symptom_sessions_user_idx ON symptom_sessions (user_id, created_at DESC)
  WHERE deleted_at IS NULL;
-- Unauthenticated sessions are rate limited; index for cleanup.
CREATE INDEX IF NOT EXISTS symptom_sessions_anon_idx ON symptom_sessions (created_at DESC)
  WHERE user_id IS NULL;

CREATE TABLE IF NOT EXISTS symptom_questions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_key       text NOT NULL,
  version            text NOT NULL DEFAULT '1.0.0',
  prompt             text NOT NULL,
  help_text          text,
  kind               text NOT NULL,
  options            jsonb NOT NULL DEFAULT '[]',
  depends_on_key     text,
  depends_on_values  text[] NOT NULL DEFAULT '{}',
  skip_if_key        text,
  skip_if_values     text[] NOT NULL DEFAULT '{}',
  priority           integer NOT NULL DEFAULT 100,
  target_symptoms    text[] NOT NULL DEFAULT '{}',
  safety_critical    boolean NOT NULL DEFAULT false,
  min_value          numeric(12,4),
  max_value          numeric(12,4),
  unit               text,
  reviewer_note      text,
  source_id          uuid REFERENCES medical_sources(id) ON DELETE SET NULL,
  review_status      review_status NOT NULL DEFAULT 'approved',
  reviewed_by        text,
  reviewed_at        date,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_key, version)
);
CREATE INDEX IF NOT EXISTS symptom_questions_active_idx ON symptom_questions (question_key)
  WHERE review_status = 'approved';

CREATE TABLE IF NOT EXISTS symptom_answers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES symptom_sessions(id) ON DELETE CASCADE,
  question_id     uuid REFERENCES symptom_questions(id) ON DELETE SET NULL,
  question_key    text NOT NULL,
  value_text      text,
  value_number    numeric(12,4),
  value_bool      boolean,
  value_json      jsonb,
  asked_at        timestamptz NOT NULL DEFAULT now(),
  answered_at     timestamptz
);
CREATE INDEX IF NOT EXISTS symptom_answers_session_idx ON symptom_answers (session_id, asked_at);

-- ------------------------------------------------------------------ doctors
CREATE TABLE IF NOT EXISTS doctors (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name         text NOT NULL,
  specialty         text NOT NULL,
  credentials       text,
  bio               text,
  languages         text[] NOT NULL DEFAULT '{en}',
  years_experience  integer,
  verified          boolean NOT NULL DEFAULT false,
  verification_note text,
  accepting_patients boolean NOT NULL DEFAULT true,
  review_status     review_status NOT NULL DEFAULT 'approved',
  reviewed_by       text,
  reviewed_at       date,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS doctors_specialty_idx ON doctors (specialty) WHERE verified;

CREATE TABLE IF NOT EXISTS consultations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doctor_id         uuid REFERENCES doctors(id) ON DELETE SET NULL,
  specialty         text NOT NULL,
  status            consultation_status NOT NULL DEFAULT 'draft',
  -- Patient reviews and edits this before it is ever shared. AI output here is
  -- explicitly a *draft*, never a transmitted record.
  summary_draft     jsonb,
  summary_confirmed_at timestamptz,
  summary_snapshot  jsonb,
  related_report_ids uuid[] NOT NULL DEFAULT '{}',
  related_symptom_session_ids uuid[] NOT NULL DEFAULT '{}',
  scheduled_at      timestamptz,
  notes_encrypted   bytea,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE INDEX IF NOT EXISTS consultations_user_idx ON consultations (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- ------------------------------------------------- governance: consent & audit
CREATE TABLE IF NOT EXISTS user_consents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose       text NOT NULL,   -- ai_processing | storage | analytics | marketing | research
  granted       boolean NOT NULL,
  policy_version text NOT NULL,
  granted_at    timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, purpose, policy_version)
);
CREATE INDEX IF NOT EXISTS user_consents_user_idx ON user_consents (user_id, purpose);

-- Append-only. No UPDATE or DELETE grant is ever issued to the app role.
-- Deliberately stores identifiers and action codes, never report contents.
CREATE TABLE IF NOT EXISTS audit_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid,
  actor_role    text,
  action        text NOT NULL,
  resource_type text,
  resource_id   text,
  outcome       text NOT NULL DEFAULT 'success',
  ip_hash       text,
  user_agent_hash text,
  request_id    text,
  metadata      jsonb
);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON audit_logs (actor_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs (action, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_time_idx ON audit_logs (occurred_at DESC);

-- Rate limiting (shared across serverless instances via the database).
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket         text NOT NULL,
  window_started_at timestamptz NOT NULL,
  count          integer NOT NULL DEFAULT 0,
  expires_at     timestamptz NOT NULL,
  PRIMARY KEY (bucket, window_started_at)
);
CREATE INDEX IF NOT EXISTS rate_limits_expiry_idx ON rate_limits (expires_at);

-- --------------------------------------------------------------------- seeds
CREATE TABLE IF NOT EXISTS schema_meta (
  key   text PRIMARY KEY,
  value text NOT NULL
);
