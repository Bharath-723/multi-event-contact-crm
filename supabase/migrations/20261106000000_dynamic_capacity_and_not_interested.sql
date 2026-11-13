-- ============================================================================
-- Migration: 20261106000000_dynamic_capacity_and_not_interested.sql
-- Description: Dynamic operator capacity, comprehensive Not Interested persistent
--              exclusion workflow, source schema corrections, sanitized logging,
--              and 'Not in Hyderabad' status support across all assignment tables.
--
-- STRICT RESTRICTION: LOCAL DEVELOPMENT ARTIFACT.
-- DO NOT EXECUTE ON PRODUCTION DATABASE WITHOUT EXPLICIT SEPARATE AUTHORIZATION.
-- ============================================================================

BEGIN;

-- 1. Ensure capacity column and constraint on contact_operators (safe, idempotent)
DO $$
DECLARE
    v_con_oid        oid;
    v_con_validated  boolean;
    v_con_def        text;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'contact_operators' 
          AND column_name = 'capacity'
    ) THEN
        ALTER TABLE public.contact_operators 
        ADD COLUMN capacity integer NOT NULL DEFAULT 40;
    ELSE
        -- Defensive repair: enforce NOT NULL and default on pre-existing column
        UPDATE public.contact_operators SET capacity = 40 WHERE capacity IS NULL;
        ALTER TABLE public.contact_operators ALTER COLUMN capacity SET DEFAULT 40;
        ALTER TABLE public.contact_operators ALTER COLUMN capacity SET NOT NULL;
        -- Verify pre-existing column is integer type
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'contact_operators'
              AND column_name = 'capacity'
              AND data_type = 'integer'
        ) THEN
            RAISE EXCEPTION 'MIGRATION_BLOCKED: contact_operators.capacity exists but is not integer type. Manual schema remediation required.';
        END IF;
    END IF;

    -- Fail fast: reject migration if any existing capacity value is out of range 1-500
    IF EXISTS (
        SELECT 1 FROM public.contact_operators
        WHERE capacity IS NOT NULL AND (capacity < 1 OR capacity > 500)
    ) THEN
        RAISE EXCEPTION 'MIGRATION_BLOCKED: contact_operators rows with capacity outside 1-500 found. Remediate with: SELECT id, name, capacity FROM public.contact_operators WHERE capacity < 1 OR capacity > 500';
    END IF;

    -- Look up constraint specifically on public.contact_operators
    SELECT pc.oid, pc.convalidated, pg_get_constraintdef(pc.oid)
    INTO v_con_oid, v_con_validated, v_con_def
    FROM pg_constraint pc
    JOIN pg_class cls ON cls.oid = pc.conrelid
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    WHERE pc.conname = 'chk_operator_capacity'
      AND ns.nspname = 'public'
      AND cls.relname = 'contact_operators'
      AND pc.contype = 'c';

    IF v_con_oid IS NULL THEN
        ALTER TABLE public.contact_operators 
        ADD CONSTRAINT chk_operator_capacity CHECK (capacity >= 1 AND capacity <= 500);
    ELSE
        -- Verify exact constraint expression without accepting arbitrary matching fragments
        IF regexp_replace(v_con_def, '[\s\(\)]', '', 'g') <> 'CHECKcapacity>=1ANDcapacity<=500' THEN
            RAISE EXCEPTION 'MIGRATION_BLOCKED: Constraint chk_operator_capacity on public.contact_operators has an unexpected definition (%). Expected CHECK (capacity >= 1 AND capacity <= 500). Manual remediation required.', v_con_def;
        END IF;

        -- Ensure constraint is validated; do not silently leave unvalidated constraint
        IF NOT v_con_validated THEN
            ALTER TABLE public.contact_operators VALIDATE CONSTRAINT chk_operator_capacity;
        END IF;
    END IF;
END $$;

-- 2. Ensure is_not_interested persistent columns and foreign key on master_contacts (safe, idempotent)
DO $$
DECLARE
    v_mc_attnum     int2;
    v_op_id_attnum  int2;
    v_fk_found      boolean := false;
    r               record;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'master_contacts' 
          AND column_name = 'is_not_interested'
    ) THEN
        ALTER TABLE public.master_contacts 
        ADD COLUMN is_not_interested boolean NOT NULL DEFAULT false;
    ELSE
        -- Verify type compatibility
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'master_contacts'
              AND column_name = 'is_not_interested' AND data_type = 'boolean'
        ) THEN
            RAISE EXCEPTION 'MIGRATION_BLOCKED: master_contacts.is_not_interested exists but is not boolean type. Manual remediation required.';
        END IF;
        -- Repair any pre-existing NULLs before enforcing NOT NULL
        UPDATE public.master_contacts SET is_not_interested = false WHERE is_not_interested IS NULL;
        ALTER TABLE public.master_contacts ALTER COLUMN is_not_interested SET DEFAULT false;
        ALTER TABLE public.master_contacts ALTER COLUMN is_not_interested SET NOT NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'master_contacts' 
          AND column_name = 'not_interested_at'
    ) THEN
        ALTER TABLE public.master_contacts 
        ADD COLUMN not_interested_at timestamptz;
    ELSE
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'master_contacts'
              AND column_name = 'not_interested_at' AND data_type = 'timestamp with time zone'
        ) THEN
            RAISE EXCEPTION 'MIGRATION_BLOCKED: master_contacts.not_interested_at exists but is not timestamptz type. Manual remediation required.';
        END IF;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'master_contacts' 
          AND column_name = 'not_interested_by'
    ) THEN
        ALTER TABLE public.master_contacts 
        ADD COLUMN not_interested_by uuid;
    ELSE
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'master_contacts'
              AND column_name = 'not_interested_by' AND data_type = 'uuid'
        ) THEN
            RAISE EXCEPTION 'MIGRATION_BLOCKED: master_contacts.not_interested_by exists but is not uuid type. Manual remediation required.';
        END IF;
    END IF;

    -- Referencing column must remain nullable to support ON DELETE SET NULL
    IF EXISTS (
        SELECT 1 FROM pg_attribute a
        JOIN pg_class cls ON cls.oid = a.attrelid
        JOIN pg_namespace ns ON ns.oid = cls.relnamespace
        WHERE ns.nspname = 'public'
          AND cls.relname = 'master_contacts'
          AND a.attname = 'not_interested_by'
          AND a.attnotnull = true
    ) THEN
        RAISE EXCEPTION 'MIGRATION_BLOCKED: public.master_contacts.not_interested_by must be nullable to support ON DELETE SET NULL.';
    END IF;

    -- Detect orphaned operator IDs before creating or validating foreign key
    IF EXISTS (
        SELECT 1 FROM public.master_contacts mc
        WHERE mc.not_interested_by IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM public.contact_operators co
              WHERE co.id = mc.not_interested_by
          )
    ) THEN
        RAISE EXCEPTION 'MIGRATION_BLOCKED: public.master_contacts contains orphaned not_interested_by IDs not found in contact_operators. Manual remediation required: SELECT id, not_interested_by FROM public.master_contacts WHERE not_interested_by IS NOT NULL AND not_interested_by NOT IN (SELECT id FROM public.contact_operators);';
    END IF;

    -- Fetch attribute numbers for exact catalog validation of conkey and confkey
    SELECT a.attnum INTO v_mc_attnum
    FROM pg_attribute a
    JOIN pg_class cls ON cls.oid = a.attrelid
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    WHERE ns.nspname = 'public'
      AND cls.relname = 'master_contacts'
      AND a.attname = 'not_interested_by';

    IF v_mc_attnum IS NULL THEN
        RAISE EXCEPTION 'MIGRATION_BLOCKED: Column not_interested_by not found on public.master_contacts.';
    END IF;

    SELECT a.attnum INTO v_op_id_attnum
    FROM pg_attribute a
    JOIN pg_class cls ON cls.oid = a.attrelid
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    WHERE ns.nspname = 'public'
      AND cls.relname = 'contact_operators'
      AND a.attname = 'id';

    IF v_op_id_attnum IS NULL THEN
        RAISE EXCEPTION 'MIGRATION_BLOCKED: Column id not found on public.contact_operators.';
    END IF;

    -- Verify or install foreign key constraint referencing contact_operators(id) ON DELETE SET NULL
    v_fk_found := false;
    FOR r IN (
        SELECT pc.oid, pc.conname, pc.confdeltype, pc.convalidated, pc.conkey, pc.confkey,
               refcls.relname AS ref_table, refns.nspname AS ref_schema
        FROM pg_constraint pc
        JOIN pg_class cls ON cls.oid = pc.conrelid
        JOIN pg_namespace ns ON ns.oid = cls.relnamespace
        JOIN pg_class refcls ON refcls.oid = pc.confrelid
        JOIN pg_namespace refns ON refns.oid = refcls.relnamespace
        WHERE ns.nspname = 'public'
          AND cls.relname = 'master_contacts'
          AND pc.contype = 'f'
          AND v_mc_attnum = ANY(pc.conkey)
    ) LOOP
        -- Reject composite foreign key
        IF r.conkey <> ARRAY[v_mc_attnum]::int2[] THEN
            RAISE EXCEPTION 'MIGRATION_BLOCKED: Foreign key constraint % on public.master_contacts is composite or does not strictly target only not_interested_by (conkey: %). Manual remediation required.', r.conname, r.conkey;
        END IF;

        -- Reject wrong referenced table or schema
        IF r.ref_schema <> 'public' OR r.ref_table <> 'contact_operators' THEN
            RAISE EXCEPTION 'MIGRATION_BLOCKED: Foreign key constraint % on public.master_contacts(not_interested_by) references %.% instead of public.contact_operators. Manual remediation required.', r.conname, r.ref_schema, r.ref_table;
        END IF;

        -- Reject wrong referenced column
        IF r.confkey <> ARRAY[v_op_id_attnum]::int2[] THEN
            RAISE EXCEPTION 'MIGRATION_BLOCKED: Foreign key constraint % on public.master_contacts(not_interested_by) targets confkey % instead of contact_operators(id). Manual remediation required.', r.conname, r.confkey;
        END IF;

        -- Reject wrong delete action
        IF r.confdeltype <> 'n' THEN
            RAISE EXCEPTION 'MIGRATION_BLOCKED: Foreign key constraint % on master_contacts.not_interested_by exists but does not specify ON DELETE SET NULL (action code: %). Manual remediation required.', r.conname, r.confdeltype;
        END IF;

        -- Validate if unvalidated
        IF NOT r.convalidated THEN
            EXECUTE format('ALTER TABLE public.master_contacts VALIDATE CONSTRAINT %I', r.conname);
        END IF;

        v_fk_found := true;
    END LOOP;

    IF NOT v_fk_found THEN
        -- Prevent collision if constraint name already exists with unrelated definition
        IF EXISTS (
            SELECT 1 FROM pg_constraint pc
            JOIN pg_class cls ON cls.oid = pc.conrelid
            JOIN pg_namespace ns ON ns.oid = cls.relnamespace
            WHERE ns.nspname = 'public'
              AND cls.relname = 'master_contacts'
              AND pc.conname = 'master_contacts_not_interested_by_fkey'
        ) THEN
            RAISE EXCEPTION 'MIGRATION_BLOCKED: Constraint master_contacts_not_interested_by_fkey already exists on master_contacts with an unexpected definition. Manual remediation required.';
        END IF;

        ALTER TABLE public.master_contacts
        ADD CONSTRAINT master_contacts_not_interested_by_fkey
        FOREIGN KEY (not_interested_by) REFERENCES public.contact_operators(id) ON DELETE SET NULL;
    END IF;

    -- Final verification of foreign key constraint
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint pc
        JOIN pg_class cls ON cls.oid = pc.conrelid
        JOIN pg_namespace ns ON ns.oid = cls.relnamespace
        JOIN pg_class refcls ON refcls.oid = pc.confrelid
        JOIN pg_namespace refns ON refns.oid = refcls.relnamespace
        WHERE ns.nspname = 'public'
          AND cls.relname = 'master_contacts'
          AND refns.nspname = 'public'
          AND refcls.relname = 'contact_operators'
          AND pc.contype = 'f'
          AND pc.conkey = ARRAY[v_mc_attnum]::int2[]
          AND pc.confkey = ARRAY[v_op_id_attnum]::int2[]
          AND pc.confdeltype = 'n'
          AND pc.convalidated = true
    ) THEN
        RAISE EXCEPTION 'MIGRATION_BLOCKED: Foreign key constraint on master_contacts.not_interested_by failed final validation.';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_master_contacts_not_interested 
ON public.master_contacts(is_not_interested) 
WHERE is_not_interested = true;

-- Validate that idx_master_contacts_not_interested has the exact catalog definition
DO $$
DECLARE
    v_mc_attnum     int2;
    v_idx_found     boolean := false;
    v_indisvalid    boolean;
    v_indisready    boolean;
    v_indnatts      int2;
    v_indnkeyatts   int2;
    v_indkey_0      int2;
    v_has_exprs     boolean;
    v_tbl_schema    name;
    v_tbl_name      name;
    v_pred_expr     text;
BEGIN
    -- Get attnum of is_not_interested on public.master_contacts
    SELECT a.attnum INTO v_mc_attnum
    FROM pg_attribute a
    JOIN pg_class cls ON cls.oid = a.attrelid
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    WHERE ns.nspname = 'public'
      AND cls.relname = 'master_contacts'
      AND a.attname = 'is_not_interested';

    IF v_mc_attnum IS NULL THEN
        RAISE EXCEPTION 'MIGRATION_BLOCKED: Column is_not_interested not found on public.master_contacts.';
    END IF;

    -- Query the catalog for idx_master_contacts_not_interested
    SELECT
        true,
        i.indisvalid,
        i.indisready,
        i.indnatts,
        i.indnkeyatts,
        i.indkey[0],
        (i.indexprs IS NOT NULL),
        ns_tbl.nspname,
        c_tbl.relname,
        pg_get_expr(i.indpred, i.indrelid)
    INTO
        v_idx_found,
        v_indisvalid,
        v_indisready,
        v_indnatts,
        v_indnkeyatts,
        v_indkey_0,
        v_has_exprs,
        v_tbl_schema,
        v_tbl_name,
        v_pred_expr
    FROM pg_class c_idx
    JOIN pg_namespace ns_idx ON ns_idx.oid = c_idx.relnamespace
    JOIN pg_index i ON i.indexrelid = c_idx.oid
    JOIN pg_class c_tbl ON c_tbl.oid = i.indrelid
    JOIN pg_namespace ns_tbl ON ns_tbl.oid = c_tbl.relnamespace
    WHERE c_idx.relname = 'idx_master_contacts_not_interested'
      AND ns_idx.nspname = 'public';

    IF NOT v_idx_found THEN
        RAISE EXCEPTION 'MIGRATION_BLOCKED: Index idx_master_contacts_not_interested does not exist in public schema.';
    END IF;

    IF v_tbl_schema <> 'public' OR v_tbl_name <> 'master_contacts' THEN
        RAISE EXCEPTION 'MIGRATION_BLOCKED: Index idx_master_contacts_not_interested belongs to %.% instead of public.master_contacts.', v_tbl_schema, v_tbl_name;
    END IF;

    IF NOT v_indisvalid OR NOT v_indisready THEN
        RAISE EXCEPTION 'MIGRATION_BLOCKED: Index idx_master_contacts_not_interested is invalid or not ready (valid: %, ready: %). Reindex required.', v_indisvalid, v_indisready;
    END IF;

    IF v_indnatts <> 1 OR v_indnkeyatts <> 1 OR v_has_exprs THEN
        RAISE EXCEPTION 'MIGRATION_BLOCKED: Index idx_master_contacts_not_interested has unexpected columns or expressions (indnatts: %, indnkeyatts: %, has_exprs: %).', v_indnatts, v_indnkeyatts, v_has_exprs;
    END IF;

    IF v_indkey_0 <> v_mc_attnum THEN
        RAISE EXCEPTION 'MIGRATION_BLOCKED: Index idx_master_contacts_not_interested indexes attnum % instead of is_not_interested (attnum %).', v_indkey_0, v_mc_attnum;
    END IF;

    IF v_pred_expr IS NULL OR (v_pred_expr <> '(is_not_interested = true)' AND v_pred_expr <> 'is_not_interested') THEN
        RAISE EXCEPTION 'MIGRATION_BLOCKED: Index idx_master_contacts_not_interested predicate % does not match expected predicate (is_not_interested = true).', COALESCE(v_pred_expr, 'NULL');
    END IF;
END $$;

-- 3. Ensure assigned_by exists in every source assignment table
DO $$
BEGIN
    -- contact_assignments (UUID)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'contact_assignments' 
          AND column_name = 'assigned_by'
    ) THEN
        ALTER TABLE public.contact_assignments ADD COLUMN assigned_by UUID;
    ELSE
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'contact_assignments'
              AND column_name = 'assigned_by' AND data_type = 'uuid'
        ) THEN
            RAISE EXCEPTION 'MIGRATION_BLOCKED: contact_assignments.assigned_by exists but is not uuid type. Manual remediation required.';
        END IF;
    END IF;

    -- feedback_contact_assignments (UUID)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'feedback_contact_assignments' 
          AND column_name = 'assigned_by'
    ) THEN
        ALTER TABLE public.feedback_contact_assignments ADD COLUMN assigned_by UUID;
    ELSE
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'feedback_contact_assignments'
              AND column_name = 'assigned_by' AND data_type = 'uuid'
        ) THEN
            RAISE EXCEPTION 'MIGRATION_BLOCKED: feedback_contact_assignments.assigned_by exists but is not uuid type. Manual remediation required.';
        END IF;
    END IF;

    -- krishnashtami_contact_assignments (TEXT)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'krishnashtami_contact_assignments' 
          AND column_name = 'assigned_by'
    ) THEN
        ALTER TABLE public.krishnashtami_contact_assignments ADD COLUMN assigned_by TEXT DEFAULT 'admin';
    ELSE
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'krishnashtami_contact_assignments'
              AND column_name = 'assigned_by' AND data_type = 'text'
        ) THEN
            RAISE EXCEPTION 'MIGRATION_BLOCKED: krishnashtami_contact_assignments.assigned_by exists but is not text type. Manual remediation required.';
        END IF;
        -- Ensure default is 'admin' on pre-existing column without overwriting existing data
        ALTER TABLE public.krishnashtami_contact_assignments ALTER COLUMN assigned_by SET DEFAULT 'admin';
    END IF;
END $$;

-- 4. Update status CHECK constraints to include 'Not in Hyderabad', 'Visited', and all historical statuses across all source tables
ALTER TABLE public.feedback_contact_assignments 
DROP CONSTRAINT IF EXISTS feedback_contact_assignments_status_check;

ALTER TABLE public.feedback_contact_assignments 
ADD CONSTRAINT feedback_contact_assignments_status_check
CHECK (status IN (
    'Pending', 'Assigned', 'Coming', 'Not Coming', 'Not Answered', 'Next Week', 
    'Not Interested', 'Not in Hyderabad', 'Not Connected', 'Callback Required', 
    'Contacted', 'Interested', 'Completed', 'Called', 'Confirmed', 'No Answer', 
    'Wrong Number', 'Visited'
));

ALTER TABLE public.contact_assignments 
DROP CONSTRAINT IF EXISTS contact_assignments_status_check;

ALTER TABLE public.contact_assignments 
ADD CONSTRAINT contact_assignments_status_check
CHECK (status IN (
    'Pending', 'Assigned', 'Coming', 'Not Coming', 'Not Answered', 'Next Week', 
    'Not Interested', 'Not in Hyderabad', 'Not Connected', 'Callback Required', 
    'Contacted', 'Interested', 'Completed', 'Called', 'Confirmed', 'No Answer', 
    'Wrong Number', 'Visited'
));

ALTER TABLE public.krishnashtami_contact_assignments 
DROP CONSTRAINT IF EXISTS krishnashtami_contact_assignments_status_check;

ALTER TABLE public.krishnashtami_contact_assignments 
ADD CONSTRAINT krishnashtami_contact_assignments_status_check
CHECK (status IN (
    'Pending', 'Assigned', 'Coming', 'Not Coming', 'Not Answered', 'Next Week', 
    'Not Interested', 'Not in Hyderabad', 'Not Connected', 'Callback Required', 
    'Contacted', 'Interested', 'Completed', 'Called', 'Confirmed', 'No Answer', 
    'Wrong Number', 'Visited'
));

-- 5. Comprehensive Canonical Not Interested Backfill & Missing Blocked Master Contact Creation
-- Discovers all historical Not Interested identities across all platforms,
-- creates missing persistent blocked Master Contacts, and deactivates active assignments.
-- Explicitly excludes free-form substring searches on comments/remarks to avoid false positives.
DO $$
BEGIN
    -- Validate required unique index on master_contacts.phone exists before ON CONFLICT (phone) in Step C
    IF NOT EXISTS (
        SELECT 1 FROM pg_index ix
        JOIN pg_class c ON c.oid = ix.indrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ix.indkey[0]
        WHERE n.nspname = 'public'
          AND c.relname = 'master_contacts'
          AND a.attname = 'phone'
          AND ix.indisunique = true
          AND ix.indisvalid = true
          AND ix.indisready = true
          AND ix.indimmediate = true
          AND ix.indpred IS NULL
          AND ix.indexprs IS NULL
          AND ix.indnkeyatts = 1
    ) THEN
        RAISE EXCEPTION 'MIGRATION_BLOCKED: public.master_contacts requires a valid, immediate, non-partial, single-key unique index on "phone" for ON CONFLICT (phone) inference in Step C. No suitable index was found. Check: SELECT indexname, indexdef FROM pg_indexes WHERE tablename = ''master_contacts'';';
    END IF;

    -- Temporary table to hold all discovered historical Not Interested identities
    CREATE TEMP TABLE IF NOT EXISTS _tmp_historical_ni_phones (
        phone TEXT PRIMARY KEY,
        name TEXT,
        gender TEXT,
        status_time TIMESTAMPTZ
    ) ON COMMIT DROP;

    TRUNCATE _tmp_historical_ni_phones;

    INSERT INTO _tmp_historical_ni_phones (phone, name, gender, status_time)
    SELECT 
        phone,
        COALESCE(NULLIF(TRIM((ARRAY_AGG(name ORDER BY status_time DESC NULLS LAST))[1]), ''), 'Contact') AS name,
        (ARRAY_AGG(gender ORDER BY status_time DESC NULLS LAST))[1] AS gender,
        MAX(status_time) AS status_time
    FROM (
        -- 1. registrations joined with contact_assignments
        SELECT 
            public.normalize_phone(r.phone) AS phone,
            r.full_name AS name,
            r.gender AS gender,
            ca.updated_at AS status_time
        FROM public.registrations r
        JOIN public.contact_assignments ca ON r.id = ca.registration_id
        WHERE LOWER(TRIM(COALESCE(ca.status, ''))) IN ('not interested', 'not_interested')
          AND r.phone IS NOT NULL

        UNION ALL

        -- 2. krishnashtami_registrations joined with krishnashtami_contact_assignments
        SELECT 
            public.normalize_phone(kr.phone) AS phone,
            kr.full_name AS name,
            kr.gender AS gender,
            kca.updated_at AS status_time
        FROM public.krishnashtami_registrations kr
        JOIN public.krishnashtami_contact_assignments kca ON kr.id = kca.registration_id
        WHERE LOWER(TRIM(COALESCE(kca.status, ''))) IN ('not interested', 'not_interested')
          AND kr.phone IS NOT NULL

        UNION ALL

        -- 3. feedback_contacts joined with feedback_contact_assignments
        SELECT 
            public.normalize_phone(fc.phone) AS phone,
            fc.full_name AS name,
            fc.gender AS gender,
            fca.updated_at AS status_time
        FROM public.feedback_contacts fc
        JOIN public.feedback_contact_assignments fca ON fc.id = fca.feedback_contact_id
        WHERE LOWER(TRIM(COALESCE(fca.status, ''))) IN ('not interested', 'not_interested')
          AND fc.phone IS NOT NULL

        UNION ALL

        -- 4. master_contact_assignments and associated master_contacts
        SELECT 
            public.normalize_phone(mc.phone) AS phone,
            mc.name AS name,
            mc.gender AS gender,
            mca.updated_at AS status_time
        FROM public.master_contacts mc
        JOIN public.master_contact_assignments mca ON mc.id = mca.master_contact_id
        WHERE LOWER(TRIM(COALESCE(mca.status, ''))) IN ('not interested', 'not_interested')
          AND mc.phone IS NOT NULL

        UNION ALL

        -- 5. Master Contacts linked through master_contact_events when source is Not Interested
        SELECT 
            public.normalize_phone(mc.phone) AS phone,
            mc.name AS name,
            mc.gender AS gender,
            ca.updated_at AS status_time
        FROM public.master_contact_events mce
        JOIN public.master_contacts mc ON mce.master_contact_id = mc.id
        JOIN public.contact_assignments ca ON mce.event_record_id = ca.registration_id::text AND mce.source = 'rathayatra'
        WHERE LOWER(TRIM(COALESCE(ca.status, ''))) IN ('not interested', 'not_interested')
          AND mc.phone IS NOT NULL

        UNION ALL

        SELECT 
            public.normalize_phone(mc.phone) AS phone,
            mc.name AS name,
            mc.gender AS gender,
            kca.updated_at AS status_time
        FROM public.master_contact_events mce
        JOIN public.master_contacts mc ON mce.master_contact_id = mc.id
        JOIN public.krishnashtami_contact_assignments kca ON mce.event_record_id = kca.registration_id::text AND mce.source = 'krishnashtami'
        WHERE LOWER(TRIM(COALESCE(kca.status, ''))) IN ('not interested', 'not_interested')
          AND mc.phone IS NOT NULL

        UNION ALL

        SELECT 
            public.normalize_phone(mc.phone) AS phone,
            mc.name AS name,
            mc.gender AS gender,
            fca.updated_at AS status_time
        FROM public.master_contact_events mce
        JOIN public.master_contacts mc ON mce.master_contact_id = mc.id
        JOIN public.feedback_contact_assignments fca ON mce.event_record_id = fca.feedback_contact_id::text AND mce.source IN ('feedback_contacts', 'feedback')
        WHERE LOWER(TRIM(COALESCE(fca.status, ''))) IN ('not interested', 'not_interested')
          AND mc.phone IS NOT NULL

        UNION ALL

        -- 6. audit_logs explicit Not Interested markings
        SELECT 
            public.normalize_phone(mc.phone) AS phone,
            mc.name AS name,
            mc.gender AS gender,
            al.created_at AS status_time
        FROM public.master_contacts mc
        JOIN public.audit_logs al ON mc.id::text = al.details->>'contact_id'
        WHERE (al.details->>'new_status' ILIKE 'not interested' OR al.action = 'CONTACT_MARKED_NOT_INTERESTED')
          AND al.details->>'contact_id' IS NOT NULL
          AND mc.phone IS NOT NULL

        UNION ALL

        SELECT 
            public.normalize_phone(mc.phone) AS phone,
            mc.name AS name,
            mc.gender AS gender,
            al.created_at AS status_time
        FROM public.master_contact_events mce
        JOIN public.master_contacts mc ON mce.master_contact_id = mc.id
        JOIN public.audit_logs al ON mce.event_record_id = al.details->>'contact_id'
        WHERE (al.details->>'new_status' ILIKE 'not interested' OR al.action = 'CONTACT_MARKED_NOT_INTERESTED')
          AND al.details->>'contact_id' IS NOT NULL
          AND mc.phone IS NOT NULL
    ) discovered
    WHERE phone IS NOT NULL AND length(phone) = 10 AND phone <> '0000000000'
    GROUP BY phone
    ON CONFLICT (phone) DO UPDATE
    SET name = COALESCE(EXCLUDED.name, _tmp_historical_ni_phones.name),
        gender = COALESCE(EXCLUDED.gender, _tmp_historical_ni_phones.gender),
        status_time = GREATEST(_tmp_historical_ni_phones.status_time, EXCLUDED.status_time);

    -- Step A: Mark all existing Master Contacts matching ANY discovered normalized phone
    UPDATE public.master_contacts
    SET is_not_interested = true,
        not_interested_at = COALESCE(not_interested_at, now())
    WHERE public.normalize_phone(phone) IN (SELECT phone FROM _tmp_historical_ni_phones);

    -- Step B: Mark all Master Contacts directly linked via master_contact_events, master_contact_assignments, or audit_logs
    UPDATE public.master_contacts
    SET is_not_interested = true,
        not_interested_at = COALESCE(not_interested_at, now())
    WHERE id IN (
        SELECT DISTINCT master_contact_id FROM public.master_contact_assignments
        WHERE LOWER(TRIM(COALESCE(status, ''))) IN ('not interested', 'not_interested')
        UNION
        SELECT DISTINCT mce.master_contact_id
        FROM public.master_contact_events mce
        JOIN public.contact_assignments ca ON mce.event_record_id = ca.registration_id::text AND mce.source = 'rathayatra'
        WHERE LOWER(TRIM(COALESCE(ca.status, ''))) IN ('not interested', 'not_interested')
        UNION
        SELECT DISTINCT mce.master_contact_id
        FROM public.master_contact_events mce
        JOIN public.krishnashtami_contact_assignments kca ON mce.event_record_id = kca.registration_id::text AND mce.source = 'krishnashtami'
        WHERE LOWER(TRIM(COALESCE(kca.status, ''))) IN ('not interested', 'not_interested')
        UNION
        SELECT DISTINCT mce.master_contact_id
        FROM public.master_contact_events mce
        JOIN public.feedback_contact_assignments fca ON mce.event_record_id = fca.feedback_contact_id::text AND mce.source IN ('feedback_contacts', 'feedback')
        WHERE LOWER(TRIM(COALESCE(fca.status, ''))) IN ('not interested', 'not_interested')
        UNION
        SELECT DISTINCT mc.id
        FROM public.master_contacts mc
        JOIN public.audit_logs al ON mc.id::text = al.details->>'contact_id'
        WHERE (al.details->>'new_status' ILIKE 'not interested' OR al.action = 'CONTACT_MARKED_NOT_INTERESTED')
          AND al.details->>'contact_id' IS NOT NULL
        UNION
        SELECT DISTINCT mce.master_contact_id
        FROM public.master_contact_events mce
        JOIN public.audit_logs al ON mce.event_record_id = al.details->>'contact_id'
        WHERE (al.details->>'new_status' ILIKE 'not interested' OR al.action = 'CONTACT_MARKED_NOT_INTERESTED')
          AND al.details->>'contact_id' IS NOT NULL
    );

    -- Step C: Create missing blocked Master Contacts for any discovered phone without an existing Master Contact
    INSERT INTO public.master_contacts (
        phone,
        name,
        gender,
        is_not_interested,
        not_interested_at,
        not_interested_by,
        created_at,
        updated_at
    )
    SELECT
        t.phone,
        t.name,
        t.gender,
        true,
        COALESCE(t.status_time, now()),
        NULL,
        now(),
        now()
    FROM _tmp_historical_ni_phones t
    WHERE NOT EXISTS (
        SELECT 1 FROM public.master_contacts mc
        WHERE public.normalize_phone(mc.phone) = t.phone
           OR mc.phone = t.phone
    )
    ON CONFLICT (phone) DO UPDATE
    SET is_not_interested = true,
        not_interested_at = COALESCE(master_contacts.not_interested_at, EXCLUDED.not_interested_at, now()),
        updated_at = now();

    -- Step D: Deactivate all active assignments corresponding to historically Not Interested identities
    -- 1. master_contact_assignments
    UPDATE public.master_contact_assignments mca
    SET is_active = false,
        status = 'Not Interested',
        updated_at = now()
    WHERE mca.is_active = true
      AND (
          mca.master_contact_id IN (
              SELECT mc.id FROM public.master_contacts mc WHERE mc.is_not_interested = true
          )
          OR LOWER(TRIM(COALESCE(mca.status, ''))) IN ('not interested', 'not_interested')
      );

    -- 2. contact_assignments
    UPDATE public.contact_assignments ca
    SET is_active = false,
        status = 'Not Interested',
        updated_at = now()
    WHERE ca.is_active = true
      AND (
          LOWER(TRIM(COALESCE(ca.status, ''))) IN ('not interested', 'not_interested')
          OR ca.registration_id IN (
              SELECT r.id FROM public.registrations r 
              WHERE public.normalize_phone(r.phone) IN (SELECT phone FROM _tmp_historical_ni_phones)
                 OR public.normalize_phone(r.phone) IN (SELECT public.normalize_phone(mc.phone) FROM public.master_contacts mc WHERE mc.is_not_interested = true)
          )
          OR ca.registration_id IN (
              SELECT r.id
              FROM public.registrations r
              JOIN public.master_contact_events mce ON r.id::text = mce.event_record_id AND mce.source = 'rathayatra'
              JOIN public.master_contacts mc ON mce.master_contact_id = mc.id
              WHERE mc.is_not_interested = true
          )
      );

    -- 3. krishnashtami_contact_assignments
    UPDATE public.krishnashtami_contact_assignments kca
    SET is_active = false,
        status = 'Not Interested',
        updated_at = now()
    WHERE kca.is_active = true
      AND (
          LOWER(TRIM(COALESCE(kca.status, ''))) IN ('not interested', 'not_interested')
          OR kca.registration_id IN (
              SELECT kr.id FROM public.krishnashtami_registrations kr 
              WHERE public.normalize_phone(kr.phone) IN (SELECT phone FROM _tmp_historical_ni_phones)
                 OR public.normalize_phone(kr.phone) IN (SELECT public.normalize_phone(mc.phone) FROM public.master_contacts mc WHERE mc.is_not_interested = true)
          )
          OR kca.registration_id IN (
              SELECT kr.id
              FROM public.krishnashtami_registrations kr
              JOIN public.master_contact_events mce ON kr.id::text = mce.event_record_id AND mce.source = 'krishnashtami'
              JOIN public.master_contacts mc ON mce.master_contact_id = mc.id
              WHERE mc.is_not_interested = true
          )
      );

    -- 4. feedback_contact_assignments
    UPDATE public.feedback_contact_assignments fca
    SET is_active = false,
        status = 'Not Interested',
        updated_at = now()
    WHERE fca.is_active = true
      AND (
          LOWER(TRIM(COALESCE(fca.status, ''))) IN ('not interested', 'not_interested')
          OR fca.feedback_contact_id IN (
              SELECT fc.id FROM public.feedback_contacts fc 
              WHERE public.normalize_phone(fc.phone) IN (SELECT phone FROM _tmp_historical_ni_phones)
                 OR public.normalize_phone(fc.phone) IN (SELECT public.normalize_phone(mc.phone) FROM public.master_contacts mc WHERE mc.is_not_interested = true)
          )
          OR fca.feedback_contact_id IN (
              SELECT fc.id
              FROM public.feedback_contacts fc
              JOIN public.master_contact_events mce ON fc.id::text = mce.event_record_id AND mce.source IN ('feedback_contacts', 'feedback')
              JOIN public.master_contacts mc ON mce.master_contact_id = mc.id
              WHERE mc.is_not_interested = true
          )
      );

    DROP TABLE IF EXISTS _tmp_historical_ni_phones;
END $$;

-- Ensure obsolete 4-argument overload is cleanly dropped to prevent PGRST203 ambiguity
DROP FUNCTION IF EXISTS public.assign_master_contact_atomic(uuid, uuid, uuid, integer);

-- LOCK HIERARCHY & COORDINATION PROTOCOL:
-- TIER 0: GLOBAL CONTACT-IDENTITY MUTEX (Acquired FIRST by ALL THREE RPCs below):
--    - pg_advisory_xact_lock(hashtext('hkm:contact-identity-global:v1'))
--    - Deliberately serializes identity discovery and mutations across these RPCs. This is a
--      conservative correctness gate because the identity graph can expand across multiple
--      phones and Master Contact IDs while a transaction is running. It prevents a competing
--      RPC from creating/attaching an identity between discovery and blocking.
--    - NOTE: This lock protocol prevents deadlocks ONLY among transactions that follow
--      this same lock hierarchy. External transactions that do not acquire
--      hkm:contact-identity-global:v1 first (e.g., direct DML, migrations, or
--      uncoordinated writes) are NOT covered and may still deadlock.
-- TIER 1: CANONICAL PHONE ADVISORY LOCKS, sorted lexicographically ascending.
-- TIER 2: MASTER CONTACT ADVISORY LOCKS, sorted by UUID ascending.
-- TIER 3: SOURCE CONTACT ADVISORY LOCK (source assignments only).
-- TIER 4: MASTER CONTACT ROW LOCKS (FOR SHARE in assigners; FOR UPDATE in Not Interested), sorted by UUID ascending.
-- TIER 5: OPERATOR ADVISORY + contact_operators FOR UPDATE (capacity serialization).
-- TIER 6: EXISTING ASSIGNMENT ROW LOCK (FOR UPDATE).
-- TIER 7: FINAL EXCLUSION RECHECK immediately before assignment mutation.
-- TIER 8: MUTATIONS & EVENT LINKING:
--    - All assignment deactivations, assignment inserts, and master_contact_events links occur
--      strictly under full lock protection after all validations pass.
-- IDENTITY BOOTSTRAP EXCEPTION:
--    - When creating a new Master Contact before its UUID exists, creation is allowed only while
--      TIER 0 and the canonical TIER 1 phone lock(s) are held. Its TIER 2 lock is acquired immediately
--      after INSERT and before inserting its master_contact_events link. Every competing path in these
--      three RPCs acquires the same TIER 0 mutex first.

-- 6. Update assign_master_contact_atomic
-- Enforces coordinated locking, operator capacity under row lock FOR UPDATE (no hard-coded 40 bypass),
-- fail-closed male check, persistent Not Interested exclusion with pre-insert recheck, and sanitized error logging.
-- p_max_capacity: DEPRECATED. Accepted for caller compatibility but ignored.
--   Capacity is always enforced from contact_operators.capacity (fetched under FOR UPDATE lock).
CREATE OR REPLACE FUNCTION public.assign_master_contact_atomic(
    p_master_contact_id uuid,
    p_operator_id       uuid,
    p_assigned_by       uuid DEFAULT NULL,
    p_max_capacity      integer DEFAULT 40,
    p_allow_reassign    boolean DEFAULT FALSE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_op_capacity           integer;
    v_effective_capacity    integer;
    v_current_count         integer;
    v_existing_active_id    uuid;
    v_existing_operator_id  uuid;
    v_op_active             boolean;
    v_contact_gender        text;
    v_contact_phone         text;
    v_norm_phone            text;
    v_all_phones            text[];
    v_cur_phone             text;
    v_is_not_interested     boolean;
    v_new_id                uuid;
BEGIN
    -- TIER 0: serialize identity discovery/mutations with both other contact RPCs.
    PERFORM pg_advisory_xact_lock(hashtext('hkm:contact-identity-global:v1'));

    -- 1. Unlocked snapshot read to fetch phone & gender for canonical lock ordering
    SELECT phone, gender, COALESCE(is_not_interested, false)
    INTO v_contact_phone, v_contact_gender, v_is_not_interested
    FROM public.master_contacts
    WHERE id = p_master_contact_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'code',    'CONTACT_NOT_FOUND',
            'message', 'Master contact not found'
        );
    END IF;

    v_norm_phone := public.normalize_phone(v_contact_phone);

    -- Fail-closed on missing or invalid canonical phone identity
    IF v_norm_phone IS NULL OR length(v_norm_phone) <> 10 OR v_norm_phone = '0000000000' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code',    'INVALID_PHONE',
            'message', 'Master contact has missing or invalid phone number.'
        );
    END IF;

    -- Collect all associated phone identities in deterministic ascending order
    SELECT ARRAY(
        SELECT DISTINCT p
        FROM (
            SELECT v_norm_phone AS p
            UNION
            SELECT public.normalize_phone(r.phone) AS p
            FROM public.master_contact_events mce
            JOIN public.registrations r ON mce.event_record_id = r.id::text AND mce.source = 'rathayatra'
            WHERE mce.master_contact_id = p_master_contact_id
            UNION
            SELECT public.normalize_phone(kr.phone) AS p
            FROM public.master_contact_events mce
            JOIN public.krishnashtami_registrations kr ON mce.event_record_id = kr.id::text AND mce.source = 'krishnashtami'
            WHERE mce.master_contact_id = p_master_contact_id
            UNION
            SELECT public.normalize_phone(fc.phone) AS p
            FROM public.master_contact_events mce
            JOIN public.feedback_contacts fc ON mce.event_record_id = fc.id::text AND mce.source IN ('feedback_contacts', 'feedback')
            WHERE mce.master_contact_id = p_master_contact_id
            UNION
            -- Include phones of duplicate/linked Master Contacts attached to the same source event.
            SELECT public.normalize_phone(mc_linked.phone) AS p
            FROM public.master_contact_events root_event
            JOIN public.master_contact_events linked_event
              ON linked_event.source = root_event.source
             AND linked_event.event_record_id = root_event.event_record_id
            JOIN public.master_contacts mc_linked ON mc_linked.id = linked_event.master_contact_id
            WHERE root_event.master_contact_id = p_master_contact_id
        ) sub
        WHERE p IS NOT NULL AND length(p) = 10 AND p <> '0000000000'
        ORDER BY p
    ) INTO v_all_phones;

    -- 2. TIER 1: Canonical phone advisory lock(s) in deterministic order
    FOREACH v_cur_phone IN ARRAY v_all_phones LOOP
        PERFORM pg_advisory_xact_lock(hashtext('phone:' || v_cur_phone));
    END LOOP;

    -- 3. TIER 2: Master contact advisory lock (SECOND)
    PERFORM pg_advisory_xact_lock(hashtext('contact:' || p_master_contact_id::TEXT));

    -- 4. TIER 3: Row lock on public.master_contacts FOR SHARE (THIRD)
    PERFORM 1
    FROM public.master_contacts
    WHERE id = p_master_contact_id
    FOR SHARE;

    -- Permanent exclusion guard: Not Interested contacts can NEVER be assigned.
    -- Defensive global check: reject if THIS master contact OR ANY master contact with an associated phone is marked Not Interested.
    IF EXISTS (
        SELECT 1
        FROM public.master_contacts
        WHERE is_not_interested = true
          AND (
              id = p_master_contact_id
              OR public.normalize_phone(phone) = ANY(v_all_phones)
          )
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'code',    'CONTACT_NOT_INTERESTED',
            'message', 'Contact has been marked as Not Interested and cannot be assigned.'
        );
    END IF;

    -- 5. Strict fail-closed gender restriction: confirmed male only
    IF LOWER(TRIM(COALESCE(v_contact_gender, ''))) NOT IN ('male', 'm') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code',    'GENDER_INELIGIBLE',
            'message', 'Contact is not eligible for operator assignment (only confirmed male contacts may be assigned).'
        );
    END IF;

    -- 6. TIER 4: Operator Lock (Advisory + Row lock FOR UPDATE)
    PERFORM pg_advisory_xact_lock(hashtext('operator:' || p_operator_id::TEXT));

    SELECT is_active, capacity
    INTO v_op_active, v_op_capacity
    FROM public.contact_operators
    WHERE id = p_operator_id
    FOR UPDATE;

    IF v_op_active IS NULL OR NOT v_op_active THEN
        RETURN jsonb_build_object(
            'success', false,
            'code',    'OPERATOR_DISABLED',
            'message', 'Operator not found or is disabled'
        );
    END IF;

    -- Fail closed on invalid capacity without silent fallback
    IF v_op_capacity IS NULL OR v_op_capacity < 1 OR v_op_capacity > 500 THEN
        RETURN jsonb_build_object(
            'success', false,
            'code',    'INVALID_OPERATOR_CAPACITY',
            'message', format('Operator configured capacity (%s) is invalid. Must be between 1 and 500.', COALESCE(v_op_capacity::text, 'NULL'))
        );
    END IF;

    v_effective_capacity := v_op_capacity;

    -- 7. TIER 5: Assignment Row Lock FOR UPDATE
    SELECT id, operator_id INTO v_existing_active_id, v_existing_operator_id
    FROM public.master_contact_assignments
    WHERE master_contact_id = p_master_contact_id AND is_active = true
    FOR UPDATE;

    -- Idempotency guard: already assigned to target operator and reassignment not requested
    IF v_existing_active_id IS NOT NULL AND v_existing_operator_id = p_operator_id AND NOT p_allow_reassign THEN
        RETURN jsonb_build_object(
            'success',       true,
            'code',          'ALREADY_ASSIGNED',
            'status',        'already_assigned',
            'message',       'Already assigned to this operator',
            'assignment_id', v_existing_active_id,
            'operator_id',   p_operator_id
        );
    END IF;

    -- If assigned to another operator and reassignment not permitted
    IF v_existing_active_id IS NOT NULL AND v_existing_operator_id <> p_operator_id AND NOT p_allow_reassign THEN
        RETURN jsonb_build_object(
            'success',                false,
            'code',                   'CONTACT_ALREADY_ASSIGNED',
            'message',                'Contact is already actively assigned to another operator.',
            'existing_assignment_id', v_existing_active_id,
            'existing_operator_id',   v_existing_operator_id
        );
    END IF;

    -- Count current active assignments for target operator in master_contact_assignments (excluding contact if replacing)
    SELECT count(*) INTO v_current_count
    FROM public.master_contact_assignments
    WHERE operator_id = p_operator_id 
      AND is_active = true
      AND id <> COALESCE(v_existing_active_id, '00000000-0000-0000-0000-000000000000'::uuid);

    -- Check operator-specific capacity limit BEFORE any modification
    IF v_current_count >= v_effective_capacity THEN
        RETURN jsonb_build_object(
            'success',       false,
            'code',          'OPERATOR_CAPACITY_EXCEEDED',
            'message',       format('Operator capacity limit reached (Max %s)', v_effective_capacity),
            'current_count', v_current_count,
            'max_capacity',  v_effective_capacity
        );
    END IF;

    -- 8. TIER 6: CRITICAL CONCURRENCY RECHECK:
    -- Immediately before deactivation/insert, re-verify Not Interested flag has not been updated
    IF EXISTS (
        SELECT 1
        FROM public.master_contacts
        WHERE is_not_interested = true
          AND (
              id = p_master_contact_id
              OR public.normalize_phone(phone) = ANY(v_all_phones)
          )
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'code',    'CONTACT_NOT_INTERESTED',
            'message', 'Contact has been marked as Not Interested and cannot be assigned.'
        );
    END IF;

    -- 9. Deactivate previous active assignment atomically, preserving complete audit history
    IF v_existing_active_id IS NOT NULL THEN
        UPDATE public.master_contact_assignments
        SET is_active = false, updated_at = now()
        WHERE id = v_existing_active_id;
    END IF;

    -- 10. Insert new active assignment row targeting authentic schema columns
    INSERT INTO public.master_contact_assignments (
        master_contact_id, operator_id, is_active, status, assigned_at, updated_at
    ) VALUES (
        p_master_contact_id, p_operator_id, true, 'assigned', now(), now()
    )
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success',       true,
        'code',          CASE WHEN v_existing_active_id IS NOT NULL THEN 'REASSIGNED' ELSE 'ASSIGNED' END,
        'status',        CASE WHEN v_existing_active_id IS NOT NULL THEN 'reassigned' ELSE 'assigned' END,
        'message',       'Assigned successfully',
        'assignment_id', v_new_id,
        'operator_id',   p_operator_id
    );

EXCEPTION
    WHEN unique_violation THEN
        RETURN jsonb_build_object(
            'success', false,
            'code',    'CONCURRENT_ASSIGNMENT_CONFLICT',
            'message', 'Concurrent assignment conflict — contact was assigned by another request.'
        );
    WHEN OTHERS THEN
        RAISE WARNING 'assign_master_contact_atomic internal failure: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
        RETURN jsonb_build_object(
            'success', false,
            'code',    'INTERNAL_ERROR',
            'message', 'An internal error occurred during assignment processing.'
        );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assign_master_contact_atomic(uuid, uuid, uuid, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_master_contact_atomic(uuid, uuid, uuid, integer, boolean) TO service_role;

-- 7. Update assign_contact_atomic
-- Ensure legacy 5-argument overload is cleanly dropped to prevent PGRST203 ambiguity
DROP FUNCTION IF EXISTS public.assign_contact_atomic(UUID, UUID, TEXT, UUID, INTEGER);

-- Enforces coordinated locking across source assignments and master Not Interested workflows,
-- per-source operator capacity under row lock FOR UPDATE (no hard-coded 40 bypass),
-- schema-accurate assigned_by and status handling per table, pre-insert exclusion recheck, and sanitized error logging.
CREATE OR REPLACE FUNCTION public.assign_contact_atomic(
    p_contact_id     UUID,
    p_operator_id    UUID,
    p_source         TEXT,
    p_assigned_by    UUID DEFAULT NULL,
    p_max_capacity   INTEGER DEFAULT 40,
    p_allow_reassign BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_assign_table        TEXT;
    v_reg_table           TEXT;
    v_fk_col              TEXT;
    v_contact_exists      BOOLEAN;
    v_op_active           BOOLEAN;
    v_op_capacity         INTEGER;
    v_effective_capacity  INTEGER;
    v_contact_name        TEXT;
    v_contact_gender      TEXT;
    v_contact_phone       TEXT;
    v_norm_phone          TEXT;
    v_master_id           UUID;
    v_master_phone        TEXT;
    v_norm_master_phone   TEXT;
    v_linked_master_ids   UUID[] := ARRAY[]::UUID[];
    v_locked_master_ids   UUID[] := ARRAY[]::UUID[];
    v_all_phones          TEXT[] := ARRAY[]::TEXT[];
    v_cur_phone           TEXT;
    v_cur_master_id       UUID;
    v_is_not_interested   BOOLEAN;
    v_active_count        INTEGER;
    v_existing_id         UUID;
    v_existing_op_id      UUID;
    v_new_id              UUID;
    v_sql                 TEXT;
BEGIN
    -- TIER 0: serialize identity discovery/mutations with both other contact RPCs.
    PERFORM pg_advisory_xact_lock(hashtext('hkm:contact-identity-global:v1'));

    -- Fail-closed source validation: reject NULL, empty, or unsupported source values
    IF p_source IS NULL OR TRIM(p_source) = '' THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code',    'INVALID_SOURCE',
            'message', 'p_source is required and must be one of: rathayatra, krishnashtami, feedback_contacts, feedback'
        );
    END IF;

    CASE p_source
        WHEN 'krishnashtami' THEN
            v_assign_table := 'krishnashtami_contact_assignments';
            v_reg_table    := 'krishnashtami_registrations';
            v_fk_col       := 'registration_id';
        WHEN 'feedback_contacts', 'feedback' THEN
            v_assign_table := 'feedback_contact_assignments';
            v_reg_table    := 'feedback_contacts';
            v_fk_col       := 'feedback_contact_id';
        WHEN 'rathayatra' THEN
            v_assign_table := 'contact_assignments';
            v_reg_table    := 'registrations';
            v_fk_col       := 'registration_id';
        ELSE
            RETURN jsonb_build_object(
                'success', FALSE,
                'code',    'INVALID_SOURCE',
                'message', format('Unsupported source value: %L. Must be one of: rathayatra, krishnashtami, feedback_contacts, feedback', p_source)
            );
    END CASE;

    -- 1. Unlocked snapshot lookup to verify contact exists and fetch authoritative gender & phone
    v_sql := format('SELECT true, full_name, gender, phone FROM public.%I WHERE id = $1', v_reg_table);
    EXECUTE v_sql INTO v_contact_exists, v_contact_name, v_contact_gender, v_contact_phone USING p_contact_id;

    IF v_contact_exists IS NULL OR NOT v_contact_exists THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code',    'CONTACT_NOT_FOUND',
            'message', 'Contact not found in source registration table'
        );
    END IF;

    v_norm_phone := public.normalize_phone(v_contact_phone);

    -- 2. Validate canonical phone identity (Fail closed on missing or invalid phone)
    IF v_norm_phone IS NULL OR length(v_norm_phone) <> 10 OR v_norm_phone = '0000000000' THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code',    'INVALID_PHONE',
            'message', 'Source contact has missing or invalid phone number.'
        );
    END IF;

    -- 3. Deterministic event-linked Master Contact resolution:
    -- Collect EVERY Master Contact linked to this exact source registration.
    -- Feedback source aliases are treated as equivalent, matching table routing above.
    SELECT COALESCE(
        array_agg(DISTINCT mce.master_contact_id ORDER BY mce.master_contact_id)
            FILTER (WHERE mce.master_contact_id IS NOT NULL),
        ARRAY[]::UUID[]
    )
    INTO v_linked_master_ids
    FROM public.master_contact_events mce
    WHERE mce.event_record_id = p_contact_id::text
      AND (
          (p_source = 'krishnashtami' AND mce.source = 'krishnashtami')
          OR (p_source IN ('feedback_contacts', 'feedback') AND mce.source IN ('feedback_contacts', 'feedback'))
          OR (p_source NOT IN ('krishnashtami', 'feedback_contacts', 'feedback') AND mce.source = 'rathayatra')
      );

    -- Build a deterministic lock set from the source phone, all directly linked Master
    -- Contact phones, and all source-registration phones linked to those Master Contacts.
    SELECT ARRAY(
        SELECT DISTINCT p
        FROM (
            SELECT v_norm_phone AS p
            UNION
            SELECT public.normalize_phone(mc.phone)
            FROM public.master_contacts mc
            WHERE mc.id = ANY(v_linked_master_ids)
            UNION
            SELECT public.normalize_phone(r.phone)
            FROM public.master_contact_events mce
            JOIN public.registrations r ON r.id::text = mce.event_record_id AND mce.source = 'rathayatra'
            WHERE mce.master_contact_id = ANY(v_linked_master_ids)
            UNION
            SELECT public.normalize_phone(kr.phone)
            FROM public.master_contact_events mce
            JOIN public.krishnashtami_registrations kr ON kr.id::text = mce.event_record_id AND mce.source = 'krishnashtami'
            WHERE mce.master_contact_id = ANY(v_linked_master_ids)
            UNION
            SELECT public.normalize_phone(fc.phone)
            FROM public.master_contact_events mce
            JOIN public.feedback_contacts fc ON fc.id::text = mce.event_record_id AND mce.source IN ('feedback_contacts', 'feedback')
            WHERE mce.master_contact_id = ANY(v_linked_master_ids)
        ) phone_set
        WHERE p IS NOT NULL AND length(p) = 10 AND p <> '0000000000'
        ORDER BY p
    ) INTO v_all_phones;

    -- Fail-closed identity graph validation:
    -- Handle missing, invalid, or conflicting phone identities across linked Master Contacts.
    IF cardinality(v_linked_master_ids) > 0 THEN
        DECLARE
            v_invalid_mc_count   INTEGER;
            v_valid_mc_count     INTEGER;
            v_distinct_mc_phones TEXT[];
        BEGIN
            SELECT 
                COUNT(*) FILTER (
                    WHERE mc.phone IS NULL 
                       OR public.normalize_phone(mc.phone) IS NULL 
                       OR length(public.normalize_phone(mc.phone)) <> 10 
                       OR public.normalize_phone(mc.phone) = '0000000000'
                ),
                COUNT(*) FILTER (
                    WHERE mc.phone IS NOT NULL 
                      AND public.normalize_phone(mc.phone) IS NOT NULL 
                      AND length(public.normalize_phone(mc.phone)) = 10 
                      AND public.normalize_phone(mc.phone) <> '0000000000'
                ),
                ARRAY(
                    SELECT DISTINCT public.normalize_phone(mc.phone)
                    FROM public.master_contacts mc
                    WHERE mc.id = ANY(v_linked_master_ids)
                      AND mc.phone IS NOT NULL
                      AND public.normalize_phone(mc.phone) IS NOT NULL
                      AND length(public.normalize_phone(mc.phone)) = 10
                      AND public.normalize_phone(mc.phone) <> '0000000000'
                    ORDER BY 1
                )
            INTO v_invalid_mc_count, v_valid_mc_count, v_distinct_mc_phones
            FROM public.master_contacts mc
            WHERE mc.id = ANY(v_linked_master_ids);

            -- All linked Master Contacts have missing or invalid phone numbers
            IF v_valid_mc_count = 0 THEN
                RETURN jsonb_build_object(
                    'success', FALSE,
                    'code',    'INVALID_PHONE',
                    'message', format('Linked Master Contact(s) for source registration %s have missing or invalid phone numbers. Manual reconciliation required.', p_contact_id)
                );
            END IF;

            -- Mixture of valid and invalid/corrupted linked Master Contacts
            IF v_invalid_mc_count > 0 THEN
                RETURN jsonb_build_object(
                    'success', FALSE,
                    'code',    'IDENTITY_CONFLICT',
                    'message', format(
                        'Source registration %s is linked to both valid and invalid/corrupted Master Contact phone records. Manual reconciliation required.',
                        p_contact_id
                    )
                );
            END IF;

            -- Multiple distinct valid phones among linked Master Contacts
            IF cardinality(v_distinct_mc_phones) > 1 THEN
                RETURN jsonb_build_object(
                    'success', FALSE,
                    'code',    'IDENTITY_CONFLICT',
                    'message', format(
                        'Source registration %s is linked to Master Contacts with conflicting phone identities (%s). Identity graph is ambiguous. Manual reconciliation required.',
                        p_contact_id,
                        array_to_string(v_distinct_mc_phones, ', ')
                    )
                );
            END IF;
        END;
    END IF;

    -- Any blocked linked record or blocked duplicate for an affected normalized phone wins.
    IF EXISTS (
        SELECT 1
        FROM public.master_contacts mc
        WHERE mc.is_not_interested = true
          AND (
              mc.id = ANY(v_linked_master_ids)
              OR public.normalize_phone(mc.phone) = ANY(v_all_phones)
          )
    ) THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code',    'CONTACT_NOT_INTERESTED',
            'message', 'Contact has been marked as Not Interested and cannot be assigned.'
        );
    END IF;

    -- Select a canonical unblocked linked record deterministically only after considering
    -- the entire linked ID set. If no event link exists, use the oldest normalized-phone match.
    IF cardinality(v_linked_master_ids) > 0 THEN
        SELECT mc.id, mc.phone
        INTO v_master_id, v_master_phone
        FROM public.master_contacts mc
        WHERE mc.id = ANY(v_linked_master_ids)
        ORDER BY mc.created_at ASC NULLS LAST, mc.id ASC
        LIMIT 1;
    ELSE
        SELECT mc.id, mc.phone
        INTO v_master_id, v_master_phone
        FROM public.master_contacts mc
        WHERE public.normalize_phone(mc.phone) = v_norm_phone
        ORDER BY mc.created_at ASC NULLS LAST, mc.id ASC
        LIMIT 1;
    END IF;

    v_norm_master_phone := public.normalize_phone(v_master_phone);
    IF v_norm_master_phone IS NOT NULL AND NOT (v_norm_master_phone = ANY(v_all_phones)) THEN
        SELECT ARRAY(
            SELECT DISTINCT p FROM unnest(v_all_phones || ARRAY[v_norm_master_phone]) AS p
            WHERE p IS NOT NULL AND length(p) = 10 AND p <> '0000000000'
            ORDER BY p
        ) INTO v_all_phones;
    END IF;

    -- 4. TIER 1: Acquire every affected canonical phone advisory lock in ascending order.
    FOREACH v_cur_phone IN ARRAY v_all_phones LOOP
        PERFORM pg_advisory_xact_lock(hashtext('phone:' || v_cur_phone));
    END LOOP;

    -- PREVENT FUTURE BYPASS:
    -- Before creating a new Master Contact for a source registration:
    -- 1. Check whether any existing Master Contact with the same normalized phone has is_not_interested = true.
    -- 2. If found, return CONTACT_NOT_INTERESTED immediately.
    -- 3. Do not create an unblocked duplicate Master Contact.
    -- 4. Keep this check inside the existing phone-lock coordination.
    -- 5. Retain the existing global exclusion checks before assignment insertion.
    IF EXISTS (
        SELECT 1
        FROM public.master_contacts mc
        WHERE mc.is_not_interested = true
          AND (
              mc.id = ANY(v_linked_master_ids)
              OR public.normalize_phone(mc.phone) = ANY(v_all_phones)
          )
    ) THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code',    'CONTACT_NOT_INTERESTED',
            'message', 'Contact has been marked as Not Interested and cannot be assigned.'
        );
    END IF;

    -- 5. IDENTITY BOOTSTRAP EXCEPTION (DOCUMENTED LOCK PROTOCOL):
    -- When no Master Contact exists yet for this phone, a Master Contact UUID does not exist to lock.
    -- Creation is serialized exclusively by TIER 0 and the Tier 1 Canonical Phone Advisory Lock(s).
    -- All competing paths (assign_master_contact_atomic, assign_contact_atomic, mark_contact_not_interested_atomic)
    -- acquire this identical canonical phone advisory lock FIRST, guaranteeing race-free insertion.
    -- Once created, its UUID is assigned to v_master_id and immediately locked under Tier 2 & Tier 4 below.
    -- Note: Event linking (master_contact_events) is deferred to Step 15, so no event mutation occurs before all locks are held.
    IF v_master_id IS NULL THEN
        INSERT INTO public.master_contacts (phone, name, gender, is_not_interested, created_at, updated_at)
        VALUES (v_norm_phone, COALESCE(v_contact_name, 'Contact'), v_contact_gender, false, now(), now())
        ON CONFLICT (phone) DO UPDATE
        SET updated_at = now()
        RETURNING id INTO v_master_id;
    END IF;

    -- 6. TIER 2: Lock every directly linked ID plus the selected/created canonical ID in UUID order.
    SELECT ARRAY(
        SELECT DISTINCT id
        FROM unnest(v_linked_master_ids || ARRAY[v_master_id]::UUID[]) AS ids(id)
        WHERE id IS NOT NULL
        ORDER BY id
    ) INTO v_locked_master_ids;
    FOREACH v_cur_master_id IN ARRAY v_locked_master_ids LOOP
        PERFORM pg_advisory_xact_lock(hashtext('contact:' || v_cur_master_id::TEXT));
    END LOOP;

    -- 7. TIER 3: Source registration advisory lock (THIRD)
    PERFORM pg_advisory_xact_lock(hashtext('contact:' || p_source || ':' || p_contact_id::TEXT));

    -- 8. TIER 4: Row lock on master_contacts FOR SHARE in deterministic order (FOURTH) and verify exclusion
    PERFORM 1
    FROM public.master_contacts
    WHERE id = ANY(v_locked_master_ids)
    ORDER BY id
    FOR SHARE;

    -- Defensive global check: reject if ANY master contact associated with the affected phone identities is marked Not Interested
    IF EXISTS (
        SELECT 1
        FROM public.master_contacts
        WHERE is_not_interested = true
          AND (
              id = ANY(v_locked_master_ids)
              OR public.normalize_phone(phone) = ANY(v_all_phones)
          )
    ) THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code',    'CONTACT_NOT_INTERESTED',
            'message', 'Contact has been marked as Not Interested and cannot be assigned.'
        );
    END IF;

    -- 9. Strict fail-closed gender restriction: confirmed male only
    IF LOWER(TRIM(COALESCE(v_contact_gender, ''))) NOT IN ('male', 'm') THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code',    'GENDER_INELIGIBLE',
            'message', 'Contact is not eligible for operator assignment (only confirmed male contacts may be assigned).'
        );
    END IF;

    -- 10. TIER 5: Operator Lock (Advisory + Row lock FOR UPDATE)
    PERFORM pg_advisory_xact_lock(hashtext('operator:' || p_operator_id::TEXT));

    SELECT is_active, capacity
    INTO v_op_active, v_op_capacity
    FROM public.contact_operators
    WHERE id = p_operator_id
    FOR UPDATE;

    IF v_op_active IS NULL OR NOT v_op_active THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code',    'OPERATOR_DISABLED',
            'message', 'Operator not found or is currently disabled'
        );
    END IF;

    -- Fail closed on invalid capacity without silent fallback
    IF v_op_capacity IS NULL OR v_op_capacity < 1 OR v_op_capacity > 500 THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code',    'INVALID_OPERATOR_CAPACITY',
            'message', format('Operator configured capacity (%s) is invalid. Must be between 1 and 500.', COALESCE(v_op_capacity::text, 'NULL'))
        );
    END IF;

    v_effective_capacity := v_op_capacity;

    -- 11. TIER 6: Assignment Row Lock FOR UPDATE
    v_sql := format(
        'SELECT id, operator_id FROM public.%I WHERE %I = $1 AND is_active = TRUE FOR UPDATE',
        v_assign_table, v_fk_col
    );
    EXECUTE v_sql INTO v_existing_id, v_existing_op_id USING p_contact_id;

    -- Idempotency guard: if already assigned to requested operator and reassignment not requested
    IF v_existing_id IS NOT NULL AND v_existing_op_id = p_operator_id AND NOT p_allow_reassign THEN
        RETURN jsonb_build_object(
            'success',       TRUE,
            'code',          'ALREADY_ASSIGNED',
            'status',        'already_assigned',
            'message',       'Already assigned to this operator',
            'assignment_id', v_existing_id,
            'operator_id',   p_operator_id,
            'contact_id',    p_contact_id,
            'source',        p_source
        );
    END IF;

    -- If contact is already assigned to another operator and reassignment is not permitted
    IF v_existing_id IS NOT NULL AND v_existing_op_id <> p_operator_id AND NOT p_allow_reassign THEN
        RETURN jsonb_build_object(
            'success',                FALSE,
            'code',                   'CONTACT_ALREADY_ASSIGNED',
            'message',                'Contact is already actively assigned to another operator.',
            'existing_assignment_id', v_existing_id,
            'existing_operator_id',   v_existing_op_id
        );
    END IF;

    -- Count current active assignments for this operator in this source table (Scope: Per-Source)
    v_sql := format(
        'SELECT count(*) FROM public.%I WHERE operator_id = $1 AND is_active = TRUE AND id <> COALESCE($2, ''00000000-0000-0000-0000-000000000000''::uuid)',
        v_assign_table
    );
    EXECUTE v_sql INTO v_active_count USING p_operator_id, v_existing_id;

    -- Check operator-specific capacity limit BEFORE any modification
    IF v_active_count >= v_effective_capacity THEN
        RETURN jsonb_build_object(
            'success',       FALSE,
            'code',          'OPERATOR_CAPACITY_EXCEEDED',
            'message',       format('Operator has reached maximum active capacity of %s', v_effective_capacity),
            'current_count', v_active_count,
            'max_capacity',  v_effective_capacity
        );
    END IF;

    -- 12. TIER 7: CRITICAL CONCURRENCY RECHECK:
    -- Immediately before deactivation/insert, re-verify persistent exclusion after all locks are held
    IF EXISTS (
        SELECT 1
        FROM public.master_contacts mc
        WHERE mc.is_not_interested = true
          AND (
              mc.id = ANY(v_locked_master_ids)
              OR public.normalize_phone(mc.phone) = ANY(v_all_phones)
          )
    ) THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code',    'CONTACT_NOT_INTERESTED',
            'message', 'Contact has been marked as Not Interested and cannot be assigned.'
        );
    END IF;

    -- 13. Deactivate previous active assignment atomically, preserving complete audit history
    IF v_existing_id IS NOT NULL THEN
        v_sql := format('UPDATE public.%I SET is_active = FALSE, updated_at = now() WHERE id = $1', v_assign_table);
        EXECUTE v_sql USING v_existing_id;
    END IF;

    -- 14. Insert new active assignment with schema-accurate column names, types, and statuses
    IF p_source IN ('feedback_contacts', 'feedback') THEN
        v_sql := format(
            'INSERT INTO public.feedback_contact_assignments ' ||
            '(feedback_contact_id, operator_id, is_active, status, assigned_at, updated_at, assigned_by) ' ||
            'VALUES ($1, $2, TRUE, ''Assigned'', now(), now(), $3) RETURNING id'
        );
        EXECUTE v_sql INTO v_new_id USING p_contact_id, p_operator_id, p_assigned_by;
    ELSIF p_source = 'krishnashtami' THEN
        v_sql := format(
            'INSERT INTO public.krishnashtami_contact_assignments ' ||
            '(registration_id, operator_id, is_active, status, assigned_at, updated_at, assigned_by) ' ||
            'VALUES ($1, $2, TRUE, ''Pending'', now(), now(), CASE WHEN $3 IS NOT NULL THEN $3::text ELSE ''admin'' END) RETURNING id'
        );
        EXECUTE v_sql INTO v_new_id USING p_contact_id, p_operator_id, p_assigned_by;
    ELSE
        v_sql := format(
            'INSERT INTO public.contact_assignments ' ||
            '(registration_id, operator_id, is_active, status, assigned_at, updated_at, assigned_by) ' ||
            'VALUES ($1, $2, TRUE, ''Pending'', now(), now(), $3) RETURNING id'
        );
        EXECUTE v_sql INTO v_new_id USING p_contact_id, p_operator_id, p_assigned_by;
    END IF;

    -- 15. Ensure this source registration is linked to the resolved master contact in master_contact_events
    -- Performed strictly after assignment success and under full lock protection
    INSERT INTO public.master_contact_events (master_contact_id, source, event_record_id, created_at)
    VALUES (v_master_id, p_source, p_contact_id::text, now())
    ON CONFLICT DO NOTHING;

    RETURN jsonb_build_object(
        'success',       TRUE,
        'code',          CASE WHEN v_existing_id IS NOT NULL THEN 'REASSIGNED' ELSE 'ASSIGNED' END,
        'status',        CASE WHEN v_existing_id IS NOT NULL THEN 'reassigned' ELSE 'assigned' END,
        'message',       'Assignment successful',
        'assignment_id', v_new_id,
        'operator_id',   p_operator_id
    );

EXCEPTION
    WHEN unique_violation THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code',    'CONCURRENT_ASSIGNMENT_CONFLICT',
            'message', 'Concurrent assignment conflict — contact was assigned by another request.'
        );
    WHEN OTHERS THEN
        RAISE WARNING 'assign_contact_atomic internal failure: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
        RETURN jsonb_build_object(
            'success', FALSE,
            'code',    'INTERNAL_ERROR',
            'message', 'An internal error occurred during assignment processing.'
        );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assign_contact_atomic(UUID, UUID, TEXT, UUID, INTEGER, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_contact_atomic(UUID, UUID, TEXT, UUID, INTEGER, BOOLEAN) TO service_role;

-- 8. Function: mark_contact_not_interested_atomic
-- Coordinates locking with assignment RPCs using identical Phone -> Master -> Operator hierarchy:
-- 1. Transitive Closure: Iteratively discovers ALL connected Master Contacts and normalized phones across
--    all 3 source tables (registrations, krishnashtami_registrations, feedback_contacts), master_contact_events,
--    and master_contacts without any LIMIT 1 shortcuts.
-- 2. TIER 1: Acquire required phone advisory locks in deterministic ascending order.
-- 3. Guarantee Master Contact existence for every affected phone identity (creates blocked Master Contact if missing).
-- 4. TIER 2: Acquire all corresponding master-contact advisory locks in deterministic ascending order.
-- 5. TIER 3: Lock affected master contact rows in deterministic ascending order FOR UPDATE.
-- 6. Set is_not_interested = true, not_interested_at = now(), not_interested_by = p_operator_id for every affected Master Contact.
-- 7. Deactivate every active row in master_contact_assignments belonging to any affected Master Contact.
-- 8. Deactivate active source assignments across Rathayatra, Krishnashtami, Feedback for affected phone identities and linked events.
-- 9. Preserve all Master Contact records, assignment records, IDs, and historical data (never physically delete anything).
--
-- p_reason: Accepted for API forward-compatibility and contextual logging, but is not persisted in master_contacts.
--   The persistent audit trail consists of:
--   - master_contacts.is_not_interested = true (permanent flag)
--   - master_contacts.not_interested_at = now() (timestamp of marking)
--   - master_contacts.not_interested_by = p_operator_id (operator who marked)
--   - Deactivated assignment rows in all 4 assignment tables (complete history and per-assignment remarks/notes preserved)
CREATE OR REPLACE FUNCTION public.mark_contact_not_interested_atomic(
    p_master_contact_id UUID DEFAULT NULL,
    p_phone             TEXT DEFAULT NULL,
    p_operator_id       UUID DEFAULT NULL,
    p_reason            TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_norm_master_phone  TEXT;
    v_norm_p_phone       TEXT;
    v_affected_phones    TEXT[] := ARRAY[]::TEXT[];
    v_cur_phone          TEXT;
    v_master_ids         UUID[] := ARRAY[]::UUID[];
    v_cur_master_id      UUID;
    v_source_name        TEXT;
    v_source_gender      TEXT;
    v_master_id          UUID;
    v_phones_prev_count  INTEGER;
    v_masters_prev_count INTEGER;
    v_loop_iter          INTEGER := 0;
BEGIN
    -- TIER 0: serialize identity discovery/mutations with both other contact RPCs.
    PERFORM pg_advisory_xact_lock(hashtext('hkm:contact-identity-global:v1'));

    -- 1. Initial seeds from arguments & identity consistency validation
    -- Fail closed early if both arguments are null
    IF p_phone IS NULL AND p_master_contact_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'code',    'INVALID_PHONE',
            'message', 'Contact phone number is missing or invalid.'
        );
    END IF;

    -- Validate phone argument independently if supplied (reject missing, invalid, incorrectly sized, or sentinel)
    IF p_phone IS NOT NULL THEN
        v_norm_p_phone := public.normalize_phone(p_phone);
        IF v_norm_p_phone IS NULL OR length(v_norm_p_phone) <> 10 OR v_norm_p_phone = '0000000000' THEN
            RETURN jsonb_build_object(
                'success', false,
                'code',    'INVALID_PHONE',
                'message', 'Contact phone number is missing or invalid.'
            );
        END IF;
        v_affected_phones := ARRAY[v_norm_p_phone];
    END IF;

    -- Validate master contact argument if supplied
    IF p_master_contact_id IS NOT NULL THEN
        SELECT public.normalize_phone(phone) INTO v_norm_master_phone
        FROM public.master_contacts
        WHERE id = p_master_contact_id;

        IF NOT FOUND THEN
            RETURN jsonb_build_object(
                'success', false,
                'code',    'CONTACT_NOT_FOUND',
                'message', 'Master contact not found for the provided master_contact_id.'
            );
        END IF;

        -- When both p_master_contact_id and p_phone are provided, verify they belong to the same identity graph
        IF p_phone IS NOT NULL THEN
            IF v_norm_master_phone IS NOT NULL AND v_norm_master_phone = v_norm_p_phone THEN
                -- Directly matches canonical phone
                NULL;
            ELSE
                -- Verify whether v_norm_p_phone is linked to p_master_contact_id via master_contact_events
                IF NOT EXISTS (
                    SELECT 1
                    FROM public.master_contact_events mce
                    JOIN public.registrations r ON r.id::text = mce.event_record_id AND mce.source = 'rathayatra'
                    WHERE mce.master_contact_id = p_master_contact_id AND public.normalize_phone(r.phone) = v_norm_p_phone
                    UNION
                    SELECT 1
                    FROM public.master_contact_events mce
                    JOIN public.krishnashtami_registrations kr ON kr.id::text = mce.event_record_id AND mce.source = 'krishnashtami'
                    WHERE mce.master_contact_id = p_master_contact_id AND public.normalize_phone(kr.phone) = v_norm_p_phone
                    UNION
                    SELECT 1
                    FROM public.master_contact_events mce
                    JOIN public.feedback_contacts fc ON fc.id::text = mce.event_record_id AND mce.source IN ('feedback_contacts', 'feedback')
                    WHERE mce.master_contact_id = p_master_contact_id AND public.normalize_phone(fc.phone) = v_norm_p_phone
                ) THEN
                    RETURN jsonb_build_object(
                        'success', false,
                        'code',    'IDENTITY_MISMATCH',
                        'message', 'Provided master contact ID and phone number do not belong to the same identity graph.'
                    );
                END IF;
            END IF;
        END IF;

        v_master_ids := ARRAY[p_master_contact_id];

        IF v_norm_master_phone IS NOT NULL AND length(v_norm_master_phone) = 10 AND v_norm_master_phone <> '0000000000' THEN
            IF NOT (v_norm_master_phone = ANY(v_affected_phones)) THEN
                v_affected_phones := array_append(v_affected_phones, v_norm_master_phone);
            END IF;
        END IF;
    END IF;

    -- Fail closed early if both arguments are null or neither provided a valid identifier
    IF (v_affected_phones IS NULL OR cardinality(v_affected_phones) = 0)
       AND (v_master_ids IS NULL OR cardinality(v_master_ids) = 0) THEN
        RETURN jsonb_build_object(
            'success', false,
            'code',    'INVALID_PHONE',
            'message', 'Contact phone number is missing or invalid.'
        );
    END IF;

    -- 2. Transitive Closure Identity Discovery:
    -- Iteratively discovers ALL connected Master Contacts and normalized phones across
    -- all 3 source tables (registrations, krishnashtami_registrations, feedback_contacts),
    -- master_contact_events, and master_contacts without any LIMIT 1 shortcuts.
    LOOP
        v_loop_iter := v_loop_iter + 1;
        v_masters_prev_count := cardinality(v_master_ids);
        v_phones_prev_count := cardinality(v_affected_phones);

        -- Step A: Expand Master Contact IDs from all current affected phones
        SELECT ARRAY(
            SELECT DISTINCT id
            FROM (
                SELECT UNNEST(v_master_ids) AS id
                UNION
                -- Master contacts matching any current affected phone
                SELECT mc.id
                FROM public.master_contacts mc
                WHERE public.normalize_phone(mc.phone) = ANY(v_affected_phones)
                UNION
                -- Master contacts linked via events to Rathayatra registrations matching any affected phone
                SELECT mce.master_contact_id
                FROM public.master_contact_events mce
                JOIN public.registrations r ON r.id::text = mce.event_record_id AND mce.source = 'rathayatra'
                WHERE public.normalize_phone(r.phone) = ANY(v_affected_phones)
                UNION
                -- Master contacts linked via events to Krishnashtami registrations matching any affected phone
                SELECT mce.master_contact_id
                FROM public.master_contact_events mce
                JOIN public.krishnashtami_registrations kr ON kr.id::text = mce.event_record_id AND mce.source = 'krishnashtami'
                WHERE public.normalize_phone(kr.phone) = ANY(v_affected_phones)
                UNION
                -- Master contacts linked via events to Feedback registrations matching any affected phone
                SELECT mce.master_contact_id
                FROM public.master_contact_events mce
                JOIN public.feedback_contacts fc ON fc.id::text = mce.event_record_id AND mce.source IN ('feedback_contacts', 'feedback')
                WHERE public.normalize_phone(fc.phone) = ANY(v_affected_phones)
            ) sub
            WHERE id IS NOT NULL
            ORDER BY id
        ) INTO v_master_ids;

        -- Step B: Expand affected phones from all current Master Contact IDs
        SELECT ARRAY(
            SELECT DISTINCT p
            FROM (
                SELECT UNNEST(v_affected_phones) AS p
                UNION
                -- Direct phone of all current master contacts
                SELECT public.normalize_phone(mc.phone) AS p
                FROM public.master_contacts mc
                WHERE mc.id = ANY(v_master_ids)
                UNION
                -- Phones of Rathayatra registrations linked to any current master contact
                SELECT public.normalize_phone(r.phone) AS p
                FROM public.master_contact_events mce
                JOIN public.registrations r ON r.id::text = mce.event_record_id AND mce.source = 'rathayatra'
                WHERE mce.master_contact_id = ANY(v_master_ids)
                UNION
                -- Phones of Krishnashtami registrations linked to any current master contact
                SELECT public.normalize_phone(kr.phone) AS p
                FROM public.master_contact_events mce
                JOIN public.krishnashtami_registrations kr ON kr.id::text = mce.event_record_id AND mce.source = 'krishnashtami'
                WHERE mce.master_contact_id = ANY(v_master_ids)
                UNION
                -- Phones of Feedback registrations linked to any current master contact
                SELECT public.normalize_phone(fc.phone) AS p
                FROM public.master_contact_events mce
                JOIN public.feedback_contacts fc ON fc.id::text = mce.event_record_id AND mce.source IN ('feedback_contacts', 'feedback')
                WHERE mce.master_contact_id = ANY(v_master_ids)
            ) sub
            WHERE p IS NOT NULL AND length(p) = 10 AND p <> '0000000000'
            ORDER BY p
        ) INTO v_affected_phones;

        -- Step C: Terminate when closure stabilizes
        IF cardinality(v_master_ids) = v_masters_prev_count AND cardinality(v_affected_phones) = v_phones_prev_count THEN
            EXIT;
        END IF;

        -- Safety threshold check: if safety limit reached without convergence, fail closed immediately
        -- Never proceed with a partial identity set.
        IF v_loop_iter >= 100 THEN
            RETURN jsonb_build_object(
                'success', false,
                'code',    'CONVERGENCE_ERROR',
                'message', 'Identity discovery did not reach convergence within safety limit. Operation aborted.'
            );
        END IF;
    END LOOP;

    -- Fail closed if no valid phone identity could be determined after transitive closure
    IF v_affected_phones IS NULL OR cardinality(v_affected_phones) = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'code',    'INVALID_PHONE',
            'message', 'Contact phone number is missing or invalid.'
        );
    END IF;

    -- 3. TIER 1: Acquire canonical phone advisory locks in deterministic ascending order
    FOREACH v_cur_phone IN ARRAY v_affected_phones LOOP
        PERFORM pg_advisory_xact_lock(hashtext('phone:' || v_cur_phone));
    END LOOP;

    -- 4. Ensure Master Contact existence for every affected phone identity:
    -- While holding Tier 1 phone advisory locks, if an affected phone lacks a Master Contact,
    -- create a persistent blocked Master Contact with is_not_interested = true.
    FOREACH v_cur_phone IN ARRAY v_affected_phones LOOP
        IF NOT EXISTS (
            SELECT 1 FROM public.master_contacts WHERE public.normalize_phone(phone) = v_cur_phone
        ) THEN
            v_source_name := NULL;
            v_source_gender := NULL;

            SELECT full_name, gender INTO v_source_name, v_source_gender
            FROM public.registrations
            WHERE public.normalize_phone(phone) = v_cur_phone
            ORDER BY created_at ASC NULLS LAST, id ASC
            LIMIT 1;

            IF v_source_name IS NULL THEN
                SELECT full_name, gender INTO v_source_name, v_source_gender
                FROM public.krishnashtami_registrations
                WHERE public.normalize_phone(phone) = v_cur_phone
                ORDER BY created_at ASC NULLS LAST, id ASC
                LIMIT 1;
            END IF;

            IF v_source_name IS NULL THEN
                SELECT full_name, gender INTO v_source_name, v_source_gender
                FROM public.feedback_contacts
                WHERE public.normalize_phone(phone) = v_cur_phone
                ORDER BY created_at ASC NULLS LAST, id ASC
                LIMIT 1;
            END IF;

            INSERT INTO public.master_contacts (
                phone, name, gender, is_not_interested, not_interested_at, not_interested_by, created_at, updated_at
            )
            VALUES (
                v_cur_phone,
                COALESCE(v_source_name, 'Contact'),
                v_source_gender,
                true,
                now(),
                p_operator_id,
                now(),
                now()
            )
            ON CONFLICT (phone) DO UPDATE
            SET is_not_interested = true,
                not_interested_at = now(),
                not_interested_by = p_operator_id,
                updated_at = now()
            RETURNING id INTO v_master_id;

            IF v_master_id IS NOT NULL AND NOT (v_master_id = ANY(v_master_ids)) THEN
                v_master_ids := array_append(v_master_ids, v_master_id);
            END IF;
        END IF;
    END LOOP;

    -- 5. Re-collect and sort ALL affected master contact IDs deterministically
    SELECT ARRAY(
        SELECT DISTINCT id
        FROM public.master_contacts
        WHERE id = ANY(v_master_ids)
           OR public.normalize_phone(phone) = ANY(v_affected_phones)
        ORDER BY id
    ) INTO v_master_ids;

    -- 6. TIER 2: Acquire Master Contact advisory locks in deterministic ascending order
    FOREACH v_cur_master_id IN ARRAY v_master_ids LOOP
        PERFORM pg_advisory_xact_lock(hashtext('contact:' || v_cur_master_id::TEXT));
    END LOOP;

    -- 7. TIER 3: Lock all affected master contact rows in deterministic ascending order FOR UPDATE
    PERFORM 1
    FROM public.master_contacts
    WHERE id = ANY(v_master_ids)
    ORDER BY id
    FOR UPDATE;

    -- 8. Persist permanent global exclusion on all affected master contacts
    -- Intentionally overwrites not_interested_at and not_interested_by to record the MOST RECENT
    -- marking action and responsible operator. The original marking timestamp is preserved in the
    -- deactivated assignment rows. not_interested_by tracks the latest responsible operator, not the first.
    UPDATE public.master_contacts
    SET is_not_interested = true,
        not_interested_at = now(),
        not_interested_by = p_operator_id,
        updated_at = now()
    WHERE id = ANY(v_master_ids);

    -- 9. Deactivate all active assignments across all 4 tables:
    -- Table 1: master_contact_assignments
    UPDATE public.master_contact_assignments
    SET is_active = false,
        status = 'Not Interested',
        updated_at = now()
    WHERE master_contact_id = ANY(v_master_ids)
      AND is_active = true;

    -- Table 2: contact_assignments (Rathayatra)
    UPDATE public.contact_assignments ca
    SET is_active = false, status = 'Not Interested', updated_at = now()
    WHERE ca.is_active = true
      AND (
          ca.registration_id IN (
              SELECT r.id FROM public.registrations r WHERE public.normalize_phone(r.phone) = ANY(v_affected_phones)
          )
          OR ca.registration_id IN (
              SELECT r.id
              FROM public.registrations r
              JOIN public.master_contact_events mce ON r.id::text = mce.event_record_id AND mce.source = 'rathayatra'
              WHERE mce.master_contact_id = ANY(v_master_ids)
          )
      );

    -- Table 3: krishnashtami_contact_assignments
    UPDATE public.krishnashtami_contact_assignments kca
    SET is_active = false, status = 'Not Interested', updated_at = now()
    WHERE kca.is_active = true
      AND (
          kca.registration_id IN (
              SELECT kr.id FROM public.krishnashtami_registrations kr WHERE public.normalize_phone(kr.phone) = ANY(v_affected_phones)
          )
          OR kca.registration_id IN (
              SELECT kr.id
              FROM public.krishnashtami_registrations kr
              JOIN public.master_contact_events mce ON kr.id::text = mce.event_record_id AND mce.source = 'krishnashtami'
              WHERE mce.master_contact_id = ANY(v_master_ids)
          )
      );

    -- Table 4: feedback_contact_assignments
    UPDATE public.feedback_contact_assignments fca
    SET is_active = false, status = 'Not Interested', updated_at = now()
    WHERE fca.is_active = true
      AND (
          fca.feedback_contact_id IN (
              SELECT fc.id FROM public.feedback_contacts fc WHERE public.normalize_phone(fc.phone) = ANY(v_affected_phones)
          )
          OR fca.feedback_contact_id IN (
              SELECT fc.id
              FROM public.feedback_contacts fc
              JOIN public.master_contact_events mce ON fc.id::text = mce.event_record_id AND mce.source IN ('feedback_contacts', 'feedback')
              WHERE mce.master_contact_id = ANY(v_master_ids)
          )
      );

    -- 10. Return success with affected master contact ids and phones
    RETURN jsonb_build_object(
        'success',            true,
        'code',               'MARKED_NOT_INTERESTED',
        'message',            'Contact successfully marked Not Interested and all active assignments deactivated.',
        'master_contact_id',  v_master_ids[1],
        'master_contact_ids', v_master_ids,
        'affected_phones',    v_affected_phones
    );
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'mark_contact_not_interested_atomic failure: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
        RETURN jsonb_build_object(
            'success', false,
            'code',    'INTERNAL_ERROR',
            'message', 'An internal error occurred while updating Not Interested status.'
        );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_contact_not_interested_atomic(UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_contact_not_interested_atomic(UUID, TEXT, UUID, TEXT) TO service_role;

-- 9. Secure schema privileges: prevent untrusted roles from creating objects in public schema
-- that could shadow functions or tables used by SECURITY DEFINER routines.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE CREATE ON SCHEMA public FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE CREATE ON SCHEMA public FROM authenticated';
    END IF;
END $$;

COMMIT;
