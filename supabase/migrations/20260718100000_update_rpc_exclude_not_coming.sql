-- ============================================================
-- 20260718100000_update_rpc_exclude_not_coming.sql
-- Update assign_operator_to_registration RPC to exclude
-- "Not Coming" contacts from capacity calculations.
--
-- Rationale:
--   "Not Coming" contacts are resolved / non-actionable.
--   They should not consume operator capacity slots.
--   This allows new eligible registrations to be assigned
--   to operators even if they have "Not Coming" contacts.
--
-- Safety:
--   - No schema changes (no new tables/columns)
--   - No data modification
--   - Pure RPC function update (DROP + CREATE OR REPLACE)
--   - Forward-only, idempotent
--   - All existing data preserved
-- ============================================================

-- Drop the existing function to allow signature/body update
DROP FUNCTION IF EXISTS assign_operator_to_registration(UUID, INTEGER);

-- Create updated function that excludes Not Coming from capacity
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
    -- 1. Duplicate Protection: Check if the registration already has an active assignment
    IF EXISTS (
        SELECT 1 FROM contact_assignments 
        WHERE registration_id = p_registration_id 
          AND is_active = TRUE
        FOR UPDATE
    ) THEN
        RETURN NULL; -- Already assigned
    END IF;

    -- 2. Find eligible operator with capacity safety using p_max_contacts
    --    IMPORTANT: Exclude "Not Coming" contacts from active workload count.
    --    "Not Coming" contacts are resolved/non-actionable and do not consume capacity.
    SELECT co.id INTO v_chosen_operator_id
    FROM contact_operators co
    LEFT JOIN (
        SELECT operator_id, COUNT(*) AS active_cnt, MAX(assigned_at) AS last_assigned
        FROM contact_assignments
        WHERE is_active = TRUE
          AND status <> 'Not Coming'   -- Exclude resolved contacts from capacity
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

    -- 3. If no operator is eligible, return NULL
    IF v_chosen_operator_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- 4. Double check the active count (excluding Not Coming)
    SELECT COUNT(*) INTO v_active_count
    FROM contact_assignments
    WHERE operator_id = v_chosen_operator_id
      AND is_active = TRUE
      AND status <> 'Not Coming';   -- Consistent with capacity check above

    IF v_active_count >= p_max_contacts THEN
        RETURN NULL; -- Chosen operator is already at capacity
    END IF;

    -- 5. Insert new active assignment
    INSERT INTO contact_assignments (registration_id, operator_id, is_active, status)
    VALUES (p_registration_id, v_chosen_operator_id, TRUE, 'Pending')
    RETURNING id INTO v_assignment_id;

    -- 6. Insert audit log (optional)
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
