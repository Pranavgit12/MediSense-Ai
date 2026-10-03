-- =============================================================================
-- MediSense :: 002_otp_login
--
-- Superseded by 005. Sign-in was removed, so nothing reads `login_codes` any
-- more and 005 drops the table. The two column changes below are still load
-- bearing and are kept for that reason:
--
--   - `password_hash` accepts NULL, because the local profile has no credential.
--   - `auth_method` exists, so a profile can record 'local' rather than claiming
--     a password it does not have.
--
-- The file is not deleted, because it is already recorded as applied in existing
-- databases and its ledger entry is keyed on the filename.
-- =============================================================================

-- An account with no credential has no password, so the column has to accept NULL.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Records which credential actually authenticated the account. 'local' means none
-- did, which is what every request now resolves to.
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_method text NOT NULL DEFAULT 'password';
