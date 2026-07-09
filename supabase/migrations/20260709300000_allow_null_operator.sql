-- ============================================================
-- 20260709300000_allow_null_operator.sql
-- Alters contact_assignments.operator_id column to allow NULL
-- so that operators can be safely removed while preserving
-- assignment history.
-- ============================================================

-- Drop NOT NULL constraint on operator_id column
ALTER TABLE contact_assignments ALTER COLUMN operator_id DROP NOT NULL;
