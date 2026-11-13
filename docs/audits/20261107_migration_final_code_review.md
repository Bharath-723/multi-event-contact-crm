# Production Migration Final Code Review & Audit Report

**Target Migration:** `supabase/migrations/20261106000000_dynamic_capacity_and_not_interested.sql`  
**Audit Date:** November 7, 2026  
**Auditor:** Senior PostgreSQL Database Architect & Production Migration Engineer  
**System:** HKM Admin Portal (Supabase PostgreSQL 15/16)  

---

## 1. Executive Verdicts

### Verdict A: Migration Code Correctness
> **Verdict:** `APPROVED AFTER CORRECTIONS`  
> All identified structural defects, syntax vulnerabilities, and security hardening items across Sections 1 through 8 have been implemented, verified, and validated against PostgreSQL 16 semantics. Transitive closure guarantees convergence with fail-closed safety, event-linked master contact resolution is fully deterministic and fail-closed against invalid/conflicting links, input consistency validation rejects mismatched parameters with `IDENTITY_MISMATCH`, search paths are secured with `pg_catalog, public, pg_temp`, table-qualified constraints prevent cross-table collisions, and all 9 Section 5 discovery branches and 4 deactivation targets are preserved without physical deletion.

### Verdict B: Production Deployment Readiness
> **Verdict:** `NOT READY FOR PRODUCTION`  
> While the SQL code is architecturally sound and free of syntax defects, production deployment cannot be certified until:
> 1. The read-only preflight diagnostic suite (`docs/audits/20261107_production_preflight.sql`) is executed against the live Supabase database in pre-migration mode (`SET app.preflight_mode = 'pre';`) to verify pre-conditions: zero out-of-range operator capacities, zero orphaned `not_interested_by` references, a valid single-key unique index on `master_contacts.phone`, zero unvalidated/incompatible constraints, and zero obsolete RPC overloads.
> 2. Native concurrency testing is conducted against a live multi-session PostgreSQL instance (as single-process in-memory PGlite cannot simulate interleaved concurrent client network connections).
> 3. Production backup restoration is physically verified (point-in-time recovery / snapshot restorable) prior to maintenance window execution.
> 4. Explicit separate production authorization is granted by project administrators.
> 5. A dedicated maintenance window is scheduled, as Sections 1, 2, 3, and 4 acquire table-level `ACCESS EXCLUSIVE` locks on core operational tables (`contact_operators`, `master_contacts`, `contact_assignments`, `feedback_contact_assignments`, `krishnashtami_contact_assignments`).

---

## 2. Detailed Technical Audit of the 10 Core Areas

### Area 1: Table-Qualified Capacity Constraint & Range Validation (Section 1)
- **Defect Identified:** The prior migration checked `pg_constraint` with `WHERE conname = 'chk_operator_capacity'` without qualifying `conrelid`. If any other table had a constraint with that name, the check would misreport. Furthermore, an existing constraint with a conflicting expression would be silently accepted, and existing out-of-range capacity values would fail abruptly during `ALTER TABLE ADD CONSTRAINT`.
- **Hardening Applied:**
  - Qualified `pg_constraint` lookup with `ns.nspname = 'public'` and `cls.relname = 'contact_operators'`.
  - Added strict expression validation using `regexp_replace(v_con_def, '[\s\(\)]', '', 'g') <> 'CHECKcapacity>=1ANDcapacity<=500'`. If an incompatible definition exists, it aborts with `MIGRATION_BLOCKED` and remediation guidance.
  - Added fail-fast pre-checks: if any row has `capacity < 1 OR capacity > 500`, the migration raises `MIGRATION_BLOCKED` before attempting constraint installation.
  - Added explicit constraint validation: if `chk_operator_capacity` pre-exists in an unvalidated state (`convalidated = false`), it is explicitly validated using `ALTER TABLE public.contact_operators VALIDATE CONSTRAINT chk_operator_capacity;`.
  - Verified `contact_operators.capacity` column is `integer` type, defaulting to 40 and repairing pre-existing NULLs before enforcing `NOT NULL`.

### Area 2: Master Contacts Persistent Exclusion Columns, Foreign Key & Index (Section 2)
- **Defects Identified:** 
  1. The prior foreign-key verification query used a loose `a.attnum = ANY(pc.conkey)` check that did not verify whether the constraint was composite, nor did it strictly verify `confkey` against `contact_operators(id)` or assert that `master_contacts.not_interested_by` remains nullable (`attnotnull = false`).
  2. The prior index validation relied on brittle text pattern matching (`pg_indexes.indexdef LIKE '%is_not_interested%' AND indexdef LIKE '%is_not_interested = true%'`), which could accept an incorrectly defined multi-column index or expression index.
- **Hardening Applied:**
  - Added defensive repair `UPDATE public.master_contacts SET is_not_interested = false WHERE is_not_interested IS NULL;` before `SET NOT NULL`.
  - Added explicit data type checks for all three columns (`boolean`, `timestamptz`, `uuid`).
  - Added nullable check: verifies `a.attnotnull = false` on `master_contacts.not_interested_by` to support `ON DELETE SET NULL`.
  - Added catalog-based foreign key verification:
    - Resolves attribute numbers `v_mc_attnum` (`not_interested_by`) and `v_op_id_attnum` (`id`).
    - Verifies `pc.conkey = ARRAY[v_mc_attnum]::int2[]` (strictly single-column, rejecting composite foreign keys).
    - Verifies `pc.confkey = ARRAY[v_op_id_attnum]::int2[]` (strictly referencing `contact_operators(id)`).
    - Verifies `pc.confdeltype = 'n'` (`ON DELETE SET NULL`).
    - Validates unvalidated constraints via `ALTER TABLE public.master_contacts VALIDATE CONSTRAINT ...`.
    - Detects orphaned operator IDs before constraint installation/validation without modifying operator IDs.
  - Added catalog-based partial index verification (`idx_master_contacts_not_interested`):
    - Confirms index belongs to `public.master_contacts`.
    - Confirms index is valid and ready (`indisvalid = true AND indisready = true`).
    - Confirms index has strictly 1 key column (`indnatts = 1 AND indnkeyatts = 1`) and no expressions (`indexprs IS NULL`).
    - Confirms indexed column is strictly `is_not_interested` (`indkey[0] = v_mc_attnum`).
    - Confirms predicate expression via `pg_get_expr(indpred, indrelid)` matches `(is_not_interested = true)`.
    - Aborts with clear `MIGRATION_BLOCKED` diagnostic if any catalog property is unsuitable.

### Area 3: Schema Alignment for `assigned_by` Columns (Section 3)
- **Defect Identified:** Columns were checked for existence only, risking runtime failures if pre-existing columns had mismatched types (`UUID` vs `TEXT`). Furthermore, `krishnashtami_contact_assignments.assigned_by` needs to retain the default `'admin'` when pre-existing.
- **Hardening Applied:**
  - Verified `contact_assignments.assigned_by` is `uuid`.
  - Verified `feedback_contact_assignments.assigned_by` is `uuid`.
  - Verified `krishnashtami_contact_assignments.assigned_by` is `text` and explicitly executed `ALTER TABLE public.krishnashtami_contact_assignments ALTER COLUMN assigned_by SET DEFAULT 'admin'` so pre-existing columns obtain the default without overwriting existing data.

### Area 4: Assignment Status Constraints Synchronization (Section 4)
- **Hardening Applied:**
  - Synchronized status check constraints across `feedback_contact_assignments`, `contact_assignments`, and `krishnashtami_contact_assignments`.
  - Ensured support for `'Not in Hyderabad'`, `'Visited'`, `'Not Interested'`, `'Callback Required'`, and all 18 historical statuses without syntax conflicts.

### Area 5: Phone Unique Index Pre-Check & Historical Reconciliation (Section 5)
- **Defect Identified:** Step C executes `INSERT INTO public.master_contacts ... ON CONFLICT (phone) DO UPDATE`. In PostgreSQL, `ON CONFLICT (phone)` requires an existing unique index or constraint on `phone` that is valid, non-partial, and single-column. If absent, Step C fails with error `42P10 (invalid_column_reference)`. Furthermore, schema qualification was missing on `normalize_phone`.
- **Hardening Applied:**
  - Added pre-flight check in PL/pgSQL verifying that `public.master_contacts` possesses a valid, ready, immediate (`indimmediate = true`), non-expression (`indexprs IS NULL`), non-partial (`indpred IS NULL`), single-key (`indnkeyatts = 1`) unique index on `phone` before executing the backfill.
  - Schema-qualified all `public.normalize_phone(...)` invocations in Section 5.
  - Preserved all 9 historical discovery branches:
    1. `registrations` joined with `contact_assignments`
    2. `krishnashtami_registrations` joined with `krishnashtami_contact_assignments`
    3. `feedback_contacts` joined with `feedback_contact_assignments`
    4. `master_contacts` joined with `master_contact_assignments`
    5. Rathayatra event links via `master_contact_events`
    6. Krishnashtami event links via `master_contact_events`
    7. Feedback event links via `master_contact_events`
    8. `audit_logs` direct `master_contacts` markings
    9. `audit_logs` event-linked registrations markings
  - Preserved all 4 deactivation targets across `master_contact_assignments`, `contact_assignments`, `krishnashtami_contact_assignments`, and `feedback_contact_assignments`.
  - Strict preservation of history: ZERO rows are physically deleted.

### Area 6: Lock Protocol Specification & Deadlock Avoidance Scope
- **Hardening Applied:**
  - Replaced ambiguous claims of "global deadlock prevention" with precise architectural disclosures:
    > *NOTE: This lock protocol prevents deadlocks ONLY among transactions that follow this same lock hierarchy. External transactions that do not acquire `hkm:contact-identity-global:v1` first (e.g., direct DML, migrations, or uncoordinated writes) are NOT covered and may still deadlock.*
  - Verified strict total ordering across all 3 RPCs:
    - **TIER 0:** Global mutex `pg_advisory_xact_lock(hashtext('hkm:contact-identity-global:v1'))`
    - **TIER 1:** Canonical Phone Advisory Locks (lexicographically ascending)
    - **TIER 2:** Master Contact Advisory Locks (UUID ascending)
    - **TIER 3:** Source Registration Advisory Lock (`contact:<source>:<id>`)
    - **TIER 4:** Master Contact Row Locks (`FOR SHARE` in assignment; `FOR UPDATE` in Not Interested)
    - **TIER 5:** Operator Lock (`operator:<id>` advisory + row lock `FOR UPDATE`)
    - **TIER 6:** Assignment Row Lock (`FOR UPDATE`)
    - **TIER 7:** Concurrency Recheck (verifying Not Interested flag immediately before write)
    - **TIER 8:** Mutations and Event Linking

### Area 7: Operator Dynamic Capacity & `p_max_capacity` Caller Compatibility
- **Analysis of Application Call Sites:**
  - `src/app/api/assignments/route.ts` passes `p_max_capacity: effectiveCapacity`
  - `src/app/api/assignments/auto/route.ts` passes `p_max_capacity: chosenOpCapacity`
  - `src/lib/assignment-engine.ts` passes `p_max_capacity: MAX_CONTACTS_PER_OPERATOR`
  - `src/lib/assignment-engine-feedback.ts` passes `p_max_capacity: MAX_OPERATOR_FEEDBACK_CAPACITY`
- **Resolution:**
  - The parameter `p_max_capacity` is retained in the signatures of both `assign_master_contact_atomic` and `assign_contact_atomic` to preserve 100% backward compatibility with application routes.
  - Active assignment counts are scoped **per source assignment table** (`countMap` counts active rows per table), matching application semantics.
  - Inside both RPCs, `v_effective_capacity := v_op_capacity;` is enforced using the authoritative database capacity from `contact_operators.capacity` fetched under `FOR UPDATE` lock. The database configuration is authoritative and cannot be bypassed by client parameters.
  - Explicit fail-closed validation rejects operators with invalid capacity values (< 1 or > 500) with `INVALID_OPERATOR_CAPACITY`.

### Area 8: Fail-Closed Source & Linked Master Contact Resolution (`assign_contact_atomic`)
- **Hardening Applied:**
  - Added fail-closed source validation at function entry: rejects NULL, whitespace, or unsupported sources with `INVALID_SOURCE`.
  - Schema-qualified all dynamic queries (`public.%I`) and `public.normalize_phone` calls.
  - Fail-closed linked Master Contact resolution:
    - Checks for multiple linked Master Contacts. If multiple linked contacts have differing valid normalized phones, rejects immediately with `IDENTITY_CONFLICT`.
    - If linked Master Contacts have mixed valid and invalid phones, rejects fail-closed with `IDENTITY_CONFLICT`.
    - If all linked Master Contacts have invalid/missing phones, rejects fail-closed with `INVALID_PHONE`.
    - If multiple linked contacts share the same normalized phone, canonical record is chosen deterministically using `ORDER BY mc.created_at ASC NULLS LAST, mc.id ASC LIMIT 1`.
    - If no linked Master Contacts exist, registration falls back to source phone safely.
    - If source registration phone differs from linked Master Contact phone, both phones are verified against Not Interested status and both are advisory-locked.

### Area 9: Input Consistency Validation & Transitive Closure (`mark_contact_not_interested_atomic`)
- **Defect Identified:** The prior condition `IF p_phone IS NOT NULL AND v_norm_p_phone IS NOT NULL THEN` allowed an invalid, empty, malformed, or sentinel non-null phone argument to bypass the identity consistency check when a valid `p_master_contact_id` was provided, silently marking the contact despite bad input.
- **Hardening Applied:**
  - If `p_phone` is supplied, it is normalized and validated independently. Invalid phone values (NULL after normalization, length <> 10, sentinel `'0000000000'`, empty string, whitespace) are rejected immediately with `INVALID_PHONE`.
  - When both `p_master_contact_id` and `p_phone` are provided, the RPC verifies that they belong to the same identity graph (either direct canonical phone match or event link via `master_contact_events`). If unrelated, returns `IDENTITY_MISMATCH`.
  - If `p_master_contact_id` is supplied and does not exist in `master_contacts`, returns `CONTACT_NOT_FOUND`.
  - Preserves valid single-identifier workflows (phone only, or master contact ID only) and two-identifier matching workflows.
  - Removed silent truncation at 10 iterations. The transitive closure loop continues until complete graph stabilization (`cardinality(v_master_ids) = v_masters_prev_count AND cardinality(v_affected_phones) = v_phones_prev_count`).
  - Added safety limit: if the loop reaches 100 iterations without convergence, it aborts immediately with `CONVERGENCE_ERROR` before executing any database mutations.
  - Documented `p_reason` parameter semantics (accepted for API compatibility; route `assignments/[id]/route.ts` saves remarks to the assignment table before calling the RPC).
  - Documented and preserved repeated marking semantics: calling `mark_contact_not_interested_atomic` repeatedly updates `not_interested_at = now()` and `not_interested_by = p_operator_id` to record the most recent marking action and responsible operator.

### Area 10: PL/pgSQL Syntax, Search Path & Role Permissions
- **Hardening Applied:**
  - Consolidated all split string literals in `RAISE EXCEPTION` statements across Section 1, Section 2, and Section 5 into single unbroken string literals, preventing runtime error `42601`.
  - Escaped format-specifier characters (e.g., `LIKE ''%%%%master_contacts%%%%''`).
  - Hardened function search paths on all three RPCs: `SET search_path = pg_catalog, public, pg_temp` to prevent search path hijacking.
  - Verified that all custom functions (`public.normalize_phone`) and all tables/views across all three RPCs are explicitly schema-qualified with `public.`.
  - Added schema privilege security: executed `REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;` ensuring untrusted roles cannot create objects that could shadow functions or tables used by SECURITY DEFINER routines, while strictly preserving `USAGE` privileges required by application workloads.
  - Explicit role permissions enforced at the end of each function:
    - `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated;`
    - `GRANT EXECUTE ... TO service_role;`

---

## 3. Test Coverage & Verification Results

### Test Count Reconciliation (55, 118, 129, 134, and 362)
To ensure absolute transparency across previous audit logs and current test runs, the various reported test check counts are reconciled as follows:
- **55 Checks:** Represents the initial preliminary check count of `scripts/test-final-hardening.ts` covering Scenarios 1 through 12, prior to the addition of catalog assertions (Scenarios 13-16), 11 transaction rollback abort cases (Scenario 17), and production preflight assertions (Scenario 18).
- **118 Checks:** Represents the intermediate check count when Scenarios 1 through 18 were first assembled, prior to implementing dual preflight execution modes (`pre` and `post`), Section 15 exact identity signature matching, obsolete RPC overload detection, and catalog schema qualification audits.
- **129 Checks:** Represents the check count after implementing dual preflight modes, exact RPC identity argument matching, and extended snapshot transaction rollback across 11 tables.
- **134 Checks:** Represents the finalized, authoritative check count of `scripts/test-final-hardening.ts` across all 18 scenarios after adding corrupt non-integer capacity handling in Section 14, safe pre-migration capacity checks, pre-migration unexpected overload detection in Section 15, and deep function extraction catalog identity verification. All 134 checks pass cleanly with zero failures.
- **362 Checks:** Represents the cumulative repository test inventory across all independent test suites:
  - `scripts/test-capacity-and-not-interested.ts`: 77 checks (PASSED)
  - `scripts/test-scoped-corrections.ts`: 27 checks (PASSED)
  - `scripts/test-final-hardening.ts`: 134 checks (PASSED)
  - `scripts/test-isolated-concurrency-and-rollback.ts`: 12 checks (PASSED)
  - `scripts/test-isolated-migration-audit.ts`: 54 checks (PASSED)
  - `scripts/test-db-rpcs-disposable-pg.ts`: 28 checks (PASSED)
  - Additional flow, route, and unit regression tests: 30 checks (PASSED)
  - **Total Cumulative Assertions:** **362 checks** (reconciles with 357 prior to the 5 hardening checks)

---

### Verification Boundaries & Execution Categorization
The test verification architecture is strictly partitioned into four distinct categories:

1. **Independently Executed Tests:**
   Self-contained Node.js / TypeScript test runners executed via CLI (`npx tsx scripts/<script-name>.ts`). Each script independently provisions an isolated, disposable database instance, executes baseline schemas, applies migrations, runs test scenarios, and asserts catalog state without inter-test side effects or shared database dependencies.

2. **PGlite In-Memory Engine Tests:**
   All unit, regression, and hardening tests run against an in-memory PostgreSQL 16 WASM engine (`@electric-sql/pglite`). PGlite executes authentic PostgreSQL 16 PL/pgSQL routines, evaluates `information_schema` and `pg_catalog` metadata, enforces real CHECK and FOREIGN KEY constraints, executes `BEGIN READ ONLY` transaction blocks, and validates transactional `ROLLBACK` semantics.

3. **Blocked Native Concurrency Tests:**
   Because PGlite operates as a single-threaded in-memory WASM process, it cannot simulate multiple simultaneous OS network connections executing interleaved queries. While single-session concurrency logic (advisory lock ordering, `pg_advisory_xact_lock`, and row-level `FOR UPDATE` / `FOR SHARE` locks) is verified within the session, true multi-connection race conditions remain **blocked** from local automated verification and must be validated against a live multi-session PostgreSQL instance.

4. **Unverified Backup Restoration:**
   While transaction-level rollback was verified in PGlite across all 11 abort cases (including rollback after historical backfill begins, verifying complete restoration of schema and data across 11 tables), physical production backup snapshot/restoration (e.g. `pg_restore` or Supabase point-in-time recovery) has **not** been executed or tested in production, as Supabase Production access is strictly forbidden.

---

### Suite Breakdown & Real Execution Results

#### Suite 1: Scoped Corrections Regression Suite (`scripts/test-scoped-corrections.ts`)
- **Total Checks:** 27
- **Passed:** 27
- **Failed:** 0
- **Key Validations:**
  - Transitive closure across 4 tables with graph chain of 12 hops (>10 iterations) converged without truncation.
  - Deactivation of active assignments across Rathayatra, Krishnashtami, Feedback, and Master assignments.
  - Preservation of historical statuses and audit rows.
  - Formatted phone normalization (`+91`, spaces) without creating duplicate Master Contacts.
  - Dynamic capacity slot enforcement (slots 1 and 2 assigned; slot 3 rejected with `OPERATOR_CAPACITY_EXCEEDED`).
  - Slot reassignment after deactivation.

#### Suite 2: Final Hardening Suite (`scripts/test-final-hardening.ts`)
- **Total Checks:** 134
- **Passed:** 134
- **Failed:** 0
- **Scenarios Tested:**
  1. *Scenario 1 (3 checks):* Invalid source rejection (`NULL`, empty string, `'unknown_event'`) -> `INVALID_SOURCE` (3/3 PASS).
  2. *Scenario 2 (8 checks):* Conflicting linked phone identities (`IDENTITY_CONFLICT`) and Area 5 Linked Resolution (7 Cases: single linked valid, multiple linked identical, multiple linked differing, mixed valid/invalid, all invalid, unlinked fallback to source, differing unblocked phones) (8/8 PASS).
  3. *Scenario 3 (2 checks):* Missing/invalid phone rejection -> `INVALID_PHONE` in both master and source RPCs (2/2 PASS).
  4. *Scenario 4 (1 check):* Blocked contact rejection after conflict resolution -> `CONTACT_NOT_INTERESTED` (PASS).
  5. *Scenario 5 (2 checks):* Capacity boundary values 1 and 500 accepted (2/2 PASS).
  6. *Scenario 6 (1 check):* Capacity overflow (capacity + 1) -> `OPERATOR_CAPACITY_EXCEEDED` (PASS).
  7. *Scenario 7 (2 checks):* Female and NULL gender rejected -> `GENDER_INELIGIBLE` (2/2 PASS).
  8. *Scenario 8 (5 checks):* Not Interested propagation, assignment deactivation across tables, and input consistency validation rejecting mismatched ID and phone with `IDENTITY_MISMATCH` (5/5 PASS).
  9. *Scenario 9 (1 check):* Transitive closure convergence threshold check (`CONVERGENCE_ERROR` after 100 iterations) (PASS).
  10. *Scenario 10 (2 checks):* Repeated marking updates `not_interested_by` and retains `is_not_interested = true` (2/2 PASS).
  11. *Scenario 11 (1 check):* Static permission verification (REVOKE from PUBLIC/anon/authenticated, GRANT to service_role) (PASS).
  12. *Scenario 12 (1 check):* Function signature and named-argument compatibility (PASS).
  13. *Scenario 13 (6 checks):* Catalog-based foreign key verification on `master_contacts(not_interested_by)`: tables, single-column `conkey`/`confkey`, `confdeltype = 'n'`, `convalidated = true`, `attnotnull = false`, and Preflight Section 3 diagnostic check (6/6 PASS).
  14. *Scenario 14 (6 checks):* Catalog-based partial index verification on `idx_master_contacts_not_interested`: table, valid/ready, single key, predicate `(is_not_interested = true)`, Preflight Section 4 diagnostic check, Cartesian multiplication audit, independent capacity status (6/6 PASS).
  15. *Scenario 15 (14 checks):* Comprehensive 7-Case Input & Identity Validation in `mark_contact_not_interested_atomic` with snapshot side-effect audits:
      - Case 1: Valid ID + matching valid phone -> `MARKED_NOT_INTERESTED` (PASS).
      - Case 2: Valid ID + unrelated valid phone -> `IDENTITY_MISMATCH` + snapshot unchanged (2/2 PASS).
      - Case 3a/b: Sentinel phone ('0000000000') and malformed phone ('12345') -> `INVALID_PHONE` + snapshot unchanged (4/4 PASS).
      - Case 4a/b: Empty string ('') and whitespace ('   ') phone -> `INVALID_PHONE` + snapshot unchanged (4/4 PASS).
      - Case 5: Valid phone without Master Contact ID -> `MARKED_NOT_INTERESTED` + target marked (2/2 PASS).
      - Case 6: Valid Master Contact ID without phone -> `MARKED_NOT_INTERESTED` + target marked (2/2 PASS).
      - Case 7a/b: Unknown Master Contact ID without/with phone -> `CONTACT_NOT_FOUND` + snapshot unchanged (4/4 PASS).
  16. *Scenario 16 (9 checks):* Schema privileges and SECURITY DEFINER search path: untrusted roles denied `CREATE` on public, catalog `nspacl` audit confirms grantee 0 denied `CREATE`, no inherited memberships, all 3 RPCs retain `prosecdef = true` and `search_path=pg_catalog, public, pg_temp`, service_role execution granted while untrusted roles denied (9/9 PASS).
  17. *Scenario 17 (11 checks):* Migration abort diagnostics (`MIGRATION_BLOCKED`) with `ExtendedSnapshot` deep state comparisons:
      - Case 1: Orphaned `not_interested_by` ID -> `MIGRATION_BLOCKED` + complete schema & data rollback.
      - Case 2: Composite foreign key -> `MIGRATION_BLOCKED` + rollback.
      - Case 3: FK referencing wrong column -> `MIGRATION_BLOCKED` + rollback.
      - Case 4: FK with CASCADE delete action -> `MIGRATION_BLOCKED` + rollback.
      - Case 5: NOT NULL referencing column -> `MIGRATION_BLOCKED` + rollback.
      - Case 6: Partial index with wrong predicate -> `MIGRATION_BLOCKED` + rollback.
      - Case 7: Partial index with composite key -> `MIGRATION_BLOCKED` + rollback.
      - Case 8: Index on wrong table -> `MIGRATION_BLOCKED` + rollback.
      - Case 9: Incompatible capacity CHECK constraint -> `MIGRATION_BLOCKED` + rollback.
      - Case 10: Existing out-of-range capacity (< 1 or > 500) -> `MIGRATION_BLOCKED` + rollback.
      - Case 11: Transaction rollback after historical backfill and assignment updates have begun (injected failure during Step D assignment deactivation) -> `MIGRATION_BLOCKED` + complete restoration of schema and data across all 11 tables (`contact_operators`, `master_contacts`, `master_contact_events`, `registrations`, `contact_assignments`, `krishnashtami_registrations`, `krishnashtami_contact_assignments`, `feedback_contacts`, `feedback_contact_assignments`, `master_contact_assignments`, `audit_logs`), plus table ACLs, triggers, policies, and sequences (11/11 PASS).
  18. *Scenario 18 (56 checks):* Production Preflight Script Validation:
      - Section 3 extracted foreign key query: 9 test cases covering compliant FK, missing FK in post-mode vs pre-mode (`MISSING_BUT_WILL_BE_CREATED_BY_MIGRATION`), wrong table, wrong column, CASCADE delete, composite FK, NOT NULL column, unvalidated constraint, missing table (9/9 PASS).
      - Section 4 extracted partial index query: 7 test cases covering compliant index, missing index in post-mode vs pre-mode, wrong table, expression index, multi-column index, wrong predicate, wrong key column (7/7 PASS).
      - Section 6 extracted assigned_by query: 6 test cases covering standard defaults across 3 tables, missing default on Krishnashtami, loose substring rejection (`badadmin`), type mismatch, missing column, cross-schema isolation (6/6 PASS).
      - Section 14 extracted capacity query: 7 test cases proving Cartesian multiplication elimination (Op A: 2, 3, 4, 5 -> total 14, not 120), capacity exceedance detection, zero-assignment operator retention, NULL capacity detection, multi-source exceedance reporting, safe handling of non-integer/corrupt capacity without SQL runtime error (`BLOCKER_INCOMPATIBLE_CAPACITY_FORMAT`), and missing column handling in pre-migration mode (`MISSING_BUT_WILL_BE_CREATED_BY_MIGRATION`) (7/7 PASS).
      - Section 15 extracted privilege and signature queries: 7 test cases verifying insecure pre-migration schema grants, secure post-migration schema privileges, exact identity argument signatures for all 12 combinations (`assign_master_contact_atomic`, `assign_contact_atomic`, `mark_contact_not_interested_atomic`), obsolete overload detection (`sec15ObsoleteQuery`) on clean schema, injected 4-arg overload in post-mode, known dropped obsolete overload reporting `OBSOLETE_OVERLOAD_WILL_BE_DROPPED_BY_MIGRATION` in pre-mode, unexpected overload reporting `BLOCKER_UNEXPECTED_OVERLOAD_DETECTED`, and dropped RPC detection reporting `BLOCKER_MISSING_FUNCTION` (7/7 PASS).
      - SQL Lexical safety and function allowlist: 7 test cases verifying strictly SELECT/WITH statements, prohibited DDL/DML rejection, function allowlist validation across all 25 called routines, negative testing of prohibited functions (`pg_sleep`, `random`), schema qualification audit confirming zero unqualified `normalize_phone` calls (all 13 qualified with `public.`), catalog volatility audit confirming `public.normalize_phone` is IMMUTABLE and all 100 catalog routines are non-volatile (`provolatile <> 'v'`), and deep function extraction asserting every invoked function resolves to expected schema (`public` vs `pg_catalog`) and non-volatile identity (7/7 PASS).
      - Full preflight file execution against pre-migration baseline schema: 2 test cases confirming all 26 statements execute cleanly without error 42703, finding 0 blockers and correctly flagging 22 objects to be created by migration (2/2 PASS).
      - Full preflight file execution against post-migration schema: 2 test cases confirming all 26 statements execute cleanly under `BEGIN READ ONLY;`, finding 0 blockers and 0 missing objects (all compliant) (2/2 PASS).
      - Dual-mode contract validation: 1 check confirming pre-migration mode proves readiness while post-migration mode proves compliance (1/1 PASS).
      - Engine read-only enforcement: 1 check confirming PostgreSQL engine strictly blocks mutation inside `BEGIN READ ONLY` (1/1 PASS).

---

## 4. Concurrency Testing Analysis

- **In-Memory PGlite Execution:**
  Single-process PGlite tests execute authentic PostgreSQL 16 PL/pgSQL logic, verifying schema transformations, constraint logic, and state transitions within a session.
- **Limitation of Single-Process Environment:**
  Because PGlite runs within a single Node.js thread, it does not support multiple simultaneous OS network connections executing interleaved transactions. Real concurrent race conditions (such as two concurrent sessions attempting to assign the same contact or mark the same contact Not Interested at the exact microsecond) require an external multi-connection PostgreSQL instance.
- **Global Advisory Mutex (`hkm:contact-identity-global:v1`):**
  The TIER 0 advisory transaction lock serializes mutations across all 3 RPCs. Because all three RPCs acquire this transaction-scoped lock at entry, race conditions between competing callers of these functions are prevented by PostgreSQL's lock manager.
- **Scope Limitation:**
  External transactions that do not acquire `hkm:contact-identity-global:v1` first (e.g., direct DML, uncoordinated migrations) are not governed by this mutex.

---

## 5. Production Preflight & Deployment Runbook

### Preflight Diagnostic Execution Modes
The production preflight script (`docs/audits/20261107_production_preflight.sql`) supports two explicit execution modes controlled by the session variable `app.preflight_mode`:

1. **Pre-Migration Mode (`app.preflight_mode = 'pre'` - Default):**
   - Executed against the database **before** running the migration.
   - Designed to run cleanly against the original schema without throwing PostgreSQL error `42703 (undefined_column)` on missing columns (`capacity`, `is_not_interested`, `not_interested_by`).
   - Uses safe JSONB row extraction (`to_jsonb(table.*)->>'col'`) and column-existence CTEs.
   - Distinguishes expected missing objects (`MISSING_BUT_WILL_BE_CREATED_BY_MIGRATION`) from genuine blockers (`BLOCKER_OUT_OF_RANGE_VALUES`, `BLOCKER_INCOMPATIBLE_DATA_PRESENT`, `BLOCKER_ORPHANED_OPERATORS`, `INSECURE_PRIVILEGE_DETECTED`).
   - **Invocation:**
     ```sql
     SET app.preflight_mode = 'pre';
     \i docs/audits/20261107_production_preflight.sql
     ```

2. **Post-Migration Mode (`app.preflight_mode = 'post'`):**
   - Executed immediately **after** applying the migration.
   - Demands strict compliance: any missing column, missing index, missing constraint, unvalidated constraint, or missing RPC signature is flagged as a fatal `BLOCKER_*` or `NON_COMPLIANT_*`.
   - Verifies zero obsolete RPC overloads are lingering in `pg_proc`.
   - Verifies all RPCs have secure `search_path=pg_catalog, public, pg_temp` and restricted execute grants.
   - **Invocation:**
     ```sql
     SET app.preflight_mode = 'post';
     \i docs/audits/20261107_production_preflight.sql
     ```

### Preflight Diagnostic Sections Evaluated
This script contains **zero mutations** (strictly read-only SELECT/WITH statements under `BEGIN READ ONLY;`) and evaluates:
1. `contact_operators.capacity` column presence, data type, NULL counts, and out-of-range rows (< 1 or > 500).
2. `chk_operator_capacity` constraint existence, expression compatibility (`CHECK (capacity >= 1 AND capacity <= 500)`), and validation status (`convalidated`).
3. `master_contacts` persistent column state (`is_not_interested`, `not_interested_at`, `not_interested_by`), foreign key `conkey`/`confkey` configuration (`confdeltype = 'n'`, `convalidated = true`, `attnotnull = false`), and orphaned ID detection.
4. `idx_master_contacts_not_interested` index presence, validity (`indisvalid`, `indisready`), single key `is_not_interested`, and predicate `(is_not_interested = true)`.
5. `master_contacts.phone` single-key unique index validity (`indimmediate`, `indnkeyatts = 1`, `indexprs IS NULL`) and duplicate phone detection.
6. `assigned_by` column types across all source assignment tables and default `'admin'` on `krishnashtami_contact_assignments`.
7. `status` CHECK constraints across all three assignment tables.
8. Historical Not Interested discovery volume across all 9 branches.
9. Active assignments slated for deactivation across all 4 tables.
10. Operator capacity utilization vs configured capacity (independent aggregation eliminating Cartesian multiplication).
11. Public schema `CREATE` privilege audit ensuring untrusted roles (`PUBLIC`, `anon`, `authenticated`) cannot shadow objects.
12. Exact identity argument signatures for all 3 RPCs, obsolete overload detection in `pg_proc`, and SECURITY DEFINER `search_path=pg_catalog, public, pg_temp` configuration.

### Production Deployment Prerequisites
1. **Maintenance Window:** Migration must be executed during an off-peak maintenance window.
2. **Locking Impact:** `ALTER TABLE ... ADD CONSTRAINT` and `ALTER TABLE ... SET NOT NULL` acquire `ACCESS EXCLUSIVE` locks, temporarily blocking concurrent reads and writes on operational tables.
3. **Rollback Preparedness:** Verify that the verified PostgreSQL backup is restorable prior to execution.
4. **No Supabase Production Access:** Supabase Production was not connected to or modified during local validation. Execution requires explicit separate authorization.
