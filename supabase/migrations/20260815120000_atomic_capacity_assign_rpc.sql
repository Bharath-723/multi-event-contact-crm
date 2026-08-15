-- ============================================================
-- 20260815120000_atomic_capacity_assign_rpc.sql
-- Atomic Assignment RPC with Concurrency-Safe Capacity Enforcement
-- ============================================================

BEGIN;

-- ─── DROP previous versions of this function ────────────────────────────────
DROP FUNCTION IF EXISTS public.assign_contact_atomic(UUID, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.assign_contact_atomic(UUID, UUID, TEXT, TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.assign_contact_atomic(UUID, UUID, TEXT, UUID, INTEGER);

-- ─── CREATE assign_contact_atomic RPC ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assign_contact_atomic(
    p_contact_id   UUID,                -- registration_id OR feedback_contact_id
    p_operator_id  UUID,                -- operator to assign to
    p_source       TEXT,                -- 'rathayatra' | 'krishnashtami' | 'feedback_contacts'
    p_assigned_by  UUID DEFAULT NULL,   -- admin UUID (nullable)
    p_max_capacity INTEGER DEFAULT 40
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_assign_table  TEXT;
    v_fk_col        TEXT;
    v_lock_key      BIGINT;
    v_active_count  INTEGER;
    v_existing_id   UUID;
    v_new_id        UUID;
    v_sql           TEXT;
BEGIN
    -- ── 1. Resolve table and FK column from p_source ─────────────────────────
    CASE p_source
        WHEN 'krishnashtami' THEN
            v_assign_table := 'krishnashtami_contact_assignments';
            v_fk_col       := 'registration_id';
        WHEN 'feedback_contacts', 'feedback' THEN
            v_assign_table := 'feedback_contact_assignments';
            v_fk_col       := 'feedback_contact_id';
        ELSE -- rathayatra (default)
            v_assign_table := 'contact_assignments';
            v_fk_col       := 'registration_id';
    END CASE;

    -- ── 2. Acquire a source-scoped advisory lock on operator_id ─────────────
    v_lock_key := hashtext(p_source || ':' || p_operator_id::TEXT);
    PERFORM pg_advisory_xact_lock(v_lock_key);

    -- ── 3. Check if contact already has an active assignment (duplicate guard) 
    v_sql := format(
        'SELECT id FROM %I WHERE %I = $1 AND is_active = TRUE FOR UPDATE',
        v_assign_table, v_fk_col
    );
    EXECUTE v_sql INTO v_existing_id USING p_contact_id;

    IF v_existing_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success',  FALSE,
            'code',     'CONTACT_ALREADY_ASSIGNED',
            'message',  'This contact already has an active assignment.',
            'existing_assignment_id', v_existing_id
        );
    END IF;

    -- ── 4. Re-check operator capacity (live count, inside advisory lock) ─────
    v_sql := format(
        'SELECT COUNT(*) FROM %I WHERE operator_id = $1 AND is_active = TRUE',
        v_assign_table
    );
    EXECUTE v_sql INTO v_active_count USING p_operator_id;

    IF v_active_count >= p_max_capacity THEN
        RETURN jsonb_build_object(
            'success',       FALSE,
            'code',          'OPERATOR_CAPACITY_EXCEEDED',
            'message',       format('Operator has reached maximum capacity of %s active contacts.', p_max_capacity),
            'current_count', v_active_count,
            'max_capacity',  p_max_capacity
        );
    END IF;

    -- ── 5. Insert the new assignment atomically ───────────────────────────────
    IF p_source IN ('feedback_contacts', 'feedback') THEN
        v_sql := format(
            'INSERT INTO %I (%I, operator_id, assigned_by, status, is_active)
             VALUES ($1, $2, $3, ''Assigned'', TRUE)
             RETURNING id',
            v_assign_table, v_fk_col
        );
    ELSE
        v_sql := format(
            'INSERT INTO %I (%I, operator_id, assigned_by, status, is_active)
             VALUES ($1, $2, $3, ''Pending'', TRUE)
             RETURNING id',
            v_assign_table, v_fk_col
        );
    END IF;

    EXECUTE v_sql INTO v_new_id USING p_contact_id, p_operator_id, p_assigned_by;

    -- ── 6. Return success payload ─────────────────────────────────────────────
    RETURN jsonb_build_object(
        'success',        TRUE,
        'code',           'ASSIGNED',
        'assignment_id',  v_new_id,
        'operator_id',    p_operator_id,
        'contact_id',     p_contact_id,
        'source',         p_source,
        'new_count',      v_active_count + 1
    );

EXCEPTION
    WHEN unique_violation THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code',    'CONTACT_ALREADY_ASSIGNED',
            'message', 'Concurrent assignment conflict — contact was assigned by another request.'
        );
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code',    'INTERNAL_ERROR',
            'message', SQLERRM,
            'sqlstate', SQLSTATE
        );
END;
$$;

-- ─── GRANT EXECUTE ───────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.assign_contact_atomic(UUID, UUID, TEXT, UUID, INTEGER)
    TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ─── DATA RECONCILIATION ──────────────────────────────────────────────────────
DO $$
DECLARE
    v_overflow_id UUID := '6b782a36-13d5-4623-8987-4429245ae7a6';
    v_operator_id UUID := '954aaa39-8e34-4d3d-9ec5-fd9268173bca';
    v_current_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_current_count
    FROM contact_assignments
    WHERE operator_id = v_operator_id AND is_active = TRUE;

    IF v_current_count > 40 THEN
        UPDATE contact_assignments
        SET is_active  = FALSE,
            updated_at = NOW()
        WHERE id          = v_overflow_id
          AND operator_id = v_operator_id
          AND is_active   = TRUE;

        INSERT INTO audit_logs (action, details)
        VALUES ('RECONCILIATION_DEACTIVATED', jsonb_build_object(
            'reason',          'operator_overflow_41_over_40',
            'assignment_id',   v_overflow_id,
            'operator_id',     v_operator_id,
            'contact_name',    'HARSHA SRIRAM',
            'registration_id', '06f1b9f7-fe38-43c3-8219-7b35e9e4c922',
            'deactivated_at',  NOW()
        ));

        RAISE NOTICE 'Reconciliation: deactivated overflow assignment % for Akhil. Count was %, now 40.',
            v_overflow_id, v_current_count;
    ELSE
        RAISE NOTICE 'Reconciliation: Akhil count = % (already <= 40). No action taken.', v_current_count;
    END IF;
END;
$$;

COMMIT;
