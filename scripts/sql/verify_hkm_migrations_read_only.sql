-- ==============================================================================
-- HKM Admin Portal — Read-Only Production Preflight & Verification Script
-- Target: Supabase PostgreSQL Database (Production)
--
-- STRICT SAFETY GUARANTEES:
--   - 100% READ-ONLY: Contains only SELECT statements and catalog queries.
--   - ZERO PENDING COLUMN REFERENCES IN PRE-MIGRATION:
--     Does NOT reference profession, interested_bhagavad_gita, comments,
--     chanting, or level on existing tables.
--   - BATCH-SAFE: Pre-migration queries (Part 1) can be run in batch or individually.
--   - PII-SAFE: Aggregates counts only. Never selects personal contact data.
-- ==============================================================================


-- ==============================================================================
-- PART 1: PRE-MIGRATION PREFLIGHT (SAFE TO RUN IN BATCH BEFORE ANY MIGRATION)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Query 1.1: Discover migration tracker tables and actual schema
-- Safe catalog query: works regardless of which tracking mechanism exists.
-- ------------------------------------------------------------------------------
SELECT 
  table_schema, 
  table_name, 
  column_name, 
  ordinal_position,
  data_type
FROM information_schema.columns
WHERE table_name IN ('schema_migrations', '_prisma_migrations', 'migrations')
ORDER BY table_schema, table_name, ordinal_position;

-- ------------------------------------------------------------------------------
-- Query 1.2: Check if supabase_migrations.schema_migrations exists
-- ------------------------------------------------------------------------------
SELECT 
  table_schema, 
  table_name 
FROM information_schema.tables 
WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations';

-- ------------------------------------------------------------------------------
-- Query 1.3: Inspect applied migration records in supabase_migrations
-- Uses SELECT * so it does not assume optional columns (like inserted_at) exist.
-- ------------------------------------------------------------------------------
SELECT *
FROM supabase_migrations.schema_migrations
WHERE version IN ('20261015000000', '20261015120000', '20261016000000', '20261017000000')
ORDER BY version ASC;

-- ------------------------------------------------------------------------------
-- Query 1.4: Pre-migration Master Contacts normalized phone duplicate check
-- Audits whether existing master_contacts rows share identical normalized phones.
-- Safe, read-only aggregate query. Returns 0 rows if clean.
-- ------------------------------------------------------------------------------
SELECT 
  normalize_phone(phone) AS normalized_phone,
  COUNT(*) AS duplicate_row_count,
  COUNT(DISTINCT phone) AS distinct_raw_phones,
  array_agg(id) AS contact_ids
FROM public.master_contacts
GROUP BY normalize_phone(phone)
HAVING COUNT(*) > 1;

-- ------------------------------------------------------------------------------
-- Query 1.5: Pre-migration Master Contacts phone formatting inventory
-- Checks count of non-standard phones (null, non-10-digit).
-- ------------------------------------------------------------------------------
SELECT 
  COUNT(*) AS total_master_contacts,
  COUNT(*) FILTER (WHERE normalize_phone(phone) IS NULL) AS null_normalized_phones,
  COUNT(*) FILTER (WHERE length(normalize_phone(phone)) != 10) AS non_10_digit_phones,
  COUNT(*) FILTER (WHERE length(normalize_phone(phone)) = 10) AS valid_10_digit_phones
FROM public.master_contacts;

-- ------------------------------------------------------------------------------
-- Query 1.6: Pre-migration Migration 4 target columns and tables inventory
-- Checks if classes_attended or master_contact_checkins already exist in production.
-- ------------------------------------------------------------------------------
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'master_contacts' AND column_name = 'classes_attended')
    OR table_name = 'master_contact_checkins'
  )
ORDER BY table_name, ordinal_position;

-- ------------------------------------------------------------------------------
-- Query 1.7: Pre-migration Realtime publication check for master_contact_checkins
-- Checks if master_contact_checkins is already a member of supabase_realtime.
-- ------------------------------------------------------------------------------
SELECT 
  pubname,
  schemaname,
  tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename = 'master_contact_checkins';

-- ------------------------------------------------------------------------------
-- Query 1.8: Pre-migration approve_master_contact_checkin RPC presence check
-- Expected: 0 rows before Migration 4.
-- ------------------------------------------------------------------------------
SELECT 
  proname,
  prosecdef AS is_security_definer,
  proconfig AS search_path
FROM pg_proc
WHERE proname = 'approve_master_contact_checkin';


-- ------------------------------------------------------------------------------
-- Query 2.1: Column presence, data types, nullability, and defaults
-- Safe metadata view query: rows appear only for columns that currently exist.
-- ------------------------------------------------------------------------------
SELECT 
  table_name, 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'contacts_register' AND column_name IN ('current_stay', 'pg_name', 'profession', 'interested_bhagavad_gita', 'comments'))
    OR (table_name = 'registrations' AND column_name = 'level')
    OR (table_name = 'krishnashtami_registrations' AND column_name = 'level')
    OR (table_name = 'master_contacts' AND column_name IN ('level', 'chanting'))
    OR (table_name = 'master_contact_events' AND column_name = 'level')
  )
ORDER BY table_name, column_name;


-- ------------------------------------------------------------------------------
-- Query 3.1: Exact active & legacy constraint definitions and target tables
-- Inspects exact normalized SQL expressions from pg_constraint catalog.
-- ------------------------------------------------------------------------------
SELECT 
  n.nspname AS schema_name,
  cl.relname AS table_name,
  c.conname AS constraint_name,
  c.contype AS constraint_type,
  c.convalidated AS is_validated,
  pg_get_constraintdef(c.oid) AS constraint_definition
FROM pg_constraint c
JOIN pg_class cl ON cl.oid = c.conrelid
JOIN pg_namespace n ON n.oid = cl.relnamespace
WHERE n.nspname = 'public'
  AND c.conname IN (
    'contacts_register_current_stay_check',
    'chk_contacts_register_current_stay',
    'chk_contacts_register_pg_name',
    'chk_contacts_register_gender_stay',
    'chk_contacts_register_profession',
    'chk_master_contacts_chanting'
  )
ORDER BY cl.relname, c.conname;


-- ------------------------------------------------------------------------------
-- Query 4.1: Function definition, ownership, security definer & execute privileges
-- Safe pg_proc catalog query: returns 0 rows if function has not been created yet.
-- ------------------------------------------------------------------------------
SELECT 
  p.proname AS function_name,
  r.rolname AS owner,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  p.prosecdef AS is_security_definer,
  p.proconfig AS configuration_settings,
  has_function_privilege('public', p.oid, 'EXECUTE') AS public_can_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_roles r ON r.oid = p.proowner
WHERE n.nspname = 'public' AND p.proname = 'update_master_contact_chanting';


-- ------------------------------------------------------------------------------
-- Query 5.1: Baseline row counts across all 5 production tables
-- Safe on current schema: all 5 tables are guaranteed to exist.
-- ------------------------------------------------------------------------------
SELECT 'contacts_register' AS table_name, COUNT(*) AS total_rows FROM public.contacts_register
UNION ALL
SELECT 'master_contacts' AS table_name, COUNT(*) AS total_rows FROM public.master_contacts
UNION ALL
SELECT 'master_contact_events' AS table_name, COUNT(*) AS total_rows FROM public.master_contact_events
UNION ALL
SELECT 'registrations' AS table_name, COUNT(*) AS total_rows FROM public.registrations
UNION ALL
SELECT 'krishnashtami_registrations' AS table_name, COUNT(*) AS total_rows FROM public.krishnashtami_registrations;


-- ------------------------------------------------------------------------------
-- Query 5.2: Baseline contacts_register distribution (PII-free)
-- Only references columns that exist on production today: gender, current_stay, pg_name.
-- ------------------------------------------------------------------------------
SELECT 
  'contacts_register' AS table_name,
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE current_stay IS NULL) AS null_current_stay_count,
  COUNT(*) FILTER (WHERE pg_name IS NULL) AS null_pg_name_count,
  COUNT(*) FILTER (WHERE gender = 'Male') AS male_count,
  COUNT(*) FILTER (WHERE gender = 'Female') AS female_count
FROM public.contacts_register;


-- ------------------------------------------------------------------------------
-- Query 6.1: Pre-flight integrity check for Migration 1 (Nullable Current Stay)
-- Evaluates whether current data will satisfy proposed constraints before executing Migration 1.
-- Safe on current schema: only references existing columns (gender, current_stay, pg_name).
-- CRITICAL REQUIREMENT: Both checks MUST return 0 violating rows before applying Migration 1.
-- ------------------------------------------------------------------------------
SELECT 
  'chk_contacts_register_current_stay' AS constraint_tested,
  COUNT(*) AS violating_rows
FROM public.contacts_register
WHERE NOT (current_stay IS NULL OR current_stay IN ('With Parents', 'In Hostel'))

UNION ALL

SELECT 
  'chk_contacts_register_gender_stay' AS constraint_tested,
  COUNT(*) AS violating_rows
FROM public.contacts_register
WHERE NOT (
  (gender = 'Female' AND current_stay IS NULL AND (pg_name IS NULL OR length(trim(pg_name)) = 0)) OR
  (gender = 'Male'   AND current_stay IS NOT NULL AND (
    (current_stay = 'With Parents' AND (pg_name IS NULL OR length(trim(pg_name)) = 0)) OR
    (current_stay = 'In Hostel'    AND pg_name IS NOT NULL AND length(trim(pg_name)) >= 2)
  ))
);


-- ==============================================================================
-- PART 2: POST-MIGRATION VERIFICATION (RUN ONLY AFTER APPLYING MIGRATIONS)
-- 
-- CAUTION: Do NOT execute these queries before their respective migrations are applied!
-- In the Supabase SQL Editor, highlight and run each query individually ONLY AFTER
-- executing its prerequisite migration.
-- (They are commented out below so the entire file can be run safely as a batch).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Query 7.1: Verify Migration 1 execution (contacts_register nullability)
-- PREREQUISITE: Run ONLY AFTER applying 20261015000000_contacts_register_nullable_current_stay.sql
-- ------------------------------------------------------------------------------
-- SELECT 
--   column_name, 
--   is_nullable 
-- FROM information_schema.columns 
-- WHERE table_schema = 'public' 
--   AND table_name = 'contacts_register' 
--   AND column_name IN ('current_stay', 'pg_name');

-- ------------------------------------------------------------------------------
-- Query 8.1: Check profession constraint compliance on contacts_register
-- PREREQUISITE: Run ONLY AFTER applying 20261015120000_admin_portal_features_update.sql
-- ------------------------------------------------------------------------------
-- SELECT 
--   'chk_contacts_register_profession' AS constraint_tested,
--   COUNT(*) AS violating_rows
-- FROM public.contacts_register
-- WHERE profession IS NOT NULL 
--   AND profession NOT IN ('Student', 'Working', 'Business', 'Others');

-- ------------------------------------------------------------------------------
-- Query 8.2: Check chanting column nulls and non-negative constraint on master_contacts
-- PREREQUISITE: Run ONLY AFTER applying 20261015120000_admin_portal_features_update.sql
-- ------------------------------------------------------------------------------
-- SELECT 
--   'master_contacts (chanting)' AS check_name,
--   COUNT(*) AS total_rows,
--   COUNT(*) FILTER (WHERE chanting IS NULL) AS null_chanting_count,
--   COUNT(*) FILTER (WHERE chanting < 0) AS negative_chanting_count
-- FROM public.master_contacts;

-- ------------------------------------------------------------------------------
-- Query 8.3: Check level column on registrations & krishnashtami_registrations
-- PREREQUISITE: Run ONLY AFTER applying 20261015120000_admin_portal_features_update.sql
-- ------------------------------------------------------------------------------
-- SELECT 
--   'registrations' AS table_name,
--   COUNT(*) AS total_rows,
--   COUNT(*) FILTER (WHERE level IS NULL) AS null_level_count
-- FROM public.registrations
-- UNION ALL
-- SELECT 
--   'krishnashtami_registrations' AS table_name,
--   COUNT(*) AS total_rows,
--   COUNT(*) FILTER (WHERE level IS NULL) AS null_level_count
-- FROM public.krishnashtami_registrations;

-- ------------------------------------------------------------------------------
-- Query 8.4: Verify update_master_contact_chanting RPC security settings & privileges
-- PREREQUISITE: Run ONLY AFTER applying 20261015120000_admin_portal_features_update.sql
-- (Re-run Query 4.1 to confirm service_role_can_execute = TRUE and others = FALSE).
-- ------------------------------------------------------------------------------

-- ------------------------------------------------------------------------------
-- Query 9.1: Check level column on master_contacts & master_contact_events
-- PREREQUISITE: Run ONLY AFTER applying 20261016000000_master_contacts_level.sql
-- ------------------------------------------------------------------------------
-- SELECT 
--   'master_contacts' AS table_name,
--   COUNT(*) AS total_rows,
--   COUNT(*) FILTER (WHERE level IS NULL) AS null_level_count
-- FROM public.master_contacts
-- UNION ALL
-- SELECT 
--   'master_contact_events' AS table_name,
--   COUNT(*) AS total_rows,
--   COUNT(*) FILTER (WHERE level IS NULL) AS null_level_count
-- FROM public.master_contact_events;

-- ==============================================================================
-- PART 5: POST-MIGRATION CHECKS FOR 20261017000000_saturday_meetup_checkins.sql
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Query 10.1: Check classes_attended column & check-in table
-- PREREQUISITE: Run ONLY AFTER applying 20261017000000_saturday_meetup_checkins.sql
-- ------------------------------------------------------------------------------
-- SELECT 
--   table_name,
--   column_name,
--   data_type,
--   is_nullable,
--   column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND (
--     (table_name = 'master_contacts' AND column_name = 'classes_attended')
--     OR table_name = 'master_contact_checkins'
--   )
-- ORDER BY table_name, ordinal_position;

-- ------------------------------------------------------------------------------
-- Query 10.2: Check approve_master_contact_checkin RPC privileges
-- PREREQUISITE: Run ONLY AFTER applying 20261017000000_saturday_meetup_checkins.sql
-- ------------------------------------------------------------------------------
-- SELECT 
--   proname,
--   prosecdef AS is_security_definer,
--   proconfig AS search_path,
--   has_function_privilege('public', oid, 'EXECUTE') AS public_can_execute,
--   has_function_privilege('anon', oid, 'EXECUTE') AS anon_can_execute,
--   has_function_privilege('authenticated', oid, 'EXECUTE') AS authenticated_can_execute,
--   has_function_privilege('service_role', oid, 'EXECUTE') AS service_role_can_execute
-- FROM pg_proc
-- WHERE proname = 'approve_master_contact_checkin';

