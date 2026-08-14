-- ============================================================
-- 20260814100000_enforce_active_assignment_uniqueness.sql
-- Enforces:
-- 1. Maximum ONE active assignment per contact per source table.
-- 2. Maximum ONE visitor visit per registration in Krishnashtami.
-- ============================================================

BEGIN;

-- 1. Rathayatra contact_assignments active uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS uq_contact_assignments_active_reg
  ON public.contact_assignments(registration_id)
  WHERE is_active = TRUE;

-- 2. Krishnashtami contact_assignments active uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS uq_krishnashtami_assignments_active_reg
  ON public.krishnashtami_contact_assignments(registration_id)
  WHERE is_active = TRUE;

-- 3. Feedback contact_assignments active uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS uq_feedback_assignments_active_contact
  ON public.feedback_contact_assignments(feedback_contact_id)
  WHERE is_active = TRUE;

-- 4. Krishnashtami visitor_visits registration uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS uq_krishnashtami_visitor_visits_reg
  ON public.krishnashtami_visitor_visits(registration_id);

COMMIT;
