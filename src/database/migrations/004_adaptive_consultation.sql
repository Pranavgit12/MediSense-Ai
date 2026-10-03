-- =============================================================================
-- MediSense :: 004_adaptive_consultation
--
-- Two additions to symptom_sessions, both driven by the adaptive questionnaire:
--
--   1. `sex` - the adaptive engine branches on sex (pregnancy gating, age- and
--      sex-specific thresholds), so it has to be stored rather than re-derived
--      from free text on every request. Same sensitivity class as `age_years`.
--
--   2. `adaptive_json` - the audit trail for question selection. The engine
--      decides what to ask, what to skip and when to stop; without a record of
--      those decisions a reviewer cannot tell an intentionally skipped question
--      from a bug. Stores the graph version, the facts seeded from the opening
--      free text, and the last selection decision.
--
-- Both are additive with defaults, so existing rows stay valid and no rewrite
-- of the (large) symptom_sessions table is required.
-- =============================================================================

ALTER TABLE symptom_sessions ADD COLUMN IF NOT EXISTS sex text;
ALTER TABLE symptom_sessions ADD COLUMN IF NOT EXISTS adaptive_json jsonb;

COMMENT ON COLUMN symptom_sessions.sex IS
  'Self-reported sex used for adaptive branching and medicine safety gates: female | male | other | prefer_not_to_say | null.';

COMMENT ON COLUMN symptom_sessions.adaptive_json IS
  'Adaptive engine audit trail: graph version, facts seeded from the opening free text, topics already covered, and skip reasons for questions not asked.';
