-- ============================================================================
-- Migration: 20261017000004_drop_obsolete_4arg_assign_master_contact_atomic.sql
-- Description: Drop obsolete 4-argument overload of assign_master_contact_atomic.
--
-- Rationale:
--   1. Eliminates PostgREST overload ambiguity (PGRST203) and SQL ambiguity (42725).
--   2. Zero dependencies exist in pg_depend; zero application routes call the 4-arg signature.
--   3. The authoritative 5-argument overload defines `p_allow_reassign boolean DEFAULT FALSE`,
--      allowing any 4-argument callers to resolve cleanly, safely, and unambiguously.
--   4. Guarantees that ALL assignments enforce fail-closed male-only gender validation,
--      deterministic transaction-level advisory locking, and capacity checks.
--   5. Eliminates the legacy unhardened search_path = public function from the database.
-- ============================================================================

DROP FUNCTION IF EXISTS public.assign_master_contact_atomic(uuid, uuid, uuid, integer);
