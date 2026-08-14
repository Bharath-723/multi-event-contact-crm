-- ============================================================
-- 20260814110000_fix_contact_operators_fk_cascade.sql
-- Sets ON DELETE CASCADE on operator_id foreign keys across all
-- assignment tables so deleting an operator row does not fail.
-- ============================================================

BEGIN;

-- 1. Rathayatra contact_assignments
ALTER TABLE public.contact_assignments
  DROP CONSTRAINT IF EXISTS contact_assignments_operator_id_fkey;

ALTER TABLE public.contact_assignments
  ADD CONSTRAINT contact_assignments_operator_id_fkey
  FOREIGN KEY (operator_id)
  REFERENCES public.contact_operators(id)
  ON DELETE CASCADE;

-- 2. Krishnashtami contact_assignments
ALTER TABLE public.krishnashtami_contact_assignments
  DROP CONSTRAINT IF EXISTS krishnashtami_contact_assignments_operator_id_fkey;

ALTER TABLE public.krishnashtami_contact_assignments
  ADD CONSTRAINT krishnashtami_contact_assignments_operator_id_fkey
  FOREIGN KEY (operator_id)
  REFERENCES public.contact_operators(id)
  ON DELETE CASCADE;

-- 3. Feedback contact_assignments
ALTER TABLE public.feedback_contact_assignments
  DROP CONSTRAINT IF EXISTS feedback_contact_assignments_operator_id_fkey;

ALTER TABLE public.feedback_contact_assignments
  ADD CONSTRAINT feedback_contact_assignments_operator_id_fkey
  FOREIGN KEY (operator_id)
  REFERENCES public.contact_operators(id)
  ON DELETE CASCADE;

COMMIT;
