-- ============================================================================
-- Migration: 20261017000005_fix_master_assignment_assigned_by_column.sql
-- Description: Hotfix for public.assign_master_contact_atomic.
--
-- Rationale:
--   1. public.master_contact_assignments schema does NOT have an assigned_by column
--      (verified via information_schema.columns: id, master_contact_id, operator_id,
--       is_active, status, comments, assigned_at, updated_at).
--   2. The 5-argument assign_master_contact_atomic RPC mistakenly attempted to INSERT
--      into assigned_by, causing "column 'assigned_by' of relation 'master_contact_assignments' does not exist".
--   3. This hotfix corrects the INSERT statement to target authentic schema columns
--      (master_contact_id, operator_id, is_active, status, assigned_at, updated_at).
--   4. Preserves and strengthens all security invariants:
--      - Fail-closed male-only gender eligibility verification.
--      - Dual transaction-level advisory locking (contact FIRST, operator SECOND).
--      - Strict hard ceiling of 40 active assignments per operator enforced via
--        LEAST(COALESCE(p_max_capacity, 40), 40), preventing bypass via large arguments.
--      - Self-exclusion on same-operator reassignment when counting active workload.
--      - Full assignment history preservation (is_active = false, zero row deletions).
--      - search_path = public, pg_temp with fully schema-qualified tables.
--      - Sanitized error handling in WHEN OTHERS (avoids leaking schema/SQLERRM internals).
--      - Restricted EXECUTE permissions to service_role and owner (postgres).
-- ============================================================================

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
    v_hard_cap_ceiling      CONSTANT integer := 40;
    v_effective_capacity    integer;
    v_current_count         integer;
    v_existing_active_id    uuid;
    v_existing_operator_id  uuid;
    v_op_active             boolean;
    v_contact_gender        text;
    v_new_id                uuid;
BEGIN
    -- 1. Enforce strict capacity bounds: hard ceiling of 40 cannot be bypassed by client argument
    IF p_max_capacity IS NULL OR p_max_capacity <= 0 OR p_max_capacity > v_hard_cap_ceiling THEN
        v_effective_capacity := v_hard_cap_ceiling;
    ELSE
        v_effective_capacity := p_max_capacity;
    END IF;

    -- 2. Acquire transaction-level advisory locks in deterministic order
    -- Lock Contact FIRST, then Operator SECOND to prevent deadlocks across concurrent requests
    PERFORM pg_advisory_xact_lock(hashtext('contact:master_dashboard:' || p_master_contact_id::TEXT));
    PERFORM pg_advisory_xact_lock(hashtext('operator:master_dashboard:' || p_operator_id::TEXT));

    -- 3. Verify master contact exists and fetch gender directly from authoritative record
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

    -- 4. Strict fail-closed gender restriction: ONLY confirmed male contacts are eligible.
    -- Female, missing (NULL), empty, whitespace-only, or unrecognized gender values are strictly rejected.
    IF LOWER(TRIM(COALESCE(v_contact_gender, ''))) NOT IN ('male', 'm') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code',    'GENDER_INELIGIBLE',
            'message', 'Contact is not eligible for operator assignment (only confirmed male contacts may be assigned).'
        );
    END IF;

    -- 5. Verify operator exists and is active with explicit row lock FOR UPDATE
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

    -- 6. Find and lock existing active assignment for this master contact
    SELECT id, operator_id INTO v_existing_active_id, v_existing_operator_id
    FROM public.master_contact_assignments
    WHERE master_contact_id = p_master_contact_id AND is_active = true
    FOR UPDATE;

    -- 7. Idempotency guard: if already actively assigned to requested operator and reassignment not requested
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

    -- 8. If contact is already assigned to another operator and reassignment is not permitted:
    IF v_existing_active_id IS NOT NULL AND v_existing_operator_id <> p_operator_id AND NOT p_allow_reassign THEN
        RETURN jsonb_build_object(
            'success',                false,
            'code',                   'CONTACT_ALREADY_ASSIGNED',
            'message',                'Contact is already actively assigned to another operator.',
            'existing_assignment_id', v_existing_active_id,
            'existing_operator_id',   v_existing_operator_id
        );
    END IF;

    -- 9. Count current active assignments for target operator in master_contact_assignments.
    -- Crucial: Exclude the contact's existing active assignment if it already belongs to this operator,
    -- because that existing row will be atomically deactivated (net delta = 0 for this operator).
    SELECT count(*) INTO v_current_count
    FROM public.master_contact_assignments
    WHERE operator_id = p_operator_id 
      AND is_active = true
      AND id <> COALESCE(v_existing_active_id, '00000000-0000-0000-0000-000000000000'::uuid);

    -- 10. Check capacity limit BEFORE making any modification
    IF v_current_count >= v_effective_capacity THEN
        RETURN jsonb_build_object(
            'success',       false,
            'code',          'OPERATOR_CAPACITY_EXCEEDED',
            'message',       format('Operator capacity limit reached (Max %s)', v_effective_capacity),
            'current_count', v_current_count,
            'max_capacity',  v_effective_capacity
        );
    END IF;

    -- 11. Deactivate previous active assignment atomically, preserving complete audit history
    IF v_existing_active_id IS NOT NULL THEN
        UPDATE public.master_contact_assignments
        SET is_active = false, updated_at = now()
        WHERE id = v_existing_active_id;
    END IF;

    -- 12. Insert new active assignment targeting authentic schema columns
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
        RAISE WARNING 'assign_master_contact_atomic internal failure: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
        RETURN jsonb_build_object(
            'success', false,
            'code',    'INTERNAL_ERROR',
            'message', 'An internal error occurred during assignment processing.'
        );
END;
$$;

-- Secure Permissions for assign_master_contact_atomic
REVOKE EXECUTE ON FUNCTION public.assign_master_contact_atomic(uuid, uuid, uuid, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_master_contact_atomic(uuid, uuid, uuid, integer, boolean) TO service_role;
