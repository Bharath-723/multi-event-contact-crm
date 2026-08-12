-- ============================================================
-- 20260718200000_update_rpc_and_stats_not_coming.sql
-- Update assign_operator_to_registration RPC and get_operator_stats RPC
-- to handle terminal 'Not Coming' workflow (which deactivates the assignment).
-- ============================================================

-- 1. Drop existing functions to allow update
DROP FUNCTION IF EXISTS assign_operator_to_registration(UUID, INTEGER);
DROP FUNCTION IF EXISTS get_operator_stats(UUID);

-- 2. Create updated assign_operator_to_registration function
--    Blocks assignment if registration has ever been marked 'Not Coming'
CREATE OR REPLACE FUNCTION assign_operator_to_registration(
    p_registration_id UUID,
    p_max_contacts INTEGER
)
RETURNS UUID AS $$
DECLARE
    v_chosen_operator_id UUID;
    v_active_count INTEGER;
    v_assignment_id UUID;
BEGIN
    -- Duplicate Protection: Check if the registration already has an active assignment
    IF EXISTS (
        SELECT 1 FROM contact_assignments 
        WHERE registration_id = p_registration_id 
          AND is_active = TRUE
        FOR UPDATE
    ) THEN
        RETURN NULL; -- Already assigned
    END IF;

    -- Block future automatic assignment if registration has ever been marked 'Not Coming'
    IF EXISTS (
        SELECT 1 FROM contact_assignments
        WHERE registration_id = p_registration_id
          AND status = 'Not Coming'
    ) THEN
        RETURN NULL;
    END IF;

    -- Find eligible operator with capacity safety using p_max_contacts
    -- "Not Coming" assignments are inactive (is_active = FALSE) and naturally do not consume capacity.
    SELECT co.id INTO v_chosen_operator_id
    FROM contact_operators co
    LEFT JOIN (
        SELECT operator_id, COUNT(*) AS active_cnt, MAX(assigned_at) AS last_assigned
        FROM contact_assignments
        WHERE is_active = TRUE
        GROUP BY operator_id
    ) stats ON stats.operator_id = co.id
    WHERE co.is_active = TRUE
      AND COALESCE(stats.active_cnt, 0) < p_max_contacts
    ORDER BY 
        COALESCE(stats.active_cnt, 0) ASC, 
        COALESCE(stats.last_assigned, '1970-01-01 00:00:00+00'::TIMESTAMPTZ) ASC, 
        co.created_at ASC
    LIMIT 1
    FOR UPDATE OF co;

    -- If no operator is eligible, return NULL
    IF v_chosen_operator_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Double check the active count
    SELECT COUNT(*) INTO v_active_count
    FROM contact_assignments
    WHERE operator_id = v_chosen_operator_id
      AND is_active = TRUE;

    IF v_active_count >= p_max_contacts THEN
        RETURN NULL; -- Chosen operator is already at capacity
    END IF;

    -- Insert new active assignment
    INSERT INTO contact_assignments (registration_id, operator_id, is_active, status)
    VALUES (p_registration_id, v_chosen_operator_id, TRUE, 'Pending')
    RETURNING id INTO v_assignment_id;

    -- Insert audit log (optional)
    BEGIN
        INSERT INTO audit_logs (admin_id, action, details)
        VALUES (NULL, 'ASSIGNMENT_CREATED', jsonb_build_object(
            'assignment_id', v_assignment_id,
            'registration_id', p_registration_id,
            'operator_id', v_chosen_operator_id,
            'assigned_by', 'system_auto'
        ));
    EXCEPTION WHEN OTHERS THEN
        -- Ignore audit log insertion errors to ensure registration / assignment resilience
    END;

    RETURN v_chosen_operator_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create updated get_operator_stats function
--    Counts 'Not Coming' assignments for analytics even if they are inactive (is_active = FALSE)
CREATE OR REPLACE FUNCTION get_operator_stats(p_operator_id UUID)
RETURNS TABLE (
    total_assigned   BIGINT,
    total_pending    BIGINT,
    total_coming     BIGINT,
    total_not_coming BIGINT,
    total_callback   BIGINT,
    -- Legacy fields retained for backward compat
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
        COUNT(*) FILTER (WHERE ca.status = 'Coming')                    AS total_completed,
        COUNT(*) FILTER (WHERE ca.status <> 'Pending')                  AS total_called,
        COUNT(*) FILTER (WHERE ca.status = 'Coming')                    AS total_confirmed,
        CASE
            WHEN COUNT(*) = 0 THEN 0
            ELSE ROUND(
                COUNT(*) FILTER (WHERE ca.status = 'Coming')::NUMERIC
                / COUNT(*)::NUMERIC * 100, 1
            )
        END                                                              AS call_success_pct
    FROM contact_assignments ca
    WHERE ca.operator_id = p_operator_id
      AND (ca.is_active = TRUE OR ca.status = 'Not Coming');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION get_operator_stats(UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION get_operator_stats(UUID) TO public;
