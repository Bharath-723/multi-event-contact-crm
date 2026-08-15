-- ============================================================
-- 20260815140000_fix_status_check_constraints.sql
-- Fix assignment status check constraints across all assignment tables
-- ============================================================

-- 1. Fix feedback_contact_assignments check constraint
ALTER TABLE feedback_contact_assignments DROP CONSTRAINT IF EXISTS feedback_contact_assignments_status_check;
ALTER TABLE feedback_contact_assignments ADD CONSTRAINT feedback_contact_assignments_status_check
    CHECK (status IN ('Pending', 'Assigned', 'Coming', 'Not Coming', 'Not Connected', 'Callback Required', 'Contacted', 'Interested', 'Not Interested', 'Completed'));

-- 2. Fix contact_assignments check constraint
ALTER TABLE contact_assignments DROP CONSTRAINT IF EXISTS contact_assignments_status_check;
ALTER TABLE contact_assignments ADD CONSTRAINT contact_assignments_status_check
    CHECK (status IN ('Pending', 'Assigned', 'Coming', 'Not Coming', 'Not Connected', 'Callback Required', 'Contacted', 'Interested', 'Not Interested', 'Completed'));

-- 3. Fix krishnashtami_contact_assignments check constraint
ALTER TABLE krishnashtami_contact_assignments DROP CONSTRAINT IF EXISTS krishnashtami_contact_assignments_status_check;
ALTER TABLE krishnashtami_contact_assignments ADD CONSTRAINT krishnashtami_contact_assignments_status_check
    CHECK (status IN ('Pending', 'Assigned', 'Coming', 'Not Coming', 'Not Connected', 'Callback Required', 'Contacted', 'Interested', 'Not Interested', 'Completed'));
