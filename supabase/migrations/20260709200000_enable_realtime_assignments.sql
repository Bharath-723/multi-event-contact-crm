-- ============================================================
-- 20260709200000_enable_realtime_assignments.sql
-- Enables Supabase Realtime for the contact_assignments table
-- ============================================================

-- Alter the supabase_realtime publication to include contact_assignments
ALTER PUBLICATION supabase_realtime ADD TABLE contact_assignments;
