-- ============================================================
-- 20260710200000_phase3b_status_workflow.sql
-- Phase 3B: Status Workflow Migration
-- Replace 8 old statuses with 4 new statuses.
-- All existing data is safely migrated — no data loss.
-- ============================================================

-- ── STEP 1: Data Migration (before constraint change) ────────────────────────
-- Map old statuses → new statuses

UPDATE contact_assignments SET status = 'Coming'
WHERE status IN ('Completed', 'Confirmed', 'Visited')
  AND is_active = TRUE;

-- Also migrate inactive records for historical consistency
UPDATE contact_assignments SET status = 'Coming'
WHERE status IN ('Completed', 'Confirmed', 'Visited')
  AND is_active = FALSE;

UPDATE contact_assignments SET status = 'Not Coming'
WHERE status = 'Wrong Number'
  AND is_active = TRUE;

UPDATE contact_assignments SET status = 'Not Coming'
WHERE status = 'Wrong Number'
  AND is_active = FALSE;

UPDATE contact_assignments SET status = 'Callback Required'
WHERE status = 'No Answer'
  AND is_active = TRUE;

UPDATE contact_assignments SET status = 'Callback Required'
WHERE status = 'No Answer'
  AND is_active = FALSE;

-- 'Called' → 'Callback Required' (had been called but unknown result)
UPDATE contact_assignments SET status = 'Callback Required'
WHERE status = 'Called'
  AND is_active = TRUE;

UPDATE contact_assignments SET status = 'Callback Required'
WHERE status = 'Called'
  AND is_active = FALSE;

-- ── STEP 2: Replace CHECK constraint ─────────────────────────────────────────
-- Drop old constraint and create new one with 4 values only

ALTER TABLE contact_assignments DROP CONSTRAINT IF EXISTS contact_assignments_status_check;

ALTER TABLE contact_assignments ADD CONSTRAINT contact_assignments_status_check
    CHECK (status IN ('Pending', 'Coming', 'Not Coming', 'Callback Required'));

-- ── STEP 3: Update get_operator_stats RPC ────────────────────────────────────
-- Drop function first to allow changing the return table type/signature
DROP FUNCTION IF EXISTS get_operator_stats(UUID);

CREATE OR REPLACE FUNCTION get_operator_stats(p_operator_id UUID)
RETURNS TABLE (
    total_assigned   BIGINT,
    total_pending    BIGINT,
    total_coming     BIGINT,
    total_not_coming BIGINT,
    total_callback   BIGINT,
    -- Legacy fields retained for backward compat — mapped from new statuses
    total_completed  BIGINT,
    total_called     BIGINT,
    total_confirmed  BIGINT,
    call_success_pct NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)                                                         AS total_assigned,
        COUNT(*) FILTER (WHERE ca.status = 'Pending')                   AS total_pending,
        COUNT(*) FILTER (WHERE ca.status = 'Coming')                    AS total_coming,
        COUNT(*) FILTER (WHERE ca.status = 'Not Coming')                AS total_not_coming,
        COUNT(*) FILTER (WHERE ca.status = 'Callback Required')         AS total_callback,
        -- Legacy: completed = Coming (for backward compat APIs)
        COUNT(*) FILTER (WHERE ca.status = 'Coming')                    AS total_completed,
        -- Legacy: called = anything not Pending
        COUNT(*) FILTER (WHERE ca.status <> 'Pending')                  AS total_called,
        -- Legacy: confirmed = Coming
        COUNT(*) FILTER (WHERE ca.status = 'Coming')                    AS total_confirmed,
        -- Success % = Coming / Total
        CASE
            WHEN COUNT(*) = 0 THEN 0
            ELSE ROUND(
                COUNT(*) FILTER (WHERE ca.status = 'Coming')::NUMERIC
                / COUNT(*)::NUMERIC * 100, 1
            )
        END                                                              AS call_success_pct
    FROM contact_assignments ca
    WHERE ca.operator_id = p_operator_id
      AND ca.is_active = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

ALTER FUNCTION get_operator_stats(UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION get_operator_stats(UUID) TO public;


-- ── STEP 4: Update get_contact_module_summary RPC ────────────────────────────
-- Drop function first to allow changing the return table type/signature
DROP FUNCTION IF EXISTS get_contact_module_summary();

CREATE OR REPLACE FUNCTION get_contact_module_summary()
RETURNS TABLE (
    total_operators  BIGINT,
    active_operators BIGINT,
    total_assigned   BIGINT,
    total_pending    BIGINT,
    total_coming     BIGINT,
    total_not_coming BIGINT,
    -- Legacy fields
    total_completed  BIGINT,
    completion_pct   NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        (SELECT COUNT(*) FROM contact_operators)                         AS total_operators,
        (SELECT COUNT(*) FROM contact_operators WHERE is_active = TRUE)  AS active_operators,
        COUNT(*)                                                         AS total_assigned,
        COUNT(*) FILTER (WHERE ca.status = 'Pending')                   AS total_pending,
        COUNT(*) FILTER (WHERE ca.status = 'Coming')                    AS total_coming,
        COUNT(*) FILTER (WHERE ca.status = 'Not Coming')                AS total_not_coming,
        COUNT(*) FILTER (WHERE ca.status = 'Coming')                    AS total_completed,
        CASE
            WHEN COUNT(*) = 0 THEN 0
            ELSE ROUND(
                COUNT(*) FILTER (WHERE ca.status = 'Coming')::NUMERIC
                / COUNT(*)::NUMERIC * 100, 1
            )
        END                                                              AS completion_pct
    FROM contact_assignments ca
    WHERE ca.is_active = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

ALTER FUNCTION get_contact_module_summary() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION get_contact_module_summary() TO public;

-- ── STEP 5: Add index on new status values for fast filtering ─────────────────
DROP INDEX IF EXISTS idx_contact_assignments_status;
CREATE INDEX IF NOT EXISTS idx_contact_assignments_status
    ON contact_assignments(status)
    WHERE is_active = TRUE;
