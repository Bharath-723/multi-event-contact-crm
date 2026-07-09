-- ============================================================
-- 20260709100000_add_contact_operators.sql
-- Phase 1: Contact Operator Management System
-- SAFETY: Only ADD new tables, indexes, functions, RLS policies.
--         No existing tables, columns, triggers, or functions modified.
-- ============================================================

-- ============================================================
-- TABLE 1: contact_operators
-- Stores operator credentials managed entirely by admin.
-- Completely separate from Supabase Auth / admins table.
-- ============================================================
CREATE TABLE IF NOT EXISTS contact_operators (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    email           TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    phone           TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 2: contact_assignments
-- Links a registration to a contact operator for calling.
-- Only ONE active assignment per registration at a time.
-- Includes full history via is_active flag on old records.
-- Future-ready: visited, visited_at, visited_by, visit_method
-- ============================================================
CREATE TABLE IF NOT EXISTS contact_assignments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Reference to existing registrations table (read-only join)
    registration_id UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,

    -- Reference to the operator table above
    operator_id     UUID NOT NULL REFERENCES contact_operators(id) ON DELETE RESTRICT,

    -- Which admin assigned this (NULL if system/auto)
    assigned_by     UUID,

    -- Timestamps
    assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    called_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Call workflow status
    -- 'Visited' included now for future Visitor QR Module compatibility
    status          TEXT NOT NULL DEFAULT 'Pending'
                    CHECK (status IN (
                        'Pending',
                        'Called',
                        'Confirmed',
                        'No Answer',
                        'Wrong Number',
                        'Callback Required',
                        'Completed',
                        'Visited'
                    )),

    -- Operator notes / remarks
    remarks         TEXT,

    -- Tracks whether this is the current active assignment.
    -- When reassigned, old record becomes is_active=FALSE (full history kept).
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,

    -- === FUTURE VISITOR QR MODULE FIELDS ===
    -- Nullable now — will be used by the QR scanner module later
    visited         BOOLEAN,
    visited_at      TIMESTAMPTZ,
    visited_by      UUID,
    visit_method    TEXT
);

-- ============================================================
-- INDEXES — For optimized queries
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_contact_operators_email
    ON contact_operators(email);

CREATE INDEX IF NOT EXISTS idx_contact_operators_is_active
    ON contact_operators(is_active);

CREATE INDEX IF NOT EXISTS idx_contact_assignments_registration_id
    ON contact_assignments(registration_id);

CREATE INDEX IF NOT EXISTS idx_contact_assignments_operator_id
    ON contact_assignments(operator_id);

CREATE INDEX IF NOT EXISTS idx_contact_assignments_is_active
    ON contact_assignments(is_active);

CREATE INDEX IF NOT EXISTS idx_contact_assignments_status
    ON contact_assignments(status);

CREATE INDEX IF NOT EXISTS idx_contact_assignments_active_per_registration
    ON contact_assignments(registration_id, is_active)
    WHERE is_active = TRUE;

-- ============================================================
-- TRIGGERS — Auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_contact_operators_updated_at
    BEFORE UPDATE ON contact_operators
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_contact_assignments_updated_at
    BEFORE UPDATE ON contact_assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- FUNCTIONS / RPCs
-- ============================================================

-- Function: Get operator assignment stats (for admin monitoring card)
CREATE OR REPLACE FUNCTION get_operator_stats(p_operator_id UUID)
RETURNS TABLE (
    total_assigned  BIGINT,
    total_pending   BIGINT,
    total_completed BIGINT,
    total_called    BIGINT,
    total_confirmed BIGINT,
    call_success_pct NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)                                                    AS total_assigned,
        COUNT(*) FILTER (WHERE ca.status = 'Pending')              AS total_pending,
        COUNT(*) FILTER (WHERE ca.status = 'Completed')            AS total_completed,
        COUNT(*) FILTER (WHERE ca.status NOT IN ('Pending'))       AS total_called,
        COUNT(*) FILTER (WHERE ca.status = 'Confirmed')            AS total_confirmed,
        CASE
            WHEN COUNT(*) = 0 THEN 0
            ELSE ROUND(
                COUNT(*) FILTER (WHERE ca.status IN ('Confirmed', 'Completed'))::NUMERIC
                / COUNT(*)::NUMERIC * 100, 1
            )
        END                                                         AS call_success_pct
    FROM contact_assignments ca
    WHERE ca.operator_id = p_operator_id
      AND ca.is_active = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Function: Get global summary stats for admin dashboard card
CREATE OR REPLACE FUNCTION get_contact_module_summary()
RETURNS TABLE (
    total_operators     BIGINT,
    active_operators    BIGINT,
    total_assigned      BIGINT,
    total_pending       BIGINT,
    total_completed     BIGINT,
    completion_pct      NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        (SELECT COUNT(*) FROM contact_operators)                    AS total_operators,
        (SELECT COUNT(*) FROM contact_operators WHERE is_active=TRUE) AS active_operators,
        COUNT(*)                                                    AS total_assigned,
        COUNT(*) FILTER (WHERE ca.status = 'Pending')              AS total_pending,
        COUNT(*) FILTER (WHERE ca.status = 'Completed')            AS total_completed,
        CASE
            WHEN COUNT(*) = 0 THEN 0
            ELSE ROUND(
                COUNT(*) FILTER (WHERE ca.status = 'Completed')::NUMERIC
                / COUNT(*)::NUMERIC * 100, 1
            )
        END                                                         AS completion_pct
    FROM contact_assignments ca
    WHERE ca.is_active = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE contact_operators  ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_assignments ENABLE ROW LEVEL SECURITY;

-- contact_operators: only authenticated admins can read/write
CREATE POLICY co_admin_all ON contact_operators
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()));

-- contact_assignments: only authenticated admins can read/write via browser
CREATE POLICY ca_admin_all ON contact_assignments
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()));

-- NOTE: Operator portal API routes use the Supabase SERVICE ROLE key
-- (supabaseAdmin) to bypass RLS server-side, but gate every query behind
-- JWT cookie validation so operators only ever receive their own records.

-- ============================================================
-- AUDIT LOG ENTRIES (operator-specific actions extend existing audit_logs)
-- We reuse the existing audit_logs table to record operator module events.
-- No schema change required — JSONB details column is flexible.
-- ============================================================
-- Example actions stored:
--   OPERATOR_CREATED, OPERATOR_DISABLED, OPERATOR_LOGIN, OPERATOR_LOGOUT
--   ASSIGNMENT_CREATED, ASSIGNMENT_REASSIGNED, ASSIGNMENT_STATUS_UPDATED
--   ASSIGNMENT_REMARKS_UPDATED
