-- ============================================================
-- 20260718400000_add_operator_role_types.sql
-- Add operator_type to contact_operators table and update RPC
-- ============================================================

-- 1. Alter table to add operator_type column
ALTER TABLE contact_operators 
ADD COLUMN IF NOT EXISTS operator_type TEXT 
CHECK (operator_type IN ('operator', 'coordinator')) 
DEFAULT 'operator';

-- Update any existing NULLs to 'operator'
UPDATE contact_operators 
SET operator_type = 'operator' 
WHERE operator_type IS NULL;

-- Make column NOT NULL
ALTER TABLE contact_operators 
ALTER COLUMN operator_type SET NOT NULL;

-- 2. Drop and recreate assign_operator_to_registration RPC to enforce operator_type = 'operator'
DROP FUNCTION IF EXISTS assign_operator_to_registration(UUID, INTEGER);

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
    -- Only operators of type 'operator' are eligible for automatic assignment
    SELECT co.id INTO v_chosen_operator_id
    FROM contact_operators co
    LEFT JOIN (
        SELECT operator_id, COUNT(*) AS active_cnt, MAX(assigned_at) AS last_assigned
        FROM contact_assignments
        WHERE is_active = TRUE
        GROUP BY operator_id
    ) stats ON stats.operator_id = co.id
    WHERE co.is_active = TRUE
      AND co.operator_type = 'operator' -- CRITICAL: Exclude coordinators from auto-assignment
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
