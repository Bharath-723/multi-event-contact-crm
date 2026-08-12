-- ============================================================
-- 20260808000000_feedback_assignment_reset.sql
-- Feedback Contact Reassignment Migration (v2.0.4)
-- ============================================================

-- 1. Archive every active Ratha Yatra festival contact assignment (Non-Destructive)
UPDATE contact_assignments
SET is_active = FALSE,
    updated_at = NOW()
WHERE is_active = TRUE;

-- 2. Create isolated feedback_contact_assignments table
CREATE TABLE IF NOT EXISTS feedback_contact_assignments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feedback_contact_id UUID NOT NULL REFERENCES feedback_contacts(id) ON DELETE CASCADE,
    operator_id         UUID REFERENCES contact_operators(id) ON DELETE SET NULL,
    assigned_by         UUID REFERENCES admins(id) ON DELETE SET NULL,
    assigned_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status              TEXT NOT NULL DEFAULT 'Assigned' CHECK (status IN ('Assigned', 'Contacted', 'Interested', 'Not Interested', 'Not Coming', 'Completed')),
    notes               TEXT,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Indexes for high performance
CREATE INDEX IF NOT EXISTS idx_fca_feedback_contact_id ON feedback_contact_assignments(feedback_contact_id);
CREATE INDEX IF NOT EXISTS idx_fca_operator_id ON feedback_contact_assignments(operator_id);
CREATE INDEX IF NOT EXISTS idx_fca_is_active ON feedback_contact_assignments(is_active);
CREATE INDEX IF NOT EXISTS idx_fca_status ON feedback_contact_assignments(status);
CREATE INDEX IF NOT EXISTS idx_fca_created_at ON feedback_contact_assignments(created_at DESC);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE feedback_contact_assignments ENABLE ROW LEVEL SECURITY;

-- Policy: Allow read access for authenticated users & admins
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'feedback_contact_assignments' AND policyname = 'fca_select_authenticated'
  ) THEN
    CREATE POLICY "fca_select_authenticated" ON feedback_contact_assignments FOR SELECT USING (TRUE);
  END IF;
END$$;

-- Policy: Allow full management for authenticated users & admins
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'feedback_contact_assignments' AND policyname = 'fca_all_authenticated'
  ) THEN
    CREATE POLICY "fca_all_authenticated" ON feedback_contact_assignments FOR ALL USING (TRUE) WITH CHECK (TRUE);
  END IF;
END$$;

-- 5. Enable Supabase Realtime publication
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE feedback_contact_assignments;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END$$;

-- 6. Trigger function for updated_at
CREATE OR REPLACE FUNCTION update_feedback_contact_assignments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_fca_updated_at') THEN
    EXECUTE 'CREATE TRIGGER trg_fca_updated_at
      BEFORE UPDATE ON feedback_contact_assignments
      FOR EACH ROW
      EXECUTE FUNCTION update_feedback_contact_assignments_updated_at()';
  END IF;
END$$;

-- 7. RPC Function for Auto-Assigning Feedback Contacts
CREATE OR REPLACE FUNCTION assign_operator_to_feedback_contact(
  p_feedback_contact_id UUID,
  p_assigned_by UUID DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  assignment_id UUID,
  operator_id UUID,
  operator_name TEXT,
  message TEXT
) AS $$
DECLARE
  v_operator RECORD;
  v_assignment_id UUID;
  v_already_assigned UUID;
BEGIN
  -- Check if already actively assigned
  SELECT fca.id INTO v_already_assigned
  FROM feedback_contact_assignments fca
  WHERE fca.feedback_contact_id = p_feedback_contact_id AND fca.is_active = TRUE
  LIMIT 1;

  IF v_already_assigned IS NOT NULL THEN
    RETURN QUERY SELECT FALSE, v_already_assigned, NULL::UUID, NULL::TEXT, 'Feedback contact already has an active operator assignment'::TEXT;
    RETURN;
  END IF;

  -- Select best operator: operator_type = 'operator', active, capacity < 40, least loaded
  SELECT 
    co.id,
    co.name,
    COUNT(fca.id) FILTER (WHERE fca.is_active = TRUE) AS current_active
  INTO v_operator
  FROM contact_operators co
  LEFT JOIN feedback_contact_assignments fca ON co.id = fca.operator_id AND fca.is_active = TRUE
  WHERE co.is_active = TRUE
    AND (co.operator_type IS NULL OR co.operator_type = 'operator')
  GROUP BY co.id, co.name
  HAVING COUNT(fca.id) FILTER (WHERE fca.is_active = TRUE) < 40
  ORDER BY current_active ASC, co.created_at ASC
  LIMIT 1;

  IF v_operator.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, NULL::TEXT, 'No eligible contact operator available (all operators at capacity or inactive)'::TEXT;
    RETURN;
  END IF;

  -- Insert new active assignment
  INSERT INTO feedback_contact_assignments (
    feedback_contact_id,
    operator_id,
    assigned_by,
    status,
    is_active
  ) VALUES (
    p_feedback_contact_id,
    v_operator.id,
    p_assigned_by,
    'Assigned',
    TRUE
  ) RETURNING id INTO v_assignment_id;

  -- Audit log
  INSERT INTO audit_logs (action, details)
  VALUES (
    'FEEDBACK_ASSIGNED',
    jsonb_build_object(
      'feedback_contact_id', p_feedback_contact_id,
      'operator_id', v_operator.id,
      'assigned_by', p_assigned_by,
      'assignment_id', v_assignment_id
    )
  );

  RETURN QUERY SELECT TRUE, v_assignment_id, v_operator.id, v_operator.name::TEXT, 'Operator assigned successfully'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
