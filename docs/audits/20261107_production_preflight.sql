-- ============================================================================
-- Production Preflight Readiness & Post-Migration Verification Assessment Script
-- Migration: 20261106000000_dynamic_capacity_and_not_interested.sql
-- Target Database: HKM Admin Portal (Supabase PostgreSQL 15/16)
--
-- STRICT RESTRICTION: LOCAL DEVELOPMENT ARTIFACT.
-- DO NOT EXECUTE ON PRODUCTION DATABASE WITHOUT EXPLICIT SEPARATE AUTHORIZATION.
--
-- READ-ONLY VERIFICATION SCRIPT.
-- Contains ZERO mutations (NO INSERT, UPDATE, DELETE, ALTER, DROP, CREATE, TRUNCATE).
-- All queries are SELECT-only diagnostics to evaluate pre-conditions and safety
-- prior to executing the migration in a maintenance window, or to verify
-- compliance after migration execution.
--
-- EXECUTION MODES:
-- 1. 'pre'  (DEFAULT / PRE-MIGRATION READINESS):
--    Evaluates the original pre-migration database. Expected objects not yet created
--    by the migration report MISSING_BUT_WILL_BE_CREATED_BY_MIGRATION. Genuine blockers
--    (incompatible constraints, invalid capacities, orphaned foreign keys) report BLOCKER_*.
-- 2. 'post' (POST-MIGRATION VERIFICATION):
--    Requires all expected migration objects to exist, match expected definitions,
--    and be fully validated. Missing objects or unvalidated constraints report BLOCKER_*.
--
-- Activate mode via session variable:
--   SET app.preflight_mode = 'pre';  -- Pre-migration readiness mode
--   SET app.preflight_mode = 'post'; -- Post-migration verification mode
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SECTION 0: Preflight Execution Mode & Environment Assessment
-- Diagnostic Goal: Output active execution mode ('pre' or 'post').
-- ----------------------------------------------------------------------------
SELECT 
    'SECTION 0: Execution mode initialization' AS check_name,
    LOWER(COALESCE(NULLIF(current_setting('app.preflight_mode', true), ''), 'pre')) AS active_mode,
    CASE 
        WHEN LOWER(COALESCE(NULLIF(current_setting('app.preflight_mode', true), ''), 'pre')) = 'post' 
        THEN 'POST_MIGRATION_VERIFICATION (Requires all objects to exist and be compliant)'
        ELSE 'PRE_MIGRATION_READINESS (Validates pre-conditions; missing objects are expected to be created)'
    END AS mode_description;

-- ----------------------------------------------------------------------------
-- SECTION 1: Operator Capacity Column and Out-of-Range Pre-check
-- Diagnostic Goal: Verify whether contact_operators.capacity exists, its type,
-- nullability, and identify any rows with NULL or out-of-range capacity (< 1 or > 500)
-- that would trigger MIGRATION_BLOCKED.
-- Pre-mode: Missing column is MISSING_BUT_WILL_BE_CREATED_BY_MIGRATION.
-- Post-mode: Missing column or nullable column is NON_COMPLIANT / BLOCKER.
-- ----------------------------------------------------------------------------
WITH expected AS (
    SELECT 
        'public'::text AS expected_schema,
        'contact_operators'::text AS expected_table,
        'capacity'::text AS expected_column,
        'integer'::text AS expected_type
),
actual AS (
    SELECT 
        c.table_name,
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default
    FROM expected exp
    JOIN information_schema.columns c
      ON c.table_schema = exp.expected_schema 
     AND c.table_name = exp.expected_table 
     AND c.column_name = exp.expected_column
)
SELECT 
    'SECTION 1: contact_operators.capacity column pre-check' AS check_name,
    COALESCE(a.column_name, exp.expected_column) AS column_name,
    a.data_type,
    exp.expected_type,
    a.is_nullable,
    a.column_default,
    CASE 
        WHEN a.column_name IS NULL THEN 
            CASE WHEN LOWER(COALESCE(NULLIF(current_setting('app.preflight_mode', true), ''), 'pre')) = 'post'
                 THEN 'BLOCKER_MISSING_COLUMN'
                 ELSE 'MISSING_BUT_WILL_BE_CREATED_BY_MIGRATION'
            END
        WHEN a.data_type <> exp.expected_type THEN 'BLOCKER_INCOMPATIBLE_DATA_TYPE'
        WHEN LOWER(COALESCE(NULLIF(current_setting('app.preflight_mode', true), ''), 'pre')) = 'post'
         AND COALESCE(regexp_replace(a.column_default, '::integer$', ''), '') <> '40' THEN 'NON_COMPLIANT_DEFAULT'
        WHEN LOWER(COALESCE(NULLIF(current_setting('app.preflight_mode', true), ''), 'pre')) = 'post' AND a.is_nullable = 'YES' THEN 'NON_COMPLIANT_NULLABLE'
        ELSE 'COMPLIANT'
    END AS status
FROM expected exp
LEFT JOIN actual a ON true;

WITH col_check AS (
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'contact_operators' 
          AND column_name = 'capacity'
    ) AS col_exists
),
op_caps AS (
    SELECT 
        cc.col_exists,
        co.id,
        co.name,
        co.email,
        co.is_active,
        to_jsonb(co.*) ->> 'capacity' AS raw_cap,
        CASE 
            WHEN NOT cc.col_exists THEN NULL
            WHEN to_jsonb(co.*) ->> 'capacity' IS NULL THEN NULL
            WHEN (to_jsonb(co.*) ->> 'capacity') ~ '^-?[0-9]{1,3}$'
            THEN (to_jsonb(co.*) ->> 'capacity')::integer
            ELSE NULL
        END AS parsed_cap,
        CASE
            WHEN NOT cc.col_exists THEN false
            WHEN to_jsonb(co.*) ->> 'capacity' IS NOT NULL
             AND NOT ((to_jsonb(co.*) ->> 'capacity') ~ '^-?[0-9]+$') THEN true
            ELSE false
        END AS is_incompatible_format,
        CASE
            WHEN to_jsonb(co.*) ->> 'capacity' ~ '^-?[0-9]+$'
             AND length(ltrim(to_jsonb(co.*) ->> 'capacity', '-')) > 3 THEN true
            WHEN to_jsonb(co.*) ->> 'capacity' ~ '^-?[0-9]{1,3}$'
             THEN ((to_jsonb(co.*) ->> 'capacity')::integer < 1 OR (to_jsonb(co.*) ->> 'capacity')::integer > 500)
            ELSE false
        END AS is_out_of_range
    FROM col_check cc
    CROSS JOIN public.contact_operators co
)
SELECT 
    'SECTION 1: contact_operators out-of-range capacity audit' AS check_name,
    COUNT(oc.id) AS total_operators,
    COUNT(*) FILTER (WHERE cc.col_exists AND oc.id IS NOT NULL AND oc.parsed_cap IS NULL AND oc.raw_cap IS NULL) AS null_capacity_count,
    COUNT(*) FILTER (WHERE cc.col_exists AND oc.id IS NOT NULL AND oc.is_incompatible_format) AS incompatible_format_count,
    COUNT(*) FILTER (WHERE cc.col_exists AND oc.id IS NOT NULL AND oc.is_out_of_range) AS out_of_range_count,
    COALESCE(MIN(oc.parsed_cap), 0) AS min_capacity,
    COALESCE(MAX(oc.parsed_cap), 0) AS max_capacity,
    CASE 
        WHEN NOT cc.col_exists THEN 
            CASE WHEN LOWER(COALESCE(NULLIF(current_setting('app.preflight_mode', true), ''), 'pre')) = 'post'
                 THEN 'BLOCKER_COLUMN_MISSING'
                 ELSE 'MISSING_BUT_WILL_BE_CREATED_BY_MIGRATION'
            END
        WHEN COUNT(*) FILTER (WHERE cc.col_exists AND oc.id IS NOT NULL AND oc.is_incompatible_format) > 0 THEN 'BLOCKER_INCOMPATIBLE_DATA_PRESENT'
        WHEN COUNT(*) FILTER (WHERE cc.col_exists AND oc.id IS NOT NULL AND oc.is_out_of_range) > 0 THEN 'BLOCKER_OUT_OF_RANGE_VALUES'
        WHEN LOWER(COALESCE(NULLIF(current_setting('app.preflight_mode', true), ''), 'pre')) = 'post' 
         AND COUNT(*) FILTER (WHERE cc.col_exists AND oc.id IS NOT NULL AND oc.parsed_cap IS NULL) > 0 THEN 'NON_COMPLIANT_NULL_VALUES'
        ELSE 'COMPLIANT'
    END AS status
FROM col_check cc
LEFT JOIN op_caps oc ON true
GROUP BY cc.col_exists;

WITH col_check AS (
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'contact_operators' 
          AND column_name = 'capacity'
    ) AS col_exists
),
op_caps AS (
    SELECT 
        co.id,
        co.name,
        co.email,
        co.is_active,
        to_jsonb(co.*) ->> 'capacity' AS raw_cap,
        CASE 
            WHEN NOT cc.col_exists THEN NULL
            WHEN to_jsonb(co.*) ->> 'capacity' IS NULL THEN NULL
            WHEN (to_jsonb(co.*) ->> 'capacity') ~ '^-?[0-9]{1,3}$'
            THEN (to_jsonb(co.*) ->> 'capacity')::integer
            ELSE NULL
        END AS parsed_cap,
        CASE 
            WHEN NOT cc.col_exists THEN false
            WHEN to_jsonb(co.*) ->> 'capacity' IS NOT NULL 
             AND NOT ((to_jsonb(co.*) ->> 'capacity') ~ '^-?[0-9]+$') THEN true
            ELSE false
        END AS is_incompatible_format
    FROM col_check cc
    JOIN public.contact_operators co ON cc.col_exists
)
SELECT 
    'SECTION 1: contact_operators out-of-range row details' AS check_name,
    oc.id,
    oc.name,
    oc.email,
    oc.raw_cap AS capacity,
    oc.is_active,
    CASE 
        WHEN oc.raw_cap IS NULL THEN 'NULL_CAPACITY'
        WHEN oc.is_incompatible_format THEN 'INCOMPATIBLE_VALUE'
        WHEN oc.raw_cap ~ '^-?[0-9]+$' AND length(ltrim(oc.raw_cap, '-')) > 3 THEN 'OUT_OF_RANGE'
        WHEN oc.parsed_cap < 1 OR oc.parsed_cap > 500 THEN 'OUT_OF_RANGE'
        ELSE 'VALID'
    END AS row_status
FROM op_caps oc
WHERE oc.raw_cap IS NULL 
   OR oc.is_incompatible_format
   OR (oc.raw_cap ~ '^-?[0-9]+$' AND length(ltrim(oc.raw_cap, '-')) > 3)
   OR oc.parsed_cap < 1
   OR oc.parsed_cap > 500;

-- ----------------------------------------------------------------------------
-- SECTION 2: chk_operator_capacity Constraint Check
-- Diagnostic Goal: Verify whether chk_operator_capacity exists on contact_operators,
-- its exact expression, whether it is validated (convalidated), and ensure no 
-- naming collision on other tables.
-- ----------------------------------------------------------------------------
WITH expected AS (
    SELECT 'public'::text AS expected_schema, 'contact_operators'::text AS expected_table, 'chk_operator_capacity'::text AS expected_conname
),
actual_con AS (
    SELECT 
        ns.nspname AS schema_name,
        cls.relname AS table_name,
        pc.conname AS constraint_name,
        pc.contype AS constraint_type,
        pc.convalidated AS is_validated,
        pg_get_constraintdef(pc.oid) AS constraint_definition
    FROM pg_constraint pc
    JOIN pg_class cls ON cls.oid = pc.conrelid
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    WHERE pc.conname = 'chk_operator_capacity'
)
SELECT 
    'SECTION 2: chk_operator_capacity constraint definition' AS check_name,
    COALESCE(ac.schema_name, exp.expected_schema) AS schema_name,
    COALESCE(ac.table_name, exp.expected_table) AS table_name,
    COALESCE(ac.constraint_name, exp.expected_conname) AS constraint_name,
    ac.constraint_type,
    COALESCE(ac.is_validated, false) AS is_validated,
    ac.constraint_definition,
    CASE 
        WHEN ac.constraint_name IS NULL THEN 
            CASE WHEN LOWER(COALESCE(NULLIF(current_setting('app.preflight_mode', true), ''), 'pre')) = 'post'
                 THEN 'BLOCKER_MISSING_CONSTRAINT'
                 ELSE 'MISSING_BUT_WILL_BE_CREATED_BY_MIGRATION'
            END
        WHEN ac.schema_name <> exp.expected_schema OR ac.table_name <> exp.expected_table THEN 'BLOCKER_COLLISION_OTHER_TABLE'
        WHEN regexp_replace(ac.constraint_definition, '[\s\(\)]', '', 'g') = 'CHECKcapacity>=1ANDcapacity<=500' THEN 
            CASE WHEN ac.is_validated THEN 'COMPLIANT' ELSE 'REQUIRES_VALIDATION' END
        WHEN ac.constraint_definition LIKE '%capacity >= 1%' AND ac.constraint_definition LIKE '%capacity <= 500%' THEN
            CASE WHEN ac.is_validated THEN 'COMPATIBLE_EXPRESSION' ELSE 'REQUIRES_VALIDATION' END
        ELSE 'BLOCKER_INCOMPATIBLE_DEFINITION'
    END AS status
FROM expected exp
LEFT JOIN actual_con ac ON true;

-- ----------------------------------------------------------------------------
-- SECTION 3: master_contacts Columns & Nullability Pre-check
-- Diagnostic Goal: Inspect is_not_interested, not_interested_at, not_interested_by
-- on master_contacts, identifying any NULL is_not_interested rows, foreign key
-- configuration (ON DELETE SET NULL), and orphaned not_interested_by IDs.
-- ----------------------------------------------------------------------------
WITH expected_cols AS (
    SELECT 'is_not_interested'::text AS col_name, 'boolean'::text AS exp_type, 'false'::text AS exp_default, false AS exp_nullable
    UNION ALL
    SELECT 'not_interested_at'::text, 'timestamp with time zone'::text, NULL::text, true
    UNION ALL
    SELECT 'not_interested_by'::text, 'uuid'::text, NULL::text, true
),
actual_cols AS (
    SELECT 
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' 
      AND c.table_name = 'master_contacts' 
      AND c.column_name IN ('is_not_interested', 'not_interested_at', 'not_interested_by')
)
SELECT 
    'SECTION 3: master_contacts persistent exclusion columns' AS check_name,
    ec.col_name AS column_name,
    ac.data_type AS actual_type,
    ec.exp_type AS expected_type,
    ac.is_nullable,
    ac.column_default,
    CASE 
        WHEN ac.column_name IS NULL THEN 
            CASE WHEN LOWER(COALESCE(NULLIF(current_setting('app.preflight_mode', true), ''), 'pre')) = 'post'
                 THEN 'BLOCKER_MISSING_COLUMN'
                 ELSE 'MISSING_BUT_WILL_BE_CREATED_BY_MIGRATION'
            END
        WHEN ac.data_type <> ec.exp_type THEN 'BLOCKER_INCOMPATIBLE_DATA_TYPE'
        WHEN LOWER(COALESCE(NULLIF(current_setting('app.preflight_mode', true), ''), 'pre')) = 'post'
         AND ec.col_name = 'is_not_interested'
         AND lower(replace(COALESCE(ac.column_default, ''), '::boolean', '')) <> 'false' THEN 'NON_COMPLIANT_DEFAULT'
        WHEN LOWER(COALESCE(NULLIF(current_setting('app.preflight_mode', true), ''), 'pre')) = 'post'
         AND ec.col_name = 'is_not_interested' AND ac.is_nullable = 'YES' THEN 'NON_COMPLIANT_NULLABLE'
        WHEN LOWER(COALESCE(NULLIF(current_setting('app.preflight_mode', true), ''), 'pre')) = 'post' 
         AND ec.col_name = 'not_interested_by' AND ac.is_nullable = 'NO' THEN 'NON_COMPLIANT_NOT_NULL'
        ELSE 'COMPLIANT'
    END AS status
FROM expected_cols ec
LEFT JOIN actual_cols ac ON ac.column_name = ec.col_name
ORDER BY ec.col_name;

WITH col_check AS (
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'master_contacts' 
          AND column_name = 'is_not_interested'
    ) AS col_exists
),
mc_rows AS (
    SELECT 
        cc.col_exists,
        mc.id,
        to_jsonb(mc.*) ->> 'is_not_interested' AS raw_val
    FROM col_check cc
    CROSS JOIN public.master_contacts mc
)
SELECT 
    'SECTION 3: master_contacts is_not_interested row state' AS check_name,
    COUNT(mr.id) AS total_master_contacts,
    cc.col_exists AS column_exists,
    COUNT(*) FILTER (WHERE cc.col_exists AND mr.id IS NOT NULL AND (mr.raw_val IS NULL OR mr.raw_val = 'null')) AS null_is_not_interested_count,
    COUNT(*) FILTER (WHERE cc.col_exists AND mr.id IS NOT NULL AND mr.raw_val = 'true') AS already_blocked_count,
    COUNT(*) FILTER (WHERE cc.col_exists AND mr.id IS NOT NULL AND mr.raw_val = 'false') AS active_unblocked_count,
    CASE 
        WHEN NOT cc.col_exists THEN 
            CASE WHEN LOWER(COALESCE(NULLIF(current_setting('app.preflight_mode', true), ''), 'pre')) = 'post'
                 THEN 'BLOCKER_COLUMN_MISSING'
                 ELSE 'MISSING_BUT_WILL_BE_CREATED_BY_MIGRATION'
            END
        WHEN LOWER(COALESCE(NULLIF(current_setting('app.preflight_mode', true), ''), 'pre')) = 'post' 
         AND COUNT(*) FILTER (WHERE cc.col_exists AND mr.id IS NOT NULL AND (mr.raw_val IS NULL OR mr.raw_val = 'null')) > 0 THEN 'NON_COMPLIANT_NULL_VALUES'
        ELSE 'COMPLIANT'
    END AS status
FROM col_check cc
LEFT JOIN mc_rows mr ON true
GROUP BY cc.col_exists;

-- Inspect foreign key constraint on master_contacts.not_interested_by with catalog array validation
WITH expected AS (
    SELECT 
        'public'::text AS expected_schema,
        'master_contacts'::text AS expected_table,
        'not_interested_by'::text AS expected_column,
        'public'::text AS expected_ref_schema,
        'contact_operators'::text AS expected_ref_table,
        'id'::text AS expected_ref_column
),
col_info AS (
    SELECT 
        cls.oid AS tbl_oid,
        COALESCE(ns.nspname, e.expected_schema) AS schema_name,
        COALESCE(cls.relname, e.expected_table) AS table_name,
        a.attnum,
        a.attname AS column_name,
        COALESCE(a.attnotnull, false) AS attnotnull,
        (cls.oid IS NOT NULL) AS table_exists
    FROM expected e
    LEFT JOIN pg_namespace ns ON ns.nspname = e.expected_schema
    LEFT JOIN pg_class cls ON cls.relname = e.expected_table AND cls.relnamespace = ns.oid
    LEFT JOIN pg_attribute a ON a.attrelid = cls.oid AND a.attname = e.expected_column AND NOT a.attisdropped
),
fk_constraints AS (
    SELECT 
        ci.schema_name,
        ci.table_name,
        ci.column_name,
        ci.attnotnull,
        ci.table_exists,
        pc.oid AS constraint_oid,
        pc.conname AS constraint_name,
        refns.nspname AS ref_schema,
        refcls.relname AS ref_table,
        pc.conkey,
        pc.confkey,
        cardinality(pc.conkey) AS referencing_column_count,
        cardinality(pc.confkey) AS referenced_column_count,
        pc.confdeltype,
        pc.convalidated,
        (
            SELECT string_agg(refa.attname, ', ' ORDER BY u.ord)
            FROM unnest(pc.confkey) WITH ORDINALITY AS u(attnum, ord)
            JOIN pg_attribute refa ON refa.attrelid = pc.confrelid AND refa.attnum = u.attnum
        ) AS referenced_column_names
    FROM col_info ci
    LEFT JOIN pg_constraint pc 
        ON pc.conrelid = ci.tbl_oid 
       AND pc.contype = 'f' 
       AND ci.attnum = ANY(pc.conkey)
    LEFT JOIN pg_class refcls ON refcls.oid = pc.confrelid
    LEFT JOIN pg_namespace refns ON refns.oid = refcls.relnamespace
)
SELECT 
    'SECTION 3: master_contacts.not_interested_by FK check' AS check_name,
    COALESCE(fk.constraint_name, 'NONE') AS constraint_name,
    COALESCE(fk.table_name, exp.expected_table) AS source_table,
    COALESCE(fk.column_name, exp.expected_column) AS source_column,
    COALESCE(fk.ref_table, 'NONE') AS referenced_table,
    COALESCE(fk.referenced_column_names, 'NONE') AS referenced_column,
    fk.conkey AS source_col_nums,
    fk.confkey AS referenced_col_nums,
    COALESCE(fk.referencing_column_count, 0) AS referencing_column_count,
    COALESCE(fk.referenced_column_count, 0) AS referenced_column_count,
    fk.confdeltype AS on_delete_action_code,
    CASE fk.confdeltype
        WHEN 'a' THEN 'NO ACTION'
        WHEN 'r' THEN 'RESTRICT'
        WHEN 'c' THEN 'CASCADE'
        WHEN 'n' THEN 'SET NULL (REQUIRED)'
        WHEN 'd' THEN 'SET DEFAULT'
        ELSE 'NONE'
    END AS on_delete_action,
    COALESCE(fk.convalidated, false) AS is_validated,
    COALESCE(fk.attnotnull, false) AS is_referencing_col_not_null,
    CASE 
        WHEN fk.table_exists = false THEN 'MISSING_TABLE'
        WHEN fk.column_name IS NULL THEN 
            CASE WHEN LOWER(COALESCE(NULLIF(current_setting('app.preflight_mode', true), ''), 'pre')) = 'post'
                 THEN 'BLOCKER_MISSING_COLUMN'
                 ELSE 'MISSING_BUT_WILL_BE_CREATED_BY_MIGRATION'
            END
        WHEN fk.constraint_oid IS NULL THEN 
            CASE WHEN LOWER(COALESCE(NULLIF(current_setting('app.preflight_mode', true), ''), 'pre')) = 'post'
                 THEN 'BLOCKER_MISSING_FOREIGN_KEY'
                 ELSE 'MISSING_BUT_WILL_BE_CREATED_BY_MIGRATION'
            END
        WHEN fk.referencing_column_count <> 1 OR fk.referenced_column_count <> 1 THEN 'NON_COMPLIANT_COMPOSITE'
        WHEN fk.ref_schema <> exp.expected_ref_schema OR fk.ref_table <> exp.expected_ref_table THEN 'NON_COMPLIANT_WRONG_TABLE'
        WHEN fk.referenced_column_names <> exp.expected_ref_column THEN 'NON_COMPLIANT_WRONG_COLUMN'
        WHEN fk.confdeltype <> 'n' THEN 'NON_COMPLIANT_DELETE_ACTION'
        WHEN fk.attnotnull = true THEN 'NON_COMPLIANT_NOT_NULL'
        WHEN fk.convalidated = false THEN 'REQUIRES_VALIDATION'
        ELSE 'COMPLIANT'
    END AS status
FROM expected exp
LEFT JOIN fk_constraints fk ON true;

-- Detect orphaned operator IDs before migration execution
WITH col_check AS (
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'master_contacts' 
          AND column_name = 'not_interested_by'
    ) AS col_exists
),
candidates AS (
    SELECT 
        to_jsonb(mc.*)->>'not_interested_by' AS raw_op_id,
        CASE 
            WHEN (to_jsonb(mc.*)->>'not_interested_by') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
            THEN (to_jsonb(mc.*)->>'not_interested_by')::uuid
            ELSE NULL
        END AS parsed_uuid,
        CASE 
            WHEN (to_jsonb(mc.*)->>'not_interested_by') IS NOT NULL
             AND NOT ((to_jsonb(mc.*)->>'not_interested_by') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
            THEN true
            ELSE false
        END AS is_malformed_uuid
    FROM col_check cc
    JOIN public.master_contacts mc ON cc.col_exists
    WHERE (to_jsonb(mc.*)->>'not_interested_by') IS NOT NULL
),
orphans AS (
    SELECT 
        c.parsed_uuid AS op_id,
        c.is_malformed_uuid
    FROM candidates c
    WHERE c.is_malformed_uuid = true
       OR (
           c.parsed_uuid IS NOT NULL 
           AND NOT EXISTS (
               SELECT 1 FROM public.contact_operators co 
               WHERE co.id = c.parsed_uuid
           )
       )
)
SELECT 
    'SECTION 3: master_contacts.not_interested_by orphaned FK audit' AS check_name,
    cc.col_exists AS column_exists,
    COUNT(o.op_id) AS orphaned_operator_ids_count,
    COUNT(*) FILTER (WHERE o.is_malformed_uuid) AS malformed_uuid_count,
    ARRAY_AGG(DISTINCT o.op_id) FILTER (WHERE o.op_id IS NOT NULL) AS orphaned_operator_ids,
    CASE 
        WHEN NOT cc.col_exists THEN 
            CASE WHEN LOWER(COALESCE(NULLIF(current_setting('app.preflight_mode', true), ''), 'pre')) = 'post'
                 THEN 'BLOCKER_COLUMN_MISSING'
                 ELSE 'MISSING_BUT_WILL_BE_CREATED_BY_MIGRATION'
            END
        WHEN COUNT(*) FILTER (WHERE o.is_malformed_uuid) > 0 THEN 'BLOCKER_MALFORMED_OPERATOR_IDS'
        WHEN COUNT(o.op_id) > 0 THEN 'BLOCKER_ORPHANED_OPERATORS'
        ELSE 'COMPLIANT'
    END AS status
FROM col_check cc
LEFT JOIN orphans o ON true
GROUP BY cc.col_exists;

-- ----------------------------------------------------------------------------
-- SECTION 4: idx_master_contacts_not_interested Catalog-Based Index Check
-- Diagnostic Goal: Check if the partial index exists, belongs to public.master_contacts,
-- is valid & ready, single-column on is_not_interested, with intended predicate.
-- ----------------------------------------------------------------------------
WITH expected AS (
    SELECT 
        'public'::text AS expected_schema,
        'master_contacts'::text AS expected_table,
        'idx_master_contacts_not_interested'::text AS expected_index,
        'is_not_interested'::text AS expected_column
),
found_indexes AS (
    SELECT 
        c_idx.oid AS index_oid,
        ns_idx.nspname AS index_schema,
        c_idx.relname AS index_name,
        ns_tbl.nspname AS table_schema,
        c_tbl.relname AS table_name,
        i.indisvalid AS is_valid,
        i.indisready AS is_ready,
        i.indnatts AS total_attributes,
        i.indnkeyatts AS key_attributes,
        (i.indexprs IS NOT NULL) AS has_expressions,
        pg_get_expr(i.indpred, i.indrelid) AS predicate_expression,
        CASE 
            WHEN i.indkey[0] = 0 THEN 'EXPRESSION'
            ELSE a.attname
        END AS key_column_name,
        (
            SELECT string_agg(
                CASE WHEN ik = 0 THEN '<expr>' ELSE att.attname END,
                ', '
            )
            FROM unnest(i.indkey) WITH ORDINALITY AS u(ik, ord)
            LEFT JOIN pg_attribute att ON att.attrelid = i.indrelid AND att.attnum = u.ik
        ) AS all_indexed_keys
    FROM expected exp
    JOIN pg_class c_idx ON c_idx.relname = exp.expected_index
    JOIN pg_namespace ns_idx ON ns_idx.oid = c_idx.relnamespace
    JOIN pg_index i ON i.indexrelid = c_idx.oid
    JOIN pg_class c_tbl ON c_tbl.oid = i.indrelid
    JOIN pg_namespace ns_tbl ON ns_tbl.oid = c_tbl.relnamespace
    LEFT JOIN pg_attribute a ON a.attrelid = c_tbl.oid AND a.attnum = i.indkey[0] AND i.indkey[0] <> 0
)
SELECT 
    'SECTION 4: idx_master_contacts_not_interested catalog check' AS check_name,
    COALESCE(fi.index_schema, exp.expected_schema) AS index_schema,
    COALESCE(fi.table_schema, exp.expected_schema) AS table_schema,
    COALESCE(fi.table_name, exp.expected_table) AS table_name,
    COALESCE(fi.index_name, exp.expected_index) AS index_name,
    fi.key_column_name AS index_column,
    fi.all_indexed_keys,
    fi.is_valid,
    fi.is_ready,
    fi.total_attributes,
    fi.key_attributes,
    fi.has_expressions,
    fi.predicate_expression,
    CASE 
        WHEN fi.index_oid IS NULL THEN 
            CASE WHEN LOWER(COALESCE(NULLIF(current_setting('app.preflight_mode', true), ''), 'pre')) = 'post'
                 THEN 'BLOCKER_MISSING_INDEX'
                 ELSE 'MISSING_BUT_WILL_BE_CREATED_BY_MIGRATION'
            END
        WHEN fi.index_schema <> exp.expected_schema OR fi.table_schema <> exp.expected_schema OR fi.table_name <> exp.expected_table THEN 'WRONG_TABLE_OR_SCHEMA'
        WHEN fi.is_valid = false OR fi.is_ready = false THEN 'INVALID_INDEX'
        WHEN fi.has_expressions = true OR fi.key_column_name = 'EXPRESSION' THEN 'NON_COMPLIANT_EXPRESSION_INDEX'
        WHEN fi.key_attributes <> 1 OR fi.total_attributes <> 1 THEN 'NON_COMPLIANT_MULTI_COLUMN'
        WHEN fi.key_column_name <> exp.expected_column THEN 'NON_COMPLIANT_KEY_COLUMN'
        WHEN fi.predicate_expression IS NULL 
          OR (fi.predicate_expression <> '(is_not_interested = true)' AND fi.predicate_expression <> 'is_not_interested')
          THEN 'NON_COMPLIANT_PREDICATE'
        ELSE 'COMPLIANT'
    END AS status
FROM expected exp
LEFT JOIN found_indexes fi ON true;

-- ----------------------------------------------------------------------------
-- SECTION 5: master_contacts.phone Single-Column Unique Index & Duplicate Audit
-- Diagnostic Goal: Verify that a valid, non-partial, non-expression, immediate,
-- single-key unique index exists on master_contacts.phone required for ON CONFLICT (phone).
-- Identify any pre-existing duplicate phones in master_contacts.
-- ----------------------------------------------------------------------------
WITH target AS (
    SELECT
        c.oid AS table_oid,
        a.attnum AS phone_attnum
    FROM (SELECT 1) seed
    LEFT JOIN pg_namespace n ON n.nspname = 'public'
    LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = 'master_contacts' AND c.relkind IN ('r', 'p')
    LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'phone' AND NOT a.attisdropped
),
index_candidates AS (
    SELECT
        ix.indexrelid AS index_oid,
        idx.relname AS index_name,
        ix.indisunique,
        ix.indisvalid,
        ix.indisready,
        ix.indimmediate,
        ix.indpred,
        ix.indexprs,
        ix.indnkeyatts,
        ix.indnatts,
        ix.indkey[0] AS first_key_attnum,
        t.phone_attnum
    FROM target t
    LEFT JOIN pg_index ix
      ON ix.indrelid = t.table_oid
     AND t.phone_attnum IS NOT NULL
     AND t.phone_attnum = ix.indkey[0]
    LEFT JOIN pg_class idx ON idx.oid = ix.indexrelid
),
summary AS (
    SELECT
        COUNT(*) FILTER (WHERE index_oid IS NOT NULL) AS candidate_count,
        COUNT(*) FILTER (
            WHERE index_oid IS NOT NULL
              AND indisunique = true
              AND indisvalid = true
              AND indisready = true
              AND indimmediate = true
              AND indpred IS NULL
              AND indexprs IS NULL
              AND indnkeyatts = 1
              AND first_key_attnum = phone_attnum
        ) AS suitable_count,
        (ARRAY_AGG(index_name ORDER BY index_name) FILTER (WHERE index_oid IS NOT NULL))[1] AS example_index
    FROM index_candidates
)
SELECT
    'SECTION 5: master_contacts.phone unique index check' AS check_name,
    'master_contacts'::text AS table_name,
    s.example_index AS index_name,
    'phone'::text AS column_name,
    s.candidate_count,
    s.suitable_count,
    CASE
        WHEN s.suitable_count > 0 THEN 'READY_FOR_ON_CONFLICT'
        WHEN s.candidate_count = 0 THEN 'BLOCKER_MISSING_UNIQUE_INDEX'
        ELSE 'BLOCKER_NO_SUITABLE_UNIQUE_INDEX'
    END AS status
FROM summary s;

-- Check for any raw duplicate phones in master_contacts
SELECT 
    'SECTION 5: master_contacts raw duplicate phone check' AS check_name,
    phone,
    COUNT(*) AS duplicate_count,
    ARRAY_AGG(id ORDER BY created_at ASC) AS master_contact_ids
FROM public.master_contacts
GROUP BY phone
HAVING COUNT(*) > 1;

-- Check for any normalized duplicate phones in master_contacts
SELECT 
    'SECTION 5: master_contacts normalized duplicate phone check' AS check_name,
    public.normalize_phone(phone) AS normalized_phone,
    COUNT(*) AS duplicate_count,
    ARRAY_AGG(phone ORDER BY created_at ASC) AS raw_phones,
    ARRAY_AGG(id ORDER BY created_at ASC) AS master_contact_ids
FROM public.master_contacts
WHERE phone IS NOT NULL AND length(public.normalize_phone(phone)) = 10 AND public.normalize_phone(phone) <> '0000000000'
GROUP BY public.normalize_phone(phone)
HAVING COUNT(*) > 1;

-- ----------------------------------------------------------------------------
-- SECTION 6: assigned_by Columns Across Source Assignment Tables
-- Diagnostic Goal: Verify presence, exact data type, and column default of assigned_by columns:
-- contact_assignments (uuid), feedback_contact_assignments (uuid), krishnashtami (text, default 'admin')
-- ----------------------------------------------------------------------------
WITH expected_columns AS (
    SELECT 
        'contact_assignments'::text AS table_name,
        'assigned_by'::text AS column_name,
        'uuid'::text AS expected_type,
        NULL::text AS expected_default,
        false AS require_default
    UNION ALL
    SELECT 
        'feedback_contact_assignments'::text,
        'assigned_by'::text,
        'uuid'::text,
        NULL::text,
        false
    UNION ALL
    SELECT 
        'krishnashtami_contact_assignments'::text,
        'assigned_by'::text,
        'text'::text,
        '''admin''::text'::text,
        true
)
SELECT 
    'SECTION 6: assigned_by columns verification' AS check_name,
    ec.table_name,
    ec.column_name,
    COALESCE(format_type(a.atttypid, a.atttypmod), c.data_type) AS actual_type,
    ec.expected_type,
    COALESCE(pg_get_expr(ad.adbin, ad.adrelid), c.column_default) AS actual_default,
    COALESCE(ec.expected_default, 'NONE') AS expected_default,
    c.is_nullable,
    CASE 
        WHEN a.attnum IS NULL AND c.column_name IS NULL THEN
            CASE WHEN LOWER(COALESCE(NULLIF(current_setting('app.preflight_mode', true), ''), 'pre')) = 'post'
                 THEN 'BLOCKER_MISSING_COLUMN'
                 ELSE 'MISSING_BUT_WILL_BE_CREATED_BY_MIGRATION'
            END
        WHEN COALESCE(format_type(a.atttypid, a.atttypmod), c.data_type) <> ec.expected_type THEN 'TYPE_MISMATCH'
        WHEN ec.require_default AND (
            COALESCE(pg_get_expr(ad.adbin, ad.adrelid), c.column_default) IS NULL
            OR (
                COALESCE(pg_get_expr(ad.adbin, ad.adrelid), c.column_default) <> '''admin''::text'
                AND COALESCE(pg_get_expr(ad.adbin, ad.adrelid), c.column_default) <> '''admin'''
                AND trim(both '''' from replace(replace(COALESCE(pg_get_expr(ad.adbin, ad.adrelid), c.column_default), '::text', ''), '''', '')) <> 'admin'
            )
        ) THEN 'DEFAULT_ADMIN_MISSING_OR_INVALID'
        ELSE 'COMPLIANT'
    END AS status
FROM expected_columns ec
LEFT JOIN (
    pg_class cls 
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace AND ns.nspname = 'public'
) ON cls.relname = ec.table_name
LEFT JOIN pg_attribute a ON a.attrelid = cls.oid AND a.attname = ec.column_name AND NOT a.attisdropped
LEFT JOIN pg_attrdef ad ON ad.adrelid = cls.oid AND ad.adnum = a.attnum
LEFT JOIN information_schema.columns c 
    ON c.table_schema = 'public' 
   AND c.table_name = ec.table_name 
   AND c.column_name = ec.column_name
ORDER BY ec.table_name;

-- ----------------------------------------------------------------------------
-- SECTION 7: Status CHECK Constraints Across Source Assignment Tables
-- Diagnostic Goal: Return a row for every required constraint and detect data that
-- would make the migration's replacement CHECK constraints fail.
-- ----------------------------------------------------------------------------
WITH expected AS (
    SELECT 'contact_assignments'::text AS table_name, 'contact_assignments_status_check'::text AS constraint_name
    UNION ALL SELECT 'feedback_contact_assignments', 'feedback_contact_assignments_status_check'
    UNION ALL SELECT 'krishnashtami_contact_assignments', 'krishnashtami_contact_assignments_status_check'
),
status_values AS (
    SELECT 'contact_assignments'::text AS table_name, COUNT(*) FILTER (
        WHERE status IS NOT NULL AND status NOT IN (
            'Pending', 'Assigned', 'Coming', 'Not Coming', 'Not Answered', 'Next Week',
            'Not Interested', 'Not in Hyderabad', 'Not Connected', 'Callback Required',
            'Contacted', 'Interested', 'Completed', 'Called', 'Confirmed', 'No Answer',
            'Wrong Number', 'Visited'
        )
    ) AS invalid_status_count FROM public.contact_assignments
    UNION ALL
    SELECT 'feedback_contact_assignments', COUNT(*) FILTER (
        WHERE status IS NOT NULL AND status NOT IN (
            'Pending', 'Assigned', 'Coming', 'Not Coming', 'Not Answered', 'Next Week',
            'Not Interested', 'Not in Hyderabad', 'Not Connected', 'Callback Required',
            'Contacted', 'Interested', 'Completed', 'Called', 'Confirmed', 'No Answer',
            'Wrong Number', 'Visited'
        )
    ) FROM public.feedback_contact_assignments
    UNION ALL
    SELECT 'krishnashtami_contact_assignments', COUNT(*) FILTER (
        WHERE status IS NOT NULL AND status NOT IN (
            'Pending', 'Assigned', 'Coming', 'Not Coming', 'Not Answered', 'Next Week',
            'Not Interested', 'Not in Hyderabad', 'Not Connected', 'Callback Required',
            'Contacted', 'Interested', 'Completed', 'Called', 'Confirmed', 'No Answer',
            'Wrong Number', 'Visited'
        )
    ) FROM public.krishnashtami_contact_assignments
)
SELECT
    'SECTION 7: status check constraints audit' AS check_name,
    e.table_name,
    e.constraint_name,
    pg_get_constraintdef(pc.oid) AS constraint_definition,
    COALESCE(sv.invalid_status_count, 0) AS invalid_status_count,
    CASE
        WHEN COALESCE(sv.invalid_status_count, 0) > 0 THEN 'BLOCKER_EXISTING_INVALID_STATUS_VALUES'
        WHEN pc.oid IS NULL THEN
            CASE WHEN LOWER(COALESCE(NULLIF(current_setting('app.preflight_mode', true), ''), 'pre')) = 'post'
                 THEN 'BLOCKER_STATUS_CHECK_MISSING'
                 ELSE 'NEEDS_UPDATE_BY_MIGRATION'
            END
        WHEN NOT pc.convalidated THEN
            CASE WHEN LOWER(COALESCE(NULLIF(current_setting('app.preflight_mode', true), ''), 'pre')) = 'post'
                 THEN 'BLOCKER_STATUS_CHECK_UNVALIDATED'
                 ELSE 'NEEDS_VALIDATION_BY_MIGRATION'
            END
        WHEN pg_get_constraintdef(pc.oid) LIKE '%Not in Hyderabad%'
         AND pg_get_constraintdef(pc.oid) LIKE '%Visited%' THEN 'COMPLIANT'
        ELSE
            CASE WHEN LOWER(COALESCE(NULLIF(current_setting('app.preflight_mode', true), ''), 'pre')) = 'post'
                 THEN 'BLOCKER_INCOMPATIBLE_STATUS_CHECK'
                 ELSE 'NEEDS_UPDATE_BY_MIGRATION'
            END
    END AS status
FROM expected e
LEFT JOIN pg_constraint pc
  ON pc.conname = e.constraint_name
 AND pc.conrelid = format('public.%I', e.table_name)::regclass
 AND pc.contype = 'c'
LEFT JOIN status_values sv ON sv.table_name = e.table_name
ORDER BY e.table_name;

-- SECTION 8: Historical Discovery Branch 1 & 5 (Rathayatra Registrations)
-- Diagnostic Goal: Count distinct phone identities in Rathayatra contact_assignments
-- with Not Interested status.
-- ----------------------------------------------------------------------------
SELECT 
    'SECTION 8: Discovery Branch 1 (Rathayatra)' AS check_name,
    COUNT(*) AS total_ni_assignments,
    COUNT(DISTINCT public.normalize_phone(r.phone)) AS distinct_normalized_phones,
    COUNT(*) FILTER (WHERE r.phone IS NULL OR public.normalize_phone(r.phone) IS NULL) AS invalid_or_null_phones
FROM public.registrations r
JOIN public.contact_assignments ca ON r.id = ca.registration_id
WHERE LOWER(TRIM(COALESCE(ca.status, ''))) IN ('not interested', 'not_interested');

-- ----------------------------------------------------------------------------
-- SECTION 9: Historical Discovery Branch 2 & 5 (Krishnashtami Registrations)
-- Diagnostic Goal: Count distinct phone identities in Krishnashtami assignments
-- with Not Interested status.
-- ----------------------------------------------------------------------------
SELECT 
    'SECTION 9: Discovery Branch 2 (Krishnashtami)' AS check_name,
    COUNT(*) AS total_ni_assignments,
    COUNT(DISTINCT public.normalize_phone(kr.phone)) AS distinct_normalized_phones,
    COUNT(*) FILTER (WHERE kr.phone IS NULL OR public.normalize_phone(kr.phone) IS NULL) AS invalid_or_null_phones
FROM public.krishnashtami_registrations kr
JOIN public.krishnashtami_contact_assignments kca ON kr.id = kca.registration_id
WHERE LOWER(TRIM(COALESCE(kca.status, ''))) IN ('not interested', 'not_interested');

-- ----------------------------------------------------------------------------
-- SECTION 10: Historical Discovery Branch 3 & 5 (Feedback Contacts)
-- Diagnostic Goal: Count distinct phone identities in Feedback assignments
-- with Not Interested status.
-- ----------------------------------------------------------------------------
SELECT 
    'SECTION 10: Discovery Branch 3 (Feedback)' AS check_name,
    COUNT(*) AS total_ni_assignments,
    COUNT(DISTINCT public.normalize_phone(fc.phone)) AS distinct_normalized_phones,
    COUNT(*) FILTER (WHERE fc.phone IS NULL OR public.normalize_phone(fc.phone) IS NULL) AS invalid_or_null_phones
FROM public.feedback_contacts fc
JOIN public.feedback_contact_assignments fca ON fc.id = fca.feedback_contact_id
WHERE LOWER(TRIM(COALESCE(fca.status, ''))) IN ('not interested', 'not_interested');

-- ----------------------------------------------------------------------------
-- SECTION 11: Historical Discovery Branch 4 (Master Contact Assignments)
-- Diagnostic Goal: Count distinct phone identities in master_contact_assignments
-- with Not Interested status.
-- ----------------------------------------------------------------------------
SELECT 
    'SECTION 11: Discovery Branch 4 (Master Assignments)' AS check_name,
    COUNT(*) AS total_ni_assignments,
    COUNT(DISTINCT public.normalize_phone(mc.phone)) AS distinct_normalized_phones,
    COUNT(*) FILTER (WHERE mc.phone IS NULL OR public.normalize_phone(mc.phone) IS NULL) AS invalid_or_null_phones
FROM public.master_contacts mc
JOIN public.master_contact_assignments mca ON mc.id = mca.master_contact_id
WHERE LOWER(TRIM(COALESCE(mca.status, ''))) IN ('not interested', 'not_interested');

-- ----------------------------------------------------------------------------
-- SECTION 12: Historical Discovery Branch 5 (master_contact_events links)
-- Diagnostic Goal: Count Master Contacts linked via events to Not Interested assignments.
-- ----------------------------------------------------------------------------
SELECT 
    'SECTION 12: Discovery Branch 5 (master_contact_events links)' AS check_name,
    mce.source,
    COUNT(DISTINCT mce.master_contact_id) AS distinct_linked_master_contacts,
    COUNT(DISTINCT public.normalize_phone(mc.phone)) AS distinct_normalized_phones
FROM public.master_contact_events mce
JOIN public.master_contacts mc ON mce.master_contact_id = mc.id
LEFT JOIN public.contact_assignments ca 
    ON mce.event_record_id = ca.registration_id::text 
   AND mce.source = 'rathayatra' 
   AND LOWER(TRIM(COALESCE(ca.status, ''))) IN ('not interested', 'not_interested')
LEFT JOIN public.krishnashtami_contact_assignments kca 
    ON mce.event_record_id = kca.registration_id::text 
   AND mce.source = 'krishnashtami' 
   AND LOWER(TRIM(COALESCE(kca.status, ''))) IN ('not interested', 'not_interested')
LEFT JOIN public.feedback_contact_assignments fca 
    ON mce.event_record_id = fca.feedback_contact_id::text 
   AND mce.source IN ('feedback_contacts', 'feedback') 
   AND LOWER(TRIM(COALESCE(fca.status, ''))) IN ('not interested', 'not_interested')
WHERE (ca.id IS NOT NULL OR kca.id IS NOT NULL OR fca.id IS NOT NULL)
GROUP BY mce.source;

-- ----------------------------------------------------------------------------
-- SECTION 13: Historical Discovery Branch 6 (audit_logs Not Interested markings)
-- Diagnostic Goal: Count audit_logs entries explicitly marking Not Interested.
-- ----------------------------------------------------------------------------
SELECT 
    'SECTION 13: Discovery Branch 6 (audit_logs)' AS check_name,
    COUNT(*) AS total_ni_audit_rows,
    COUNT(DISTINCT al.details->>'contact_id') AS distinct_contact_ids_in_audit
FROM public.audit_logs al
WHERE (al.details->>'new_status' ILIKE 'not interested' OR al.action = 'CONTACT_MARKED_NOT_INTERESTED')
  AND al.details->>'contact_id' IS NOT NULL;

-- ----------------------------------------------------------------------------
-- SECTION 14: Active Assignments Targeted for Deactivation & Operator Capacity
-- Diagnostic Goal: Audit all currently active assignments that will be deactivated
-- by Section 5 Step D, and evaluate current active load vs configured capacity.
-- ----------------------------------------------------------------------------
SELECT 
    'SECTION 14: Active assignments summary across all 4 tables' AS check_name,
    (SELECT COUNT(*) FROM public.master_contact_assignments WHERE is_active = true) AS active_master_assignments,
    (SELECT COUNT(*) FROM public.contact_assignments WHERE is_active = true) AS active_rathayatra_assignments,
    (SELECT COUNT(*) FROM public.krishnashtami_contact_assignments WHERE is_active = true) AS active_krishnashtami_assignments,
    (SELECT COUNT(*) FROM public.feedback_contact_assignments WHERE is_active = true) AS active_feedback_assignments;

WITH col_check AS (
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'contact_operators' 
          AND column_name = 'capacity'
    ) AS col_exists
),
op_parsed AS (
    SELECT 
        co.id,
        co.name,
        co.is_active,
        to_jsonb(co.*)->>'capacity' AS raw_cap,
        CASE 
            WHEN NOT cc.col_exists THEN NULL
            WHEN to_jsonb(co.*)->>'capacity' IS NULL THEN NULL
            WHEN (to_jsonb(co.*)->>'capacity') ~ '^-?[0-9]{1,3}$'
            THEN (to_jsonb(co.*)->>'capacity')::integer
            ELSE NULL
        END AS parsed_cap,
        CASE
            WHEN NOT cc.col_exists THEN false
            WHEN to_jsonb(co.*)->>'capacity' IS NOT NULL
             AND NOT ((to_jsonb(co.*)->>'capacity') ~ '^-?[0-9]+$') THEN true
            ELSE false
        END AS is_incompatible_format,
        CASE
            WHEN (to_jsonb(co.*)->>'capacity') ~ '^-?[0-9]+$'
             AND length(ltrim(to_jsonb(co.*)->>'capacity', '-')) > 3 THEN true
            WHEN (to_jsonb(co.*)->>'capacity') ~ '^-?[0-9]{1,3}$'
             THEN ((to_jsonb(co.*)->>'capacity')::integer < 1 OR (to_jsonb(co.*)->>'capacity')::integer > 500)
            ELSE false
        END AS is_out_of_range
    FROM col_check cc
    CROSS JOIN public.contact_operators co
),
master_agg AS (
    SELECT operator_id, COUNT(*) AS active_count
    FROM public.master_contact_assignments
    WHERE is_active = true
    GROUP BY operator_id
),
rathayatra_agg AS (
    SELECT operator_id, COUNT(*) AS active_count
    FROM public.contact_assignments
    WHERE is_active = true
    GROUP BY operator_id
),
krishnashtami_agg AS (
    SELECT operator_id, COUNT(*) AS active_count
    FROM public.krishnashtami_contact_assignments
    WHERE is_active = true
    GROUP BY operator_id
),
feedback_agg AS (
    SELECT operator_id, COUNT(*) AS active_count
    FROM public.feedback_contact_assignments
    WHERE is_active = true
    GROUP BY operator_id
)
SELECT 
    'SECTION 14: Operator capacity utilization vs capacity limits' AS check_name,
    op.id AS operator_id,
    op.name AS operator_name,
    op.is_active AS operator_active,
    op.parsed_cap AS configured_capacity,
    COALESCE(m.active_count, 0) AS active_master_count,
    COALESCE(r.active_count, 0) AS active_rathayatra_count,
    COALESCE(k.active_count, 0) AS active_krishnashtami_count,
    COALESCE(f.active_count, 0) AS active_feedback_count,
    (COALESCE(m.active_count, 0) + COALESCE(r.active_count, 0) + COALESCE(k.active_count, 0) + COALESCE(f.active_count, 0)) AS total_active_count,
    CASE 
        WHEN NOT cc.col_exists THEN 
            CASE WHEN LOWER(COALESCE(NULLIF(current_setting('app.preflight_mode', true), ''), 'pre')) = 'post'
                 THEN 'BLOCKER_COLUMN_MISSING'
                 ELSE 'MISSING_BUT_WILL_BE_CREATED_BY_MIGRATION'
            END
        WHEN op.is_incompatible_format THEN 'BLOCKER_INCOMPATIBLE_CAPACITY_FORMAT'
        WHEN op.raw_cap IS NULL THEN 'INVALID_NULL_CAPACITY'
        WHEN op.is_out_of_range THEN 'OUT_OF_RANGE_CAPACITY'
        WHEN (
            (COALESCE(m.active_count, 0) > op.parsed_cap)::int +
            (COALESCE(r.active_count, 0) > op.parsed_cap)::int +
            (COALESCE(k.active_count, 0) > op.parsed_cap)::int +
            (COALESCE(f.active_count, 0) > op.parsed_cap)::int
        ) > 1 THEN 
            concat_ws(', ',
                CASE WHEN COALESCE(m.active_count, 0) > op.parsed_cap THEN 'OVER_CAPACITY_MASTER' END,
                CASE WHEN COALESCE(r.active_count, 0) > op.parsed_cap THEN 'OVER_CAPACITY_RATHAYATRA' END,
                CASE WHEN COALESCE(k.active_count, 0) > op.parsed_cap THEN 'OVER_CAPACITY_KRISHNASHTAMI' END,
                CASE WHEN COALESCE(f.active_count, 0) > op.parsed_cap THEN 'OVER_CAPACITY_FEEDBACK' END
            )
        WHEN COALESCE(m.active_count, 0) > op.parsed_cap THEN 'OVER_CAPACITY_MASTER'
        WHEN COALESCE(r.active_count, 0) > op.parsed_cap THEN 'OVER_CAPACITY_RATHAYATRA'
        WHEN COALESCE(k.active_count, 0) > op.parsed_cap THEN 'OVER_CAPACITY_KRISHNASHTAMI'
        WHEN COALESCE(f.active_count, 0) > op.parsed_cap THEN 'OVER_CAPACITY_FEEDBACK'
        ELSE 'WITHIN_CAPACITY'
    END AS capacity_compliance,
    CASE 
        WHEN NOT cc.col_exists THEN false
        WHEN op.is_incompatible_format OR op.raw_cap IS NULL OR op.is_out_of_range THEN true
        WHEN COALESCE(m.active_count, 0) > op.parsed_cap 
          OR COALESCE(r.active_count, 0) > op.parsed_cap 
          OR COALESCE(k.active_count, 0) > op.parsed_cap 
          OR COALESCE(f.active_count, 0) > op.parsed_cap 
        THEN true 
        ELSE false 
    END AS any_source_exceeded
FROM col_check cc
CROSS JOIN op_parsed op
LEFT JOIN master_agg m ON m.operator_id = op.id
LEFT JOIN rathayatra_agg r ON r.operator_id = op.id
LEFT JOIN krishnashtami_agg k ON k.operator_id = op.id
LEFT JOIN feedback_agg f ON f.operator_id = op.id
ORDER BY op.name;

-- ----------------------------------------------------------------------------
-- SECTION 15: SECURITY DEFINER Privileges & Search Path Pre-check
-- Diagnostic Goal: Verify schema permissions on public schema (no CREATE for untrusted roles),
-- validate exact identity argument signatures for all three RPCs, detect obsolete overloads,
-- and audit search_path configuration.
-- ----------------------------------------------------------------------------
WITH target_roles AS (
    SELECT 'public'::text AS role_name, 'SCHEMA public'::text AS object_name, 'CREATE'::text AS privilege_type, false AS expected_has_privilege
    UNION ALL
    SELECT 'anon'::text, 'SCHEMA public'::text, 'CREATE'::text, false
    UNION ALL
    SELECT 'authenticated'::text, 'SCHEMA public'::text, 'CREATE'::text, false
),
schema_acl AS (
    SELECT 
        CASE WHEN acl.grantee = 0 THEN 'public' ELSE r.rolname END AS grantee_name,
        acl.privilege_type
    FROM pg_namespace ns
    CROSS JOIN LATERAL aclexplode(COALESCE(ns.nspacl, acldefault('n', ns.nspowner))) acl
    LEFT JOIN pg_roles r ON r.oid = acl.grantee
    WHERE ns.nspname = 'public'
)
SELECT 
    'SECTION 15: public schema CREATE privilege audit' AS check_name,
    tr.role_name,
    tr.object_name,
    tr.privilege_type,
    tr.expected_has_privilege AS expected_state,
    CASE 
        WHEN tr.role_name = 'public' THEN has_schema_privilege('public', 'public', 'CREATE')
        WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = tr.role_name) THEN has_schema_privilege(tr.role_name, 'public', 'CREATE')
        ELSE false
    END AS actual_has_privilege,
    EXISTS (
        SELECT 1 FROM schema_acl sa 
        WHERE sa.grantee_name = tr.role_name AND sa.privilege_type = 'CREATE'
    ) AS direct_acl_entry_present,
    CASE 
        WHEN tr.role_name <> 'public' AND NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = tr.role_name) THEN 'ROLE_NOT_FOUND_DEFAULT_DENIED'
        WHEN (
            CASE 
                WHEN tr.role_name = 'public' THEN has_schema_privilege('public', 'public', 'CREATE')
                ELSE has_schema_privilege(tr.role_name, 'public', 'CREATE')
            END
        ) = tr.expected_has_privilege THEN 'COMPLIANT'
        ELSE 'INSECURE_PRIVILEGE_DETECTED'
    END AS compliance_status
FROM target_roles tr
ORDER BY tr.role_name;

WITH expected_functions AS (
    SELECT 
        'assign_master_contact_atomic'::text AS function_name,
        'p_master_contact_id uuid, p_operator_id uuid, p_assigned_by uuid, p_max_capacity integer, p_allow_reassign boolean'::text AS expected_signature
    UNION ALL
    SELECT 
        'assign_contact_atomic'::text,
        'p_contact_id uuid, p_operator_id uuid, p_source text, p_assigned_by uuid, p_max_capacity integer, p_allow_reassign boolean'::text
    UNION ALL
    SELECT 
        'mark_contact_not_interested_atomic'::text,
        'p_master_contact_id uuid, p_phone text, p_operator_id uuid, p_reason text'::text
),
target_roles AS (
    SELECT 'public'::text AS role_name, false AS expected_execute
    UNION ALL
    SELECT 'anon'::text, false
    UNION ALL
    SELECT 'authenticated'::text, false
    UNION ALL
    SELECT 'service_role'::text, true
),
proc_matches AS (
    SELECT 
        ef.function_name,
        ef.expected_signature,
        p.oid,
        pg_get_function_identity_arguments(p.oid) AS actual_signature,
        p.prosecdef,
        p.proconfig
    FROM expected_functions ef
    LEFT JOIN pg_proc p 
        ON p.proname = ef.function_name 
       AND p.pronamespace = 'public'::regnamespace
       AND pg_get_function_identity_arguments(p.oid) = ef.expected_signature
)
SELECT 
    'SECTION 15: SECURITY DEFINER RPC privileges & search_path' AS check_name,
    pm.function_name,
    pm.expected_signature,
    COALESCE(pm.actual_signature, 'NONE') AS identity_arguments,
    tr.role_name,
    CASE 
        WHEN pm.oid IS NULL THEN 
            CASE WHEN LOWER(COALESCE(NULLIF(current_setting('app.preflight_mode', true), ''), 'pre')) = 'post'
                 THEN 'BLOCKER_MISSING_FUNCTION'
                 ELSE 'MISSING_BUT_WILL_BE_CREATED_BY_MIGRATION'
            END
        ELSE 'FUNCTION_PRESENT' 
    END AS function_presence,
    pm.prosecdef AS is_security_definer,
    pm.proconfig AS configuration_settings,
    CASE 
        WHEN pm.oid IS NULL THEN 
            CASE WHEN LOWER(COALESCE(NULLIF(current_setting('app.preflight_mode', true), ''), 'pre')) = 'post'
                 THEN 'BLOCKER_MISSING_FUNCTION'
                 ELSE 'MISSING_BUT_WILL_BE_CREATED_BY_MIGRATION'
            END
        WHEN pm.prosecdef = false THEN 'NOT_SECURITY_DEFINER'
        WHEN pm.proconfig IS NULL OR NOT (pm.proconfig @> ARRAY['search_path=pg_catalog, public, pg_temp']) THEN 'SEARCH_PATH_INSECURE'
        ELSE 'SECURE'
    END AS definition_status,
    tr.expected_execute,
    CASE 
        WHEN pm.oid IS NULL THEN false
        WHEN tr.role_name = 'public' THEN has_function_privilege('public', pm.oid, 'EXECUTE')
        WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = tr.role_name) THEN has_function_privilege(tr.role_name, pm.oid, 'EXECUTE')
        ELSE false
    END AS actual_execute,
    CASE 
        WHEN pm.oid IS NULL THEN 
            CASE WHEN LOWER(COALESCE(NULLIF(current_setting('app.preflight_mode', true), ''), 'pre')) = 'post'
                 THEN 'BLOCKER_MISSING_FUNCTION'
                 ELSE 'MISSING_BUT_WILL_BE_CREATED_BY_MIGRATION'
            END
        WHEN tr.role_name <> 'public' AND NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = tr.role_name) THEN 
            CASE WHEN tr.expected_execute = true THEN 'MISSING_REQUIRED_ROLE' ELSE 'COMPLIANT_ROLE_ABSENT' END
        WHEN (
            CASE 
                WHEN tr.role_name = 'public' THEN has_function_privilege('public', pm.oid, 'EXECUTE')
                ELSE has_function_privilege(tr.role_name, pm.oid, 'EXECUTE')
            END
        ) = tr.expected_execute THEN 'COMPLIANT'
        ELSE 'NON_COMPLIANT_PRIVILEGE'
    END AS privilege_compliance
FROM proc_matches pm
CROSS JOIN target_roles tr
ORDER BY pm.function_name, tr.role_name;

-- Detect obsolete or unexpected overloads for the three dynamic capacity RPCs
WITH expected_functions AS (
    SELECT 
        'assign_master_contact_atomic'::text AS function_name,
        'p_master_contact_id uuid, p_operator_id uuid, p_assigned_by uuid, p_max_capacity integer, p_allow_reassign boolean'::text AS expected_signature
    UNION ALL
    SELECT 
        'assign_contact_atomic'::text,
        'p_contact_id uuid, p_operator_id uuid, p_source text, p_assigned_by uuid, p_max_capacity integer, p_allow_reassign boolean'::text
    UNION ALL
    SELECT 
        'mark_contact_not_interested_atomic'::text,
        'p_master_contact_id uuid, p_phone text, p_operator_id uuid, p_reason text'::text
),
obsolete_candidates AS (
    SELECT
        p.oid,
        p.proname AS function_name,
        pg_get_function_identity_arguments(p.oid) AS actual_signature,
        (
            (p.proname = 'assign_master_contact_atomic'
             AND p.pronargs = 4
             AND p.proargtypes[0] = 'uuid'::regtype
             AND p.proargtypes[1] = 'uuid'::regtype
             AND p.proargtypes[2] = 'uuid'::regtype
             AND p.proargtypes[3] = 'integer'::regtype)
            OR
            (p.proname = 'assign_contact_atomic'
             AND p.pronargs = 5
             AND p.proargtypes[0] = 'uuid'::regtype
             AND p.proargtypes[1] = 'uuid'::regtype
             AND p.proargtypes[2] = 'text'::regtype
             AND p.proargtypes[3] = 'uuid'::regtype
             AND p.proargtypes[4] = 'integer'::regtype)
        ) AS is_known_dropped
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('assign_master_contact_atomic', 'assign_contact_atomic', 'mark_contact_not_interested_atomic')
      AND NOT EXISTS (
          SELECT 1 FROM expected_functions ef 
          WHERE ef.function_name = p.proname 
            AND ef.expected_signature = pg_get_function_identity_arguments(p.oid)
      )
)
SELECT 
    'SECTION 15: Obsolete or unexpected RPC overloads audit' AS check_name,
    COALESCE(oc.function_name, 'NONE') AS function_name,
    COALESCE(oc.actual_signature, 'NONE') AS obsolete_signature,
    CASE 
        WHEN oc.function_name IS NULL THEN 'COMPLIANT_NO_OBSOLETE_OVERLOADS'
        WHEN LOWER(COALESCE(NULLIF(current_setting('app.preflight_mode', true), ''), 'pre')) = 'post'
            THEN 'BLOCKER_OBSOLETE_OVERLOAD_DETECTED'
        WHEN oc.is_known_dropped THEN 'OBSOLETE_OVERLOAD_WILL_BE_DROPPED_BY_MIGRATION'
        ELSE 'BLOCKER_UNEXPECTED_OVERLOAD_DETECTED'
    END AS status
FROM (SELECT 1) dummy
LEFT JOIN obsolete_candidates oc ON true;
