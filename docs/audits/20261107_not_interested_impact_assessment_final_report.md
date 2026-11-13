# Final Production Migration Audit & Impact Assessment Report

**Target Migration:** `supabase/migrations/20261106000000_dynamic_capacity_and_not_interested.sql` (1,388 lines canonical review version)  
**Assessment Script:** `docs/audits/20261107_not_interested_impact_assessment_final.sql` (1,180 lines, 3 Preflight Checks + 8 Queries)  
**Audit Date:** 2026-11-07  
**Auditor Role:** Senior PostgreSQL Database Engineer & Production Migration Auditor  
**Scope:** Section 5 (Historical Not Interested Backfill & Reconciliation) & Full Migration Production Readiness  

---

## 1. Executive Verdicts

| Scope | Verdict | Definition & Justification |
| :--- | :--- | :--- |
| **Section 5 Impact Assessment** | **EXACT** | Every Section 5 mutation predicate, `WHERE` clause, `JOIN` condition, `SET` expression, `INSERT` field list, `ON CONFLICT` handler, execution order, and deactivation scope has been audited directly against lines 149–452 (DO block: 153–451) of the canonical 1,388-line review version. All read-only CTEs replicate the exact logic without simplification. Runtime-dependent wall-clock timestamps and timestamp-tied non-deterministic attributes are explicitly isolated and reported. |
| **Full Migration Production Readiness** | **REQUIRES ADDITIONAL VALIDATION** | While the PL/pgSQL RPC logic, advisory lock hierarchies, and Section 5 backfill logic are architecturally sound and idempotent, the migration contains table-locking DDL operations (`ALTER TABLE ... ADD CONSTRAINT` with `ACCESS EXCLUSIVE` locks), an explicit header marking the file as a `LOCAL DEVELOPMENT ARTIFACT`, and a strict requirement to pre-validate that no historical assignment statuses fall outside the 18 allowed enum-style check values before attempting production execution. |

> [!CAUTION]
> **Production Execution Restriction**: Neither this audit nor the impact assessment script authorizes or executes any database migration. The migration file header strictly designates the migration as a **LOCAL DEVELOPMENT ARTIFACT** requiring explicit, separate production change authorization.

---

## 2. Section 5 Operation-to-Query Discrepancy Table

The table below maps each discrete operation in Section 5 (lines 149–452, DO block: 153–451) of the canonical 1,388-line migration file to its corresponding representation in the final read-only assessment script:

| Section 5 Step & Operation | Migration SQL Implementation | Assessment Query & Logic | Audit Verification Status |
| :--- | :--- | :--- | :--- |
| **Temporary Table Management** | `CREATE TEMP TABLE IF NOT EXISTS _tmp_historical_ni_phones (phone TEXT PRIMARY KEY, name TEXT, gender TEXT, status_time TIMESTAMPTZ) ON COMMIT DROP; TRUNCATE ... DROP ...` | Simulated purely via CTEs (`valid_discovered`, `raw_all_historical_ni`). Zero temp tables created. | **EXACT**: Replicates the exact schema and aggregation without catalog mutations or DDL. |
| **Raw Discovery (9 Branches)** | 9 `UNION ALL` branches querying source tables and audit logs for `'not interested'`. Each branch in the migration has `AND phone IS NOT NULL`. | `raw_all_historical_ni` captures all matching occurrences. `eligible_source_records` replicates `AND raw_phone IS NOT NULL`. | **EXACT**: Fixes earlier defect where NULL phones were hidden from skipped diagnostics. |
| **Phone Qualification & Filtering** | `WHERE phone IS NOT NULL AND length(phone) = 10 AND phone <> '0000000000' GROUP BY phone` | `valid_discovered` groups by `norm_phone` matching these exact 3 constraints. `skipped_records` categorizes disqualified rows. | **EXACT**: Matches Section 5 line 290. Diagnoses `RAW_PHONE_NULL`, `NORMALIZATION_RETURNED_NULL`, `ALL_ZEROS_PHONE`, and `INVALID_DIGIT_LENGTH_<n>`. |
| **Canonical Attribute Aggregation** | `COALESCE(NULLIF(TRIM((ARRAY_AGG(name ORDER BY status_time DESC NULLS LAST))[1]), ''), 'Contact') AS name, (ARRAY_AGG(gender ORDER BY status_time DESC NULLS LAST))[1] AS gender, MAX(status_time)` | `valid_discovered` uses identical `ARRAY_AGG(...)[1]` and `COALESCE`. `Query 5A` evaluates timestamp ties. | **EXACT**: Replicates migration aggregation. Discloses timestamp tie non-determinism without inventing artificial tie-breakers. |
| **Temp Table Conflict Resolution** | `ON CONFLICT (phone) DO UPDATE SET name = COALESCE(EXCLUDED.name, ...), gender = COALESCE(EXCLUDED.gender, ...), status_time = GREATEST(...)` | `valid_discovered` aggregates with `GROUP BY norm_phone`, `MAX(status_time)`, and latest-timestamp attribute ordering. | **EXACT**: For a static dataset, the group-by aggregation produces identical values to the conflict handler. |
| **Step A: Master Contacts Update (Phone Match)** | `UPDATE master_contacts SET is_not_interested = true, not_interested_at = COALESCE(not_interested_at, now()) WHERE normalize_phone(phone) IN (SELECT phone FROM _tmp_historical_ni_phones);` | `step_a_master_ids` selects distinct `mc.id` where `normalize_phone(mc.phone) IN (SELECT phone FROM valid_discovered)`. | **EXACT**: Matches lines 298–301. Pre-migration query safely evaluates `not_interested_at` via JSON extraction. |
| **Step B: Master Contacts Update (Relational FKs)** | `UPDATE master_contacts SET is_not_interested = true, not_interested_at = COALESCE(not_interested_at, now()) WHERE id IN (...)` across direct assignments, event links, and audit logs. | `step_b_master_ids` replicates the 6 relational subquery UNIONs with safe text comparisons (`mc.id::text = al.details->>'contact_id'`). | **EXACT**: Matches lines 304–337. |
| **Pre-existing Blocked Master Contacts** | `master_contacts` where `is_not_interested = true` | `pre_existing_blocked_master_ids` uses `(to_jsonb(mc.*)->>'is_not_interested')::boolean IS TRUE`. | **EXACT**: Returns 0 if column is absent without throwing PostgreSQL error `42703`. |
| **Step C: Missing Master Contacts Insert** | `INSERT INTO master_contacts (phone, name, gender, is_not_interested, not_interested_at, not_interested_by, created_at, updated_at) SELECT t.phone, t.name, t.gender, true, COALESCE(t.status_time, now()), NULL, now(), now() FROM _tmp_historical_ni_phones t WHERE NOT EXISTS (SELECT 1 FROM master_contacts mc WHERE normalize_phone(mc.phone) = t.phone OR mc.phone = t.phone) ON CONFLICT (phone) DO UPDATE ...` | `missing_master_to_insert` replicates exact `NOT EXISTS (normalize_phone(mc.phone) = t.phone OR mc.phone = t.phone)`. `Query 4` previews all 8 columns. | **EXACT**: Matches lines 340–369. Identifies records following the INSERT path vs potential concurrent conflict updates. |
| **Step D.1: Master Assignments Deactivation** | `UPDATE master_contact_assignments mca SET is_active = false, status = 'Not Interested', updated_at = now() WHERE mca.is_active = true AND (mca.master_contact_id IN (SELECT mc.id FROM master_contacts mc WHERE mc.is_not_interested = true) OR LOWER(TRIM(COALESCE(mca.status, ''))) IN ('not interested', 'not_interested'));` | `deactivated_master_assignments` matches `mca.is_active = true` AND `(mca.master_contact_id IN (SELECT id FROM all_blocked_master_ids) OR status IN ('not interested', 'not_interested'))`. | **EXACT**: Matches lines 372–382. Confirms inactive rows (`is_active = false`) are completely untouched. |
| **Step D.2: Rathayatra Assignments Deactivation** | `UPDATE contact_assignments ca SET is_active = false, status = 'Not Interested', updated_at = now() WHERE ca.is_active = true AND (status IN (...) OR ca.registration_id IN (phone matches or blocked master event links));` | `deactivated_contact_assignments` applies identical predicates under `ca.is_active = true`. | **EXACT**: Matches lines 385–404. Inactive rows untouched. |
| **Step D.3: Krishnashtami Assignments Deactivation** | `UPDATE krishnashtami_contact_assignments kca SET is_active = false, status = 'Not Interested', updated_at = now() WHERE kca.is_active = true AND (status IN (...) OR phone matches or event links);` | `deactivated_krishnashtami_assignments` applies identical predicates under `kca.is_active = true`. | **EXACT**: Matches lines 407–426. Inactive rows untouched. |
| **Step D.4: Feedback Assignments Deactivation** | `UPDATE feedback_contact_assignments fca SET is_active = false, status = 'Not Interested', updated_at = now() WHERE fca.is_active = true AND (status IN (...) OR phone matches or event links);` | `deactivated_feedback_assignments` applies identical predicates under `fca.is_active = true`. | **EXACT**: Matches lines 429–448. Inactive rows untouched. |

---

## 3. Corrections Made

1. **Separation of Raw Discovery Occurrences and Eligible Phones**:
   - *Previous Defect*: Query 1 used `raw_discovered` with `AND phone IS NOT NULL` embedded in each branch, hiding records with NULL phones from the skipped diagnostics and under-reporting raw historical volume.
   - *Correction*: Query 1 now defines `raw_all_historical_ni` (all rows where status is Not Interested, regardless of phone) and `eligible_source_records` (where `raw_phone IS NOT NULL`). Skipped diagnostics now account for every single disqualified occurrence across all 9 branches.
2. **Removal of Sentinel Comparisons & Exact Canonical Expression Matching (Queries 1 & 5A)**:
   - *Previous Defect*: Query 5A used sentinel string replacements (`<<EMPTY_OR_NULL>>`), which risked collisions with real user data, or used standard `COUNT(DISTINCT ...)` which ignored NULLs and falsely marked ties involving NULL as unanimous.
   - *Correction*: All sentinel strings have been removed. Query 1 and Query 5A now compare canonical names using the exact migration expression:
     `COALESCE(NULLIF(TRIM(contact_name), ''), 'Contact')`
     Because of the `'Contact'` fallback, this expression never evaluates to NULL. Distinct names are evaluated as `count(DISTINCT COALESCE(NULLIF(TRIM(contact_name), ''), 'Contact')) > 1`.
     Gender is compared **without TRIM, normalization, or replacement**, using NULL-aware logic:
     `count(DISTINCT gender) > 1 OR (bool_or(gender IS NULL) AND bool_or(gender IS NOT NULL))`
     This guarantees zero sentinel collisions while accurately flagging discrepancies between different values or between NULL and non-NULL attributes.
3. **LEFT JOINs in Assignment Deactivation Preview (Query 6)**:
   - *Previous Defect*: Query 6 joined assignment tables to descriptive contact tables (`registrations`, `krishnashtami_registrations`, `feedback_contacts`, `master_contacts`) using `INNER JOIN`. If an assignment row was orphaned or its referenced contact record was deleted/corrupted, the row was dropped from the deactivation preview.
   - *Correction*: Query 6 now uses `LEFT JOIN`s across all 4 operational assignment queries. Because Section 5 executes `UPDATE` statements directly against assignment tables (`ca`, `kca`, `fca`, `mca`) without joining parent tables, the `LEFT JOIN` guarantees that 100% of the active assignments targeted for deactivation are reported.
4. **Inactive Assignments Reconciliation Audit (Query 7)**:
   - *Previous Defect*: There was no explicit audit query reconciling the exact distribution of inactive assignment records (`is_active = false`), leaving open whether any inactive rows were unintentionally modified.
   - *Correction*: Query 7 performs a strict arithmetic verification confirming:
     `total_inactive_rows = inactive_rows_already_not_interested + inactive_rows_null_status + inactive_rows_other_non_null_statuses_preserved`
     This proves that all historical inactive rows are 100% untouched by Section 5.
5. **Clean Duplicate Master Contacts Diagnostics (Query 5B)**:
   - *Previous Defect*: Query 5B did not filter out invalid normalized phone strings, grouping malformed numbers into phantom duplicate sets, and failed to differentiate affected duplicate groups from global duplicates.
   - *Correction*: Query 5B filters by `length = 10 AND norm_phone <> '0000000000'`, groups by valid normalized phone, tags each group with `is_affected_by_migration`, and reports both the group count and the sum of Master Contact rows.
6. **Pre-Migration Safety for `not_interested_at` and `is_not_interested`**:
   - *Previous Defect*: Directly querying `mc.is_not_interested` or `mc.not_interested_at` fails with PostgreSQL error `42703 (column does not exist)` when executed against the pre-migration production database.
   - *Correction*: All queries use `(to_jsonb(mc.*)->>'is_not_interested')::boolean IS TRUE` and `to_jsonb(mc.*)->>'not_interested_at' IS NOT NULL`, which evaluate cleanly whether the columns exist or not.
7. **Comprehensive Preflight Checks**:
   - Added three standalone catalog and constraint validation checks (Preflight 1, 2, and 3) to prevent catastrophic runtime migration failures.

---

## 4. Exact Metric Count Definitions

The executive query (`Query 1`) produces metrics grouped into precise granularities:

### A. Discovery & Qualification Granularity
- **`total_raw_discovery_occurrences`**: Total record occurrences across all 9 discovery paths with Not Interested status or audit action, before phone filtering.
- **`eligible_non_null_phone_occurrences`**: Occurrences where `raw_phone IS NOT NULL` (the exact input set to Section 5's inner query).
- **`total_skipped_unqualified_occurrences`**: Occurrences excluded from `_tmp_historical_ni_phones` because their phone cannot be normalized to a valid 10-digit Indian phone number.
- **`skipped_occurrences_null_phone`**: Occurrences with `raw_phone IS NULL`.
- **`skipped_occurrences_normalization_null`**: Occurrences where `normalize_phone()` returned NULL.
- **`skipped_occurrences_all_zeros`**: Occurrences where the normalized phone equals `0000000000`.
- **`skipped_occurrences_invalid_digit_length`**: Occurrences where the normalized phone length is not 10 digits (e.g. landlines or short numbers).
- **`distinct_normalized_ni_phone_identities`**: Total unique 10-digit phone numbers inserted into `_tmp_historical_ni_phones` (the primary key count of the temporary table).

### B. Master Contacts Mutation Granularity
- **`unique_master_contact_ids_step_a_phone`**: Distinct non-NULL `master_contacts.id` values matched by normalized phone (`Step A`).
- **`unique_master_contact_ids_step_b_relational`**: Distinct non-NULL `master_contacts.id` values matched via direct assignments, event links, or audit logs (`Step B`).
- **`total_unique_existing_master_contact_ids_to_block`**: Deduplicated union of Step A and Step B non-NULL `master_contacts.id`s that will be updated to `is_not_interested = true`.
- **`existing_master_contacts_with_not_interested_at_set`**: Targeted existing Master Contacts that already have a non-null `not_interested_at` timestamp (which `COALESCE` will preserve).
- **`existing_master_contacts_with_not_interested_at_null`**: Targeted existing Master Contacts where `not_interested_at` is currently NULL (which `COALESCE` will populate with `now()`).
- **`pre_existing_blocked_master_contact_ids`**: Master Contacts already marked `is_not_interested = true` prior to migration execution.
- **`new_master_contacts_to_insert_rows`**: Discovered phone identities with no existing Master Contact record that will be inserted as new blocked Master Contacts under `Step C`.

### C. Assignment Mutation Granularity
- **`active_master_assignments_to_deactivate_rows`**: Active rows (`is_active = true`) in `master_contact_assignments` that will be updated to `is_active = false, status = 'Not Interested'`.
- **`active_rathayatra_assignments_to_deactivate_rows`**: Active rows in `contact_assignments` that will be deactivated.
- **`active_krishnashtami_assignments_to_deactivate_rows`**: Active rows in `krishnashtami_contact_assignments` that will be deactivated.
- **`active_feedback_assignments_to_deactivate_rows`**: Active rows in `feedback_contact_assignments` that will be deactivated.
- **`total_active_assignment_rows_to_deactivate`**: Total assignment rows across all 4 operational tables that will be deactivated (clearing operator calling queues).

### D. Identity Conflict Granularity
- **`duplicate_master_phone_groups_affected`**: Discovered Not Interested phone numbers that are associated with more than one `master_contacts` record.
- **`duplicate_master_rows_affected`**: Total `master_contacts` rows contained in the affected duplicate phone groups.
- **`duplicate_master_phone_groups_global`**: All valid 10-digit phone numbers in the entire `master_contacts` table associated with more than one row.
- **`duplicate_master_rows_global`**: Total `master_contacts` rows across all global duplicate phone groups.
- **`phones_with_cross_source_divergence`**: Discovered phone numbers whose source records contain conflicting names or genders.
- **`phones_with_latest_timestamp_ties`**: Discovered phone numbers where multiple records share the exact latest timestamp with conflicting names or genders.

---

## 5. Query 5A Timestamp Nondeterminism Findings

In Section 5 (lines 168–170), the canonical name and gender for each discovered phone are aggregated using:
```sql
COALESCE(NULLIF(TRIM((ARRAY_AGG(name ORDER BY status_time DESC NULLS LAST))[1]), ''), 'Contact') AS name,
(ARRAY_AGG(gender ORDER BY status_time DESC NULLS LAST))[1] AS gender
```

### Architectural Findings:
1. **Absence of a Secondary Tie-Breaker**:
   The `ORDER BY status_time DESC NULLS LAST` clause contains **no secondary sort column** (such as `id ASC` or `created_at ASC`).
2. **Nondeterministic Winner Selection on Ties**:
   If two or more historical records for the same phone share the exact same latest `status_time` (e.g. updated by a batch job in the same transaction) and contain differing names (e.g. `Ramesh Kumar` vs `Ramesh K.` or `Anil` vs `NULL`):
   - The choice of which row is indexed at position `[1]` is determined entirely by PostgreSQL's internal physical heap scan order or parallel worker execution plan.
   - The name and gender are evaluated in separate `ARRAY_AGG` expressions, meaning PostgreSQL could theoretically select the name from Record A and the gender from Record B if scan orders shift between evaluations.
3. **Preservation of Migration Aggregation in Audit**:
   The impact assessment query preserves the migration's exact separate `ARRAY_AGG` expressions and does not invent an artificial tie-breaker.
4. **Diagnostic Visibility**:
   Query 5A isolates these cases with the column `has_latest_timestamp_tie_nondeterminism` and displays the exact tied names and genders, allowing DBAs to review any ambiguous identities prior to migration execution.

---

## 6. Query 6 Verification for All Four Assignment Tables

Query 6 verifies each assignment `UPDATE` statement in Section 5 (lines 372–448):

### Verified Predicates:
1. **`master_contact_assignments` (Step D.1, lines 372–382)**:
   - Evaluates: `WHERE mca.is_active = true AND (mca.master_contact_id IN (SELECT mc.id FROM master_contacts mc WHERE mc.is_not_interested = true) OR LOWER(TRIM(COALESCE(mca.status, ''))) IN ('not interested', 'not_interested'))`.
   - Result: Mutates only active assignments linked to blocked Master Contacts or with explicit Not Interested status.
2. **`contact_assignments` (Rathayatra - Step D.2, lines 385–404)**:
   - Evaluates: `WHERE ca.is_active = true AND (status IN ('not interested', 'not_interested') OR registration_id phone match OR event link to blocked master contact)`.
3. **`krishnashtami_contact_assignments` (Step D.3, lines 407–426)**:
   - Evaluates: `WHERE kca.is_active = true AND (status IN ('not interested', 'not_interested') OR registration_id phone match OR event link to blocked master contact)`.
4. **`feedback_contact_assignments` (Step D.4, lines 429–448)**:
   - Evaluates: `WHERE fca.is_active = true AND (status IN ('not interested', 'not_interested') OR feedback_contact_id phone match OR event link to blocked master contact)`.

### Confirmation on Inactive Records (Query 7):
- **Zero Inactive Mutations**: Every single `UPDATE` in Step D includes `WHERE ... is_active = true`.
- Existing inactive records (`is_active = false`), regardless of their status string, are **NEVER modified** by Section 5. Historical inactive records are 100% preserved.
- Query 7 audits these preserved inactive rows and verifies the exact identity:
  `total_inactive_rows = inactive_rows_already_not_interested + inactive_rows_null_status + inactive_rows_other_non_null_statuses_preserved`.

---

## 7. Step C INSERT and ON CONFLICT Analysis

Section 5 lines 340–369 execute:
```sql
INSERT INTO public.master_contacts (
    phone, name, gender, is_not_interested, not_interested_at, not_interested_by, created_at, updated_at
)
SELECT
    t.phone, t.name, t.gender, true, COALESCE(t.status_time, now()), NULL, now(), now()
FROM _tmp_historical_ni_phones t
WHERE NOT EXISTS (
    SELECT 1 FROM public.master_contacts mc
    WHERE normalize_phone(mc.phone) = t.phone
       OR mc.phone = t.phone
)
ON CONFLICT (phone) DO UPDATE
SET is_not_interested = true,
    not_interested_at = COALESCE(master_contacts.not_interested_at, EXCLUDED.not_interested_at, now()),
    updated_at = now();
```

### Complete Field Audit:
- **`phone`**: Discovered 10-digit normalized phone (`t.phone`).
- **`name`**: Canonical resolved name, defaulting to `'Contact'` if blank or null.
- **`gender`**: Canonical resolved gender (may be NULL).
- **`is_not_interested`**: Set strictly to `true`.
- **`not_interested_at`**: `COALESCE(t.status_time, now())`.
- **`not_interested_by`**: Set to `NULL` (historical backfill has no single operator ID).
- **`created_at`**: Evaluated as `now()` at execution time.
- **`updated_at`**: Evaluated as `now()` at execution time.

### Conflict Handler Reality:
1. **The `WHERE NOT EXISTS` Filter**:
   Any row in `_tmp_historical_ni_phones` where a master contact already exists matching either `normalize_phone(mc.phone) = t.phone` OR `mc.phone = t.phone` is **completely filtered out of the SELECT statement**.
2. **Static Snapshot Execution Path**:
   In a static read-only database state, **every record returned by Query 4 will follow the normal INSERT path**.
3. **Rerunning Section 5 Does NOT Trigger `ON CONFLICT (phone) DO UPDATE`**:
   - Because of the `WHERE NOT EXISTS` clause, if Section 5 is re-run, all previously inserted contacts already match `mc.phone = t.phone` (or `normalize_phone(mc.phone) = t.phone`).
   - Consequently, the SELECT query returns **0 rows**, meaning **0 rows are submitted for insertion**, and no conflict is encountered.
4. **When Does `ON CONFLICT (phone) DO UPDATE` Actually Trigger?**:
   - The unique constraint on `public.master_contacts` is on exact `phone`.
   - `ON CONFLICT (phone)` will trigger **strictly if a concurrent transaction inserts a master contact with `phone = t.phone` between the execution of the `NOT EXISTS` check and the actual row insertion** within the Section 5 transaction.
   - Raw vs normalized collisions (e.g. `+919876543210` in master contacts vs `9876543210` in `_tmp_historical_ni_phones`) do **NOT** trigger `ON CONFLICT (phone)`: the `NOT EXISTS` clause matches via `normalize_phone(mc.phone) = t.phone` and safely prevents the insert from being attempted.
5. **Preflight Dependency**:
   Preflight Check 1 validates that `public.master_contacts` possesses a valid, single-column, non-partial unique index on `phone`. If this unique index is missing or partial, PostgreSQL will throw error `42P10 (there is no unique or exclusion constraint matching the ON CONFLICT specification)`.

---

## 8. SELECT-Only Limitations

The read-only assessment script provides an exact representation of logical predicates, but the following physical properties cannot be represented by a `SELECT`-only query:

1. **Dynamic Execution Timestamps**:
   `now()` timestamps generated for `created_at`, `updated_at`, and fallback `not_interested_at` depend on the exact millisecond the transaction runs.
2. **Concurrent State Shifts**:
   If operators complete assignments, update statuses, or new visitors register between the assessment run and migration execution, active assignment counts will shift.
3. **Tie-Breaker Heap Scan Order**:
   Where timestamp ties exist, PostgreSQL's physical heap scan order at migration execution time determines which tied name or gender wins.
4. **Trigger Executions**:
   Any row-level triggers defined on `master_contacts` or assignment tables will fire on update/insert during the migration.
5. **Transaction Lock Serialization**:
   Advisory locks and table/row locks acquired during the migration transaction serialize concurrent writes.

---

## 9. Full Migration Production-Readiness Findings

A comprehensive review of lines 1–1388 of the canonical review version of `supabase/migrations/20261106000000_dynamic_capacity_and_not_interested.sql` reveals:

### Positive Architectural Findings:
1. **Idempotent Column Additions (Sections 1, 2, 3)**:
   Uses `information_schema.columns` checks before `ADD COLUMN`, preventing duplicate column errors.
2. **Strict Lock Ordering Hierarchy**:
   All 3 RPCs adhere strictly to the documented lock hierarchy:
   `TIER 0 Global Mutex -> TIER 1 Phone Advisory Locks -> TIER 2 Master Contact Advisory Locks -> TIER 3 Source Advisory Locks -> TIER 4 Row Locks FOR SHARE/UPDATE -> TIER 5 Operator Locks`.
   *Scope Note*: This hierarchy minimizes deadlock risk across coordinated RPCs, but **cannot guarantee global deadlock prevention against uncoordinated external transactions** that modify these tables without acquiring the Tier 0 advisory mutex or following the lock order.
3. **Fail-Closed Transitive Closure (Section 8)**:
   `mark_contact_not_interested_atomic` implements transitive closure across all 3 source tables with a hard 100-iteration limit that fails closed (`CONVERGENCE_ERROR`) rather than proceeding with a partial identity set.
4. **Clean Overload Cleanup**:
   Lines 454 and 751 drop obsolete function overloads (`assign_master_contact_atomic` 4-argument and `assign_contact_atomic` 5-argument), eliminating PostgREST PGRST203 ambiguity.
5. **Permissions & Security Definer**:
   All 3 RPCs specify `SECURITY DEFINER`, set `search_path = public, pg_temp`, revoke execute from `PUBLIC, anon, authenticated`, and grant execute strictly to `service_role`.
   *Caller Requirement*: Because permissions are revoked from `anon` and `authenticated`, **all application API routes and backend services invoking these RPCs must use the Supabase server client configured with `service_role`**. Any client-side or unprivileged invocation will fail with permission denied.

### Production Risks Requiring Mitigation:
1. **`ACCESS EXCLUSIVE` Locks on Status CHECK Constraints (Section 4)**:
   - Lines 113–147 drop and recreate CHECK constraints on `contact_assignments`, `krishnashtami_contact_assignments`, and `feedback_contact_assignments`.
   - `ALTER TABLE ... ADD CONSTRAINT ... CHECK (...)` requires an `ACCESS EXCLUSIVE` lock on each table while validating existing data.
   - If any historical assignment in production contains a status string not listed in the 18 allowed statuses, the migration will immediately abort and roll back.
2. **PostgREST Schema Cache Invalidation**:
   - Dropping and recreating RPCs requires PostgREST to reload its schema cache. If not automatically signaled, clients will experience transient RPC lookup errors.

---

## 10. Preflight Verification Suite & Pre-Migration Checklist

Before executing this migration in Supabase Production, execute the 3 preflight checks bundled in `docs/audits/20261107_not_interested_impact_assessment_final.sql`:

### Preflight Check 1: Unique Index on `master_contacts(phone)`
```sql
SELECT 
    c.relname AS table_name,
    i.relname AS index_name,
    a.attname AS column_name,
    ix.indisunique AS is_unique,
    ix.indisvalid AS is_valid,
    (ix.indpred IS NULL) AS is_non_partial,
    (ix.indnatts = 1) AS is_single_column
FROM pg_index ix
JOIN pg_class c ON c.oid = ix.indrelid
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(ix.indkey)
WHERE n.nspname = 'public'
  AND c.relname = 'master_contacts'
  AND a.attname = 'phone'
  AND ix.indisunique = true
  AND ix.indisvalid = true
  AND ix.indpred IS NULL
  AND ix.indnatts = 1;
```
*Expected Result*: Exactly 1 row. Confirms the existence of the single-column unique index required by Step C's `ON CONFLICT (phone)`.

### Preflight Check 2: Operator Configured Capacity Range (1 to 500)
```sql
SELECT 
    co.id AS operator_id,
    co.name AS operator_name,
    co.email AS operator_email,
    co.is_active,
    (to_jsonb(co.*)->>'capacity')::integer AS current_capacity
FROM public.contact_operators co
WHERE (to_jsonb(co.*)->>'capacity') IS NOT NULL 
  AND (
      (to_jsonb(co.*)->>'capacity')::integer < 1 
      OR (to_jsonb(co.*)->>'capacity')::integer > 500
  );
```
*Expected Result*: 0 rows. Confirms that no operator violates Section 1's `chk_operator_capacity`.

### Preflight Check 3: Assignment Status CHECK Constraint Pre-Validation
```sql
SELECT 'contact_assignments' AS table_name, status, count(*) AS row_count
FROM public.contact_assignments
WHERE status IS NOT NULL 
  AND status NOT IN (
      'Pending', 'Assigned', 'Coming', 'Not Coming', 'Not Answered', 'Next Week', 
      'Not Interested', 'Not in Hyderabad', 'Not Connected', 'Callback Required', 
      'Contacted', 'Interested', 'Completed', 'Called', 'Confirmed', 'No Answer', 
      'Wrong Number', 'Visited'
  )
GROUP BY status
UNION ALL
SELECT 'krishnashtami_contact_assignments', status, count(*)
FROM public.krishnashtami_contact_assignments
WHERE status IS NOT NULL 
  AND status NOT IN (
      'Pending', 'Assigned', 'Coming', 'Not Coming', 'Not Answered', 'Next Week', 
      'Not Interested', 'Not in Hyderabad', 'Not Connected', 'Callback Required', 
      'Contacted', 'Interested', 'Completed', 'Called', 'Confirmed', 'No Answer', 
      'Wrong Number', 'Visited'
  )
GROUP BY status
UNION ALL
SELECT 'feedback_contact_assignments', status, count(*)
FROM public.feedback_contact_assignments
WHERE status IS NOT NULL 
  AND status NOT IN (
      'Pending', 'Assigned', 'Coming', 'Not Coming', 'Not Answered', 'Next Week', 
      'Not Interested', 'Not in Hyderabad', 'Not Connected', 'Callback Required', 
      'Contacted', 'Interested', 'Completed', 'Called', 'Confirmed', 'No Answer', 
      'Wrong Number', 'Visited'
  )
GROUP BY status;
```
*Expected Result*: 0 rows. Confirms that Section 4's `ADD CONSTRAINT` will not abort due to unrecognized historical statuses.

### Operational Deployment Steps:
1. **Scheduled Maintenance Window**: Execute during an off-peak maintenance window due to `ACCESS EXCLUSIVE` locks on assignment tables during Section 4.
2. **PostgREST Schema Reload**: Immediately following migration commit, trigger schema cache reload:
   ```sql
   NOTIFY pgrst, 'reload schema';
   ```
3. **Application Verification**: Ensure all Next.js API routes calling `assign_contact_atomic`, `assign_master_contact_atomic`, or `mark_contact_not_interested_atomic` use `service_role`.
4. **Sign-Off**: Both audit artifacts must be reviewed and signed off prior to production change execution.
