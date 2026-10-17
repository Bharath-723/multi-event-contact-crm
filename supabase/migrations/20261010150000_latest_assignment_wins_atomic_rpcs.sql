-- ============================================================
-- 20261010150000_latest_assignment_wins_atomic_rpcs.sql
-- Atomic Latest-Assignment-Wins RPCs with Concurrency-Safe
-- Capacity Enforcement, Female Exclusion, and Audit Preservation
-- ============================================================

BEGIN;

-- ─── 1. DROP previous versions of assign_contact_atomic ──────────────────────
DROP FUNCTION IF EXISTS public.assign_contact_atomic(UUID, UUID, TEXT, UUID, INTEGER);
DROP FUNCTION IF EXISTS public.assign_contact_atomic(UUID, UUID, TEXT, UUID, INTEGER, BOOLEAN);

-- ─── 2. CREATE updated assign_contact_atomic ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.assign_contact_atomic(
    p_contact_id     UUID,                -- registration_id OR feedback_contact_id
    p_operator_id    UUID,                -- operator to assign to
    p_source         TEXT,                -- 'rathayatra' | 'krishnashtami' | 'feedback_contacts'
    p_assigned_by    UUID DEFAULT NULL,   -- admin UUID (nullable)
    p_max_capacity   INTEGER DEFAULT 40,
    p_allow_reassign BOOLEAN DEFAULT FALSE -- DEFAULT FALSE per safety invariant
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_assign_table   TEXT;
    v_reg_table      TEXT;
    v_fk_col         TEXT;
    v_op_active      BOOLEAN;
    v_contact_gender TEXT;
    v_active_count   INTEGER;
    v_existing_id    UUID;
    v_existing_op_id UUID;
    v_new_id         UUID;
    v_sql            TEXT;
BEGIN
    -- 1. Resolve table, registration table, and FK column from p_source
    CASE p_source
        WHEN 'krishnashtami' THEN
            v_assign_table := 'krishnashtami_contact_assignments';
            v_reg_table    := 'krishnashtami_registrations';
            v_fk_col       := 'registration_id';
        WHEN 'feedback_contacts', 'feedback' THEN
            v_assign_table := 'feedback_contact_assignments';
            v_reg_table    := 'feedback_contacts';
            v_fk_col       := 'feedback_contact_id';
        ELSE -- rathayatra (default)
            v_assign_table := 'contact_assignments';
            v_reg_table    := 'registrations';
            v_fk_col       := 'registration_id';
    END CASE;

    -- 2. Acquire transaction-level advisory locks to serialize concurrent operations
    -- Lock on contact FIRST to serialize concurrent assignments for this specific contact
    PERFORM pg_advisory_xact_lock(hashtext('contact:' || p_source || ':' || p_contact_id::TEXT));
    -- Lock on operator SECOND to serialize capacity checks for this operator in this source
    PERFORM pg_advisory_xact_lock(hashtext('operator:' || p_source || ':' || p_operator_id::TEXT));

    -- 3. Check contact existence and enforce gender restriction (Female contacts excluded)
    v_sql := format('SELECT gender FROM %I WHERE id = $1', v_reg_table);
    EXECUTE v_sql INTO v_contact_gender USING p_contact_id;

    IF v_contact_gender IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code',    'CONTACT_NOT_FOUND',
            'message', 'Contact not found in source registration table'
        );
    END IF;

    IF LOWER(TRIM(v_contact_gender)) IN ('female', 'f') THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code',    'GENDER_INELIGIBLE',
            'message', 'Female contacts are not eligible for operator assignment.'
        );
    END IF;

    -- 4. Verify operator exists and is active
    SELECT is_active INTO v_op_active
    FROM public.contact_operators
    WHERE id = p_operator_id;

    IF v_op_active IS NULL OR NOT v_op_active THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code',    'OPERATOR_DISABLED',
            'message', 'Operator not found or is currently disabled'
        );
    END IF;

    -- 5. Query current active assignment for this contact
    v_sql := format(
        'SELECT id, operator_id FROM %I WHERE %I = $1 AND is_active = TRUE FOR UPDATE',
        v_assign_table, v_fk_col
    );
    EXECUTE v_sql INTO v_existing_id, v_existing_op_id USING p_contact_id;

    -- 6. Idempotency guard: if already assigned to requested operator, return existing assignment
    IF v_existing_id IS NOT NULL AND v_existing_op_id = p_operator_id THEN
        RETURN jsonb_build_object(
            'success',        TRUE,
            'code',           'ALREADY_ASSIGNED',
            'status',         'already_assigned',
            'message',        'Already assigned to this operator',
            'assignment_id',  v_existing_id,
            'operator_id',    p_operator_id,
            'contact_id',     p_contact_id,
            'source',         p_source
        );
    END IF;

    -- 7. If contact is already assigned to another operator and reassignment is not permitted:
    IF v_existing_id IS NOT NULL AND NOT p_allow_reassign THEN
        RETURN jsonb_build_object(
            'success',                FALSE,
            'code',                   'CONTACT_ALREADY_ASSIGNED',
            'message',                'This contact already has an active assignment.',
            'existing_assignment_id', v_existing_id,
            'existing_operator_id',   v_existing_op_id
        );
    END IF;

    -- 8. Capacity Check: verify target operator active count < max_capacity
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

    -- 9. Latest-Assignment-Wins State Transition:
    -- Deactivate the previous active assignment (preserving the row and audit history)
    IF v_existing_id IS NOT NULL THEN
        v_sql := format(
            'UPDATE %I SET is_active = FALSE, updated_at = now() WHERE id = $1',
            v_assign_table
        );
        EXECUTE v_sql USING v_existing_id;
    END IF;

    -- 10. Insert new active assignment row
    IF p_source IN ('feedback_contacts', 'feedback') THEN
        v_sql := format(
            'INSERT INTO %I (%I, operator_id, assigned_by, status, is_active, assigned_at, updated_at)
             VALUES ($1, $2, $3, ''Assigned'', TRUE, now(), now())
             RETURNING id',
            v_assign_table, v_fk_col
        );
    ELSE
        v_sql := format(
            'INSERT INTO %I (%I, operator_id, assigned_by, status, is_active, assigned_at, updated_at)
             VALUES ($1, $2, $3, ''Pending'', TRUE, now(), now())
             RETURNING id',
            v_assign_table, v_fk_col
        );
    END IF;

    EXECUTE v_sql INTO v_new_id USING p_contact_id, p_operator_id, p_assigned_by;

    -- 11. Return success payload
    RETURN jsonb_build_object(
        'success',        TRUE,
        'code',           CASE WHEN v_existing_id IS NOT NULL THEN 'REASSIGNED' ELSE 'ASSIGNED' END,
        'status',         CASE WHEN v_existing_id IS NOT NULL THEN 'reassigned' ELSE 'assigned' END,
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
            'code',    'CONCURRENT_ASSIGNMENT_CONFLICT',
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

-- Secure Permissions: service_role ONLY (Direct client-side execution blocked for anon and authenticated)
REVOKE EXECUTE ON FUNCTION public.assign_contact_atomic(UUID, UUID, TEXT, UUID, INTEGER, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_contact_atomic(UUID, UUID, TEXT, UUID, INTEGER, BOOLEAN) TO service_role;


-- ─── 3. DROP & RECREATE assign_master_contact_atomic ─────────────────────────
DROP FUNCTION IF EXISTS public.assign_master_contact_atomic(uuid, uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.assign_master_contact_atomic(uuid, uuid, uuid, integer, boolean);

CREATE OR REPLACE FUNCTION public.assign_master_contact_atomic(
    p_master_contact_id uuid,
    p_operator_id       uuid,
    p_assigned_by       uuid DEFAULT NULL,
    p_max_capacity      integer DEFAULT 40,
    p_allow_reassign    boolean DEFAULT FALSE -- DEFAULT FALSE per safety invariant
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_current_count         integer;
    v_existing_active_id    uuid;
    v_existing_operator_id  uuid;
    v_op_active             boolean;
    v_contact_gender        text;
    v_new_id                uuid;
BEGIN
    -- 1. Acquire transaction-level advisory locks to serialize concurrent operations
    -- Lock on contact FIRST to serialize concurrent assignments for this specific contact
    PERFORM pg_advisory_xact_lock(hashtext('contact:master_dashboard:' || p_master_contact_id::TEXT));
    -- Lock on operator SECOND to serialize capacity checks for this operator in master_dashboard
    PERFORM pg_advisory_xact_lock(hashtext('operator:master_dashboard:' || p_operator_id::TEXT));

    -- 2. Verify master contact exists and fetch gender
    SELECT gender INTO v_contact_gender
    FROM public.master_contacts
    WHERE id = p_master_contact_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'code',    'CONTACT_NOT_FOUND',
            'message', 'Master contact not found'
        );
    END IF;

    -- 3. Gender restriction guard: female contacts must remain excluded across all paths
    IF LOWER(TRIM(COALESCE(v_contact_gender, ''))) IN ('female', 'f') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code',    'GENDER_INELIGIBLE',
            'message', 'Female contacts are not eligible for operator assignment.'
        );
    END IF;

    -- 4. Verify operator exists and is active
    SELECT is_active INTO v_op_active
    FROM public.contact_operators
    WHERE id = p_operator_id;

    IF v_op_active IS NULL OR NOT v_op_active THEN
        RETURN jsonb_build_object(
            'success', false,
            'code',    'OPERATOR_DISABLED',
            'message', 'Operator not found or is disabled'
        );
    END IF;

    -- 5. Find existing active assignment for this master contact
    SELECT id, operator_id INTO v_existing_active_id, v_existing_operator_id
    FROM public.master_contact_assignments
    WHERE master_contact_id = p_master_contact_id AND is_active = true
    FOR UPDATE;

    -- 6. Idempotent check: if already assigned to requested operator, return existing assignment
    IF v_existing_active_id IS NOT NULL AND v_existing_operator_id = p_operator_id THEN
        RETURN jsonb_build_object(
            'success',       true,
            'code',          'ALREADY_ASSIGNED',
            'status',        'already_assigned',
            'message',       'Already assigned to this operator',
            'assignment_id', v_existing_active_id,
            'operator_id',   p_operator_id
        );
    END IF;

    -- 7. If contact is already assigned to another operator and reassignment is not permitted:
    IF v_existing_active_id IS NOT NULL AND NOT p_allow_reassign THEN
        RETURN jsonb_build_object(
            'success',                false,
            'code',                   'CONTACT_ALREADY_ASSIGNED',
            'message',                'Contact is already actively assigned to another operator.',
            'existing_assignment_id', v_existing_active_id,
            'existing_operator_id',   v_existing_operator_id
        );
    END IF;

    -- 8. Count current active assignments for target operator in master_contact_assignments
    SELECT count(*) INTO v_current_count
    FROM public.master_contact_assignments
    WHERE operator_id = p_operator_id AND is_active = true;

    -- 9. CHECK CAPACITY BEFORE MAKING ANY MODIFICATION (Old assignment preserved if capacity full)
    IF v_current_count >= p_max_capacity THEN
        RETURN jsonb_build_object(
            'success',       false,
            'code',          'OPERATOR_CAPACITY_EXCEEDED',
            'message',       format('Operator capacity limit reached (Max %s)', p_max_capacity),
            'current_count', v_current_count,
            'max_capacity',  p_max_capacity
        );
    END IF;

    -- 10. Latest-Assignment-Wins: Deactivate previous active assignment, preserving row history
    IF v_existing_active_id IS NOT NULL THEN
        UPDATE public.master_contact_assignments
        SET is_active = false, updated_at = now()
        WHERE id = v_existing_active_id;
    END IF;

    -- 11. Insert new active assignment
    INSERT INTO public.master_contact_assignments (
        master_contact_id, operator_id, is_active, status, assigned_at, updated_at, assigned_by
    ) VALUES (
        p_master_contact_id, p_operator_id, true, 'assigned', now(), now(), p_assigned_by
    )
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success',       true,
        'code',          CASE WHEN v_existing_active_id IS NOT NULL THEN 'REASSIGNED' ELSE 'ASSIGNED' END,
        'status',        CASE WHEN v_existing_active_id IS NOT NULL THEN 'reassigned' ELSE 'assigned' END,
        'message',       'Assigned successfully',
        'assignment_id', v_new_id,
        'operator_id',   p_operator_id
    );

EXCEPTION
    WHEN unique_violation THEN
        RETURN jsonb_build_object(
            'success', false,
            'code',    'CONCURRENT_ASSIGNMENT_CONFLICT',
            'message', 'Concurrent assignment conflict — contact was assigned by another request.'
        );
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'code',    'INTERNAL_ERROR',
            'message', SQLERRM,
            'sqlstate', SQLSTATE
        );
END;
$$;

-- Secure Permissions: service_role ONLY (Direct client-side execution blocked for anon and authenticated)
REVOKE EXECUTE ON FUNCTION public.assign_master_contact_atomic(uuid, uuid, uuid, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_master_contact_atomic(uuid, uuid, uuid, integer, boolean) TO service_role;

COMMIT;
