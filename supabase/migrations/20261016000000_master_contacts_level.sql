-- ============================================================
-- 20261016000000_master_contacts_level.sql
-- HKM Master Contacts — Add Level Column with Default 'level-0'
--
-- Precision & Architectural Rationale:
--   1. Adds level column to master_contacts with default 'level-0'
--   2. Adds level column to master_contact_events with default 'level-0'
--   3. In PostgreSQL 11+ (including Supabase PG15/16), adding a column with
--      a constant DEFAULT and NOT NULL is an instantaneous catalog-only
--      operation (attmissingval). No table rewrite occurs, and all existing
--      rows immediately evaluate to 'level-0'.
--   4. Since production inventory confirmed that the 'level' column is
--      currently completely absent from both tables, explicit UPDATE ... WHERE
--      level IS NULL statements are redundant and have been omitted to avoid
--      unnecessary table scan locks and I/O overhead.
--   5. Non-destructive: preserves existing IDs, phone numbers, chanting,
--      assignments, and RLS policies.
-- ============================================================

-- 1. Add level to master_contacts
ALTER TABLE public.master_contacts
  ADD COLUMN IF NOT EXISTS level TEXT NOT NULL DEFAULT 'level-0';

-- 2. Add level to master_contact_events
ALTER TABLE public.master_contact_events
  ADD COLUMN IF NOT EXISTS level TEXT NOT NULL DEFAULT 'level-0';

-- 3. Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
