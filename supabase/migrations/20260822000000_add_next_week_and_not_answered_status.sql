-- ============================================================
-- 20260822000000_add_next_week_and_not_answered_status.sql
-- Update assignment status check constraints across all assignment tables
-- to support 'Not Answered' and 'Next Week' while preserving 'Not Connected'
-- ============================================================

-- 1. Update feedback_contact_assignments check constraint
ALTER TABLE feedback_contact_assignments DROP CONSTRAINT IF EXISTS feedback_contact_assignments_status_check;
ALTER TABLE feedback_contact_assignments ADD CONSTRAINT feedback_contact_assignments_status_check
    CHECK (status IN ('Pending', 'Assigned', 'Coming', 'Not Coming', 'Not Answered', 'Next Week', 'Not Connected', 'Callback Required', 'Contacted', 'Interested', 'Not Interested', 'Completed'));

-- 2. Update contact_assignments check constraint
ALTER TABLE contact_assignments DROP CONSTRAINT IF EXISTS contact_assignments_status_check;
ALTER TABLE contact_assignments ADD CONSTRAINT contact_assignments_status_check
    CHECK (status IN ('Pending', 'Assigned', 'Coming', 'Not Coming', 'Not Answered', 'Next Week', 'Not Connected', 'Callback Required', 'Contacted', 'Interested', 'Not Interested', 'Completed'));

-- 3. Update krishnashtami_contact_assignments check constraint
ALTER TABLE krishnashtami_contact_assignments DROP CONSTRAINT IF EXISTS krishnashtami_contact_assignments_status_check;
ALTER TABLE krishnashtami_contact_assignments ADD CONSTRAINT krishnashtami_contact_assignments_status_check
    CHECK (status IN ('Pending', 'Assigned', 'Coming', 'Not Coming', 'Not Answered', 'Next Week', 'Not Connected', 'Callback Required', 'Contacted', 'Interested', 'Not Interested', 'Completed'));
