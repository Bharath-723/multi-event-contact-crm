-- ============================================================
-- 20261017000003_enforce_fail_closed_gender_and_concurrency.sql
-- Production Readiness Migration:
-- 1. Fail-closed gender restriction in assign_master_contact_atomic & assign_contact_atomic
--    (Only confirmed male contacts are eligible; female, null, empty, or unknown gender is strictly rejected).
-- 2. Explicit row locking FOR UPDATE on contact_operators to prevent capacity race conditions.
-- 3. Accurate capacity counting during reassignment: when a contact is reassigned to the same operator,
--    the existing assignment being replaced does NOT falsely count towards the operator's maximum capacity cap.
-- 4. Consistent lock-acquisition order across all assignment RPCs to guarantee deadlock freedom.
-- ============================================================

BEGIN;

-- Ensure stub roles exist for non-Supabase test environments
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END $$;

-- ─── 1. Update assign_master_contact_atomic ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.assign_master_contact_atomic(
    p_master_contact_id uuid,
    p_operator_id       uuid,
    p_assigned_by       uuid DEFAULT NULL,
    p_max_capacity      integer DEFAULT 40,
    p_allow_reassign    boolean DEFAULT FALSE
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
    -- 1. Acquire transaction-level advisory locks in deterministic order
    -- Lock Contact FIRST, then Operator SECOND
    PERFORM pg_advisory_xact_lock(hashtext('contact:master_dashboard:' || p_master_contact_id::TEXT));
    PERFORM pg_advisory_xact_lock(hashtext('operator:master_dashboard:' || p_operator_id::TEXT));

    -- 2. Verify master contact exists and fetch gender directly from authoritative record
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

    -- 3. Strict fail-closed gender restriction: ONLY confirmed male contacts are eligible.
    -- Female, missing (NULL), empty, whitespace-only, or unrecognized gender values are strictly rejected.
    IF LOWER(TRIM(COALESCE(v_contact_gender, ''))) NOT IN ('male', 'm') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code',    'GENDER_INELIGIBLE',
            'message', 'Contact is not eligible for operator assignment (only confirmed male contacts may be assigned).'
        );
    END IF;

    -- 4. Verify operator exists and is active with explicit row lock FOR UPDATE
    -- Serializes all concurrent operations targeting this operator
    SELECT is_active INTO v_op_active
    FROM public.contact_operators
    WHERE id = p_operator_id
    FOR UPDATE;

    IF v_op_active IS NULL OR NOT v_op_active THEN
        RETURN jsonb_build_object(
            'success', false,
            'code',    'OPERATOR_DISABLED',
            'message', 'Operator not found or is disabled'
        );
    END IF;

    -- 5. Find and lock existing active assignment for this master contact
    SELECT id, operator_id INTO v_existing_active_id, v_existing_operator_id
    FROM public.master_contact_assignments
    WHERE master_contact_id = p_master_contact_id AND is_active = true
    FOR UPDATE;

    -- 6. Idempotency guard: if already actively assigned to requested operator and reassignment not requested
    IF v_existing_active_id IS NOT NULL AND v_existing_operator_id = p_operator_id AND NOT p_allow_reassign THEN
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
    IF v_existing_active_id IS NOT NULL AND v_existing_operator_id <> p_operator_id AND NOT p_allow_reassign THEN
        RETURN jsonb_build_object(
            'success',                false,
            'code',                   'CONTACT_ALREADY_ASSIGNED',
            'message',                'Contact is already actively assigned to another operator.',
            'existing_assignment_id', v_existing_active_id,
            'existing_operator_id',   v_existing_operator_id
        );
    END IF;

    -- 8. Count current active assignments for target operator in master_contact_assignments.
    -- Crucial: Exclude the contact's existing active assignment if it already belongs to this operator,
    -- because that existing row will be atomically deactivated (net delta = 0 for this operator).
    SELECT count(*) INTO v_current_count
    FROM public.master_contact_assignments
    WHERE operator_id = p_operator_id 
      AND is_active = true
      AND id <> COALESCE(v_existing_active_id, '00000000-0000-0000-0000-000000000000'::uuid);

    -- 9. Check capacity limit BEFORE making any modification
    IF v_current_count >= p_max_capacity THEN
        RETURN jsonb_build_object(
            'success',       false,
            'code',          'OPERATOR_CAPACITY_EXCEEDED',
            'message',       format('Operator capacity limit reached (Max %s)', p_max_capacity),
            'current_count', v_current_count,
            'max_capacity',  p_max_capacity
        );
    END IF;

    -- 10. Deactivate previous active assignment atomically, preserving complete audit history
    IF v_existing_active_id IS NOT NULL THEN
        UPDATE public.master_contact_assignments
        SET is_active = false, updated_at = now()
        WHERE id = v_existing_active_id;
    END IF;

    -- 11. Insert new active assignment
    INSERT INTO public.master_contact_assignments (
        master_contact_id, operator_id, is_active, status, assigned_at, updated_at
    ) VALUES (
        p_master_contact_id, p_operator_id, true, 'assigned', now(), now()
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
            'message', SQLERRM
        );
END;
$$;

-- Secure Permissions for assign_master_contact_atomic
REVOKE EXECUTE ON FUNCTION public.assign_master_contact_atomic(uuid, uuid, uuid, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_master_contact_atomic(uuid, uuid, uuid, integer, boolean) TO service_role;

-- ─── 2. Update assign_contact_atomic for festival tables ─────────────────────
CREATE OR REPLACE FUNCTION public.assign_contact_atomic(
    p_contact_id     UUID,
    p_operator_id    UUID,
    p_source         TEXT,
    p_assigned_by    UUID DEFAULT NULL,
    p_max_capacity   INTEGER DEFAULT 40,
    p_allow_reassign BOOLEAN DEFAULT FALSE
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
    v_contact_exists BOOLEAN;
    v_op_active      BOOLEAN;
    v_contact_gender TEXT;
    v_active_count   INTEGER;
    v_existing_id    UUID;
    v_existing_op_id UUID;
    v_new_id         UUID;
    v_sql            TEXT;
BEGIN
    CASE p_source
        WHEN 'krishnashtami' THEN
            v_assign_table := 'krishnashtami_contact_assignments';
            v_reg_table    := 'krishnashtami_registrations';
            v_fk_col       := 'registration_id';
        WHEN 'feedback_contacts', 'feedback' THEN
            v_assign_table := 'feedback_contact_assignments';
            v_reg_table    := 'feedback_contacts';
            v_fk_col       := 'feedback_contact_id';
        ELSE
            v_assign_table := 'contact_assignments';
            v_reg_table    := 'registrations';
            v_fk_col       := 'registration_id';
    END CASE;

    -- 1. Transaction-level advisory locks in deterministic order
    -- Lock Contact FIRST, then Operator SECOND
    PERFORM pg_advisory_xact_lock(hashtext('contact:' || p_source || ':' || p_contact_id::TEXT));
    PERFORM pg_advisory_xact_lock(hashtext('operator:' || p_source || ':' || p_operator_id::TEXT));

    -- 2. Check contact existence and fetch authoritative gender
    v_sql := format('SELECT true, gender FROM %I WHERE id = $1', v_reg_table);
    EXECUTE v_sql INTO v_contact_exists, v_contact_gender USING p_contact_id;

    IF v_contact_exists IS NULL OR NOT v_contact_exists THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code',    'CONTACT_NOT_FOUND',
            'message', 'Contact not found in source registration table'
        );
    END IF;

    -- 3. Strict fail-closed gender guard: only confirmed male contacts are eligible
    IF LOWER(TRIM(COALESCE(v_contact_gender, ''))) NOT IN ('male', 'm') THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code',    'GENDER_INELIGIBLE',
            'message', 'Contact is not eligible for operator assignment (only confirmed male contacts may be assigned).'
        );
    END IF;

    -- 4. Verify operator exists and is active with explicit row lock FOR UPDATE
    SELECT is_active INTO v_op_active
    FROM public.contact_operators
    WHERE id = p_operator_id
    FOR UPDATE;

    IF v_op_active IS NULL OR NOT v_op_active THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code',    'OPERATOR_DISABLED',
            'message', 'Operator not found or is currently disabled'
        );
    END IF;

    -- 5. Query and lock current active assignment for this contact
    v_sql := format(
        'SELECT id, operator_id FROM %I WHERE %I = $1 AND is_active = TRUE FOR UPDATE',
        v_assign_table, v_fk_col
    );
    EXECUTE v_sql INTO v_existing_id, v_existing_op_id USING p_contact_id;

    -- 6. Idempotency guard: if already assigned to requested operator and reassignment not requested
    IF v_existing_id IS NOT NULL AND v_existing_op_id = p_operator_id AND NOT p_allow_reassign THEN
        RETURN jsonb_build_object(
            'success',       TRUE,
            'code',          'ALREADY_ASSIGNED',
            'status',        'already_assigned',
            'message',       'Already assigned to this operator',
            'assignment_id', v_existing_id,
            'operator_id',   p_operator_id,
            'contact_id',    p_contact_id,
            'source',        p_source
        );
    END IF;

    -- 7. If contact is already assigned to another operator and reassignment is not permitted
    IF v_existing_id IS NOT NULL AND v_existing_op_id <> p_operator_id AND NOT p_allow_reassign THEN
        RETURN jsonb_build_object(
            'success',                FALSE,
            'code',                   'CONTACT_ALREADY_ASSIGNED',
            'message',                'Contact is already actively assigned to another operator.',
            'existing_assignment_id', v_existing_id,
            'existing_operator_id',   v_existing_op_id
        );
    END IF;

    -- 8. Count current active assignments for this operator (excluding the contact's current assignment if replacing)
    v_sql := format(
        'SELECT count(*) FROM %I WHERE operator_id = $1 AND is_active = TRUE AND id <> COALESCE($2, ''00000000-0000-0000-0000-000000000000''::uuid)',
        v_assign_table
    );
    EXECUTE v_sql INTO v_active_count USING p_operator_id, v_existing_id;

    -- 9. Check capacity limit BEFORE making any modification
    IF v_active_count >= p_max_capacity THEN
        RETURN jsonb_build_object(
            'success',       FALSE,
            'code',          'OPERATOR_CAPACITY_EXCEEDED',
            'message',       format('Operator has reached maximum active capacity of %s', p_max_capacity),
            'current_count', v_active_count,
            'max_capacity',  p_max_capacity
        );
    END IF;

    -- 10. Deactivate previous active assignment atomically
    IF v_existing_id IS NOT NULL THEN
        v_sql := format('UPDATE %I SET is_active = FALSE, updated_at = now() WHERE id = $1', v_assign_table);
        EXECUTE v_sql USING v_existing_id;
    END IF;

    -- 11. Insert new active assignment
    v_sql := format(
        'INSERT INTO %I (%I, operator_id, is_active, status, assigned_at, updated_at, assigned_by) ' ||
        'VALUES ($1, $2, TRUE, ''assigned'', now(), now(), $3) RETURNING id',
        v_assign_table, v_fk_col
    );
    EXECUTE v_sql INTO v_new_id USING p_contact_id, p_operator_id, p_assigned_by;

    RETURN jsonb_build_object(
        'success',       TRUE,
        'code',          CASE WHEN v_existing_id IS NOT NULL THEN 'REASSIGNED' ELSE 'ASSIGNED' END,
        'status',        CASE WHEN v_existing_id IS NOT NULL THEN 'reassigned' ELSE 'assigned' END,
        'message',       'Assignment successful',
        'assignment_id', v_new_id,
        'operator_id',   p_operator_id
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
            'message', SQLERRM
        );
END;
$$;

-- Secure Permissions for assign_contact_atomic
REVOKE EXECUTE ON FUNCTION public.assign_contact_atomic(UUID, UUID, TEXT, UUID, INTEGER, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_contact_atomic(UUID, UUID, TEXT, UUID, INTEGER, BOOLEAN) TO service_role;

COMMIT;

