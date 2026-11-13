-- ============================================================================
-- HKM ADMIN PORTAL: FINAL READ-ONLY IMPACT ASSESSMENT & PREFLIGHT SUITE
-- Target Migration: 20261106000000_dynamic_capacity_and_not_interested.sql (1,388 lines)
-- File: docs/audits/20261107_not_interested_impact_assessment_final.sql
--
-- STRICT RESTRICTIONS:
-- 1. READ-ONLY SELECT QUERIES ONLY. Zero DDL/DML. No INSERT, UPDATE, DELETE,
--    DROP, ALTER, CREATE, TRUNCATE, or temporary tables.
-- 2. SCHEMA PRE-MIGRATION SAFE: Employs schema-safe JSON extraction
--    ((to_jsonb(mc.*)->>'is_not_interested')::boolean) to prevent 42703 errors
--    when executed against unmigrated production before columns exist.
-- 3. FULL NINE-BRANCH DISCOVERY: Exactly mirrors all 9 sources in Section 5.
-- ============================================================================


-- ============================================================================
-- PREFLIGHT CHECK 1: PUBLIC.MASTER_CONTACTS UNIQUE INDEX ON PHONE
-- Purpose: Verifies public.master_contacts has a valid, non-partial,
--          single-column unique index on phone required by Step C's
--          ON CONFLICT (phone) DO UPDATE clause.
-- Expected Result: Exactly 1 row confirming a valid unique index on phone.
-- ============================================================================
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


-- ============================================================================
-- PREFLIGHT CHECK 2: OPERATOR CONFIGURED CAPACITY RANGE (1 TO 500)
-- Purpose: Schema-safe check for existing contact_operators rows with capacity
--          outside 1-500 that would fail Section 1's chk_operator_capacity.
-- Expected Result: 0 rows returned.
-- ============================================================================
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


-- ============================================================================
-- PREFLIGHT CHECK 3: ASSIGNMENT STATUS CHECK CONSTRAINT PRE-VALIDATION
-- Purpose: Verifies whether any existing historical assignment records in
--          contact_assignments, krishnashtami_contact_assignments, or
--          feedback_contact_assignments have statuses outside the 18 allowed
--          values in Section 4's check constraints.
-- Expected Result: 0 rows returned.
-- ============================================================================
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


-- ============================================================================
-- QUERY 1: EXECUTIVE IMPACT ASSESSMENT DASHBOARD
-- Purpose: Returns a single-row executive summary of all affected record sets,
--          unambiguously distinguishing raw occurrences, unique phone identities,
--          unique Master Contact IDs, and assignment rows across the 4 systems.
-- ============================================================================
WITH raw_all_historical_ni AS (
    -- 1. registrations joined with contact_assignments
    SELECT 
        '1. registrations + contact_assignments' AS source_branch,
        'contact_assignments' AS source_table,
        ca.id::text AS assignment_id,
        r.id::text AS source_record_id,
        r.phone AS raw_phone,
        public.normalize_phone(r.phone) AS norm_phone,
        r.full_name AS contact_name,
        r.gender,
        ca.updated_at AS status_time
    FROM public.registrations r
    JOIN public.contact_assignments ca ON r.id = ca.registration_id
    WHERE LOWER(TRIM(COALESCE(ca.status, ''))) IN ('not interested', 'not_interested')

    UNION ALL

    -- 2. krishnashtami_registrations joined with krishnashtami_contact_assignments
    SELECT 
        '2. krishnashtami_registrations + assignments' AS source_branch,
        'krishnashtami_contact_assignments' AS source_table,
        kca.id::text AS assignment_id,
        kr.id::text AS source_record_id,
        kr.phone AS raw_phone,
        public.normalize_phone(kr.phone) AS norm_phone,
        kr.full_name AS contact_name,
        kr.gender,
        kca.updated_at AS status_time
    FROM public.krishnashtami_registrations kr
    JOIN public.krishnashtami_contact_assignments kca ON kr.id = kca.registration_id
    WHERE LOWER(TRIM(COALESCE(kca.status, ''))) IN ('not interested', 'not_interested')

    UNION ALL

    -- 3. feedback_contacts joined with feedback_contact_assignments
    SELECT 
        '3. feedback_contacts + assignments' AS source_branch,
        'feedback_contact_assignments' AS source_table,
        fca.id::text AS assignment_id,
        fc.id::text AS source_record_id,
        fc.phone AS raw_phone,
        public.normalize_phone(fc.phone) AS norm_phone,
        fc.full_name AS contact_name,
        fc.gender,
        fca.updated_at AS status_time
    FROM public.feedback_contacts fc
    JOIN public.feedback_contact_assignments fca ON fc.id = fca.feedback_contact_id
    WHERE LOWER(TRIM(COALESCE(fca.status, ''))) IN ('not interested', 'not_interested')

    UNION ALL

    -- 4. master_contact_assignments and associated master_contacts
    SELECT 
        '4. master_contacts + assignments' AS source_branch,
        'master_contact_assignments' AS source_table,
        mca.id::text AS assignment_id,
        mc.id::text AS source_record_id,
        mc.phone AS raw_phone,
        public.normalize_phone(mc.phone) AS norm_phone,
        mc.name AS contact_name,
        mc.gender,
        mca.updated_at AS status_time
    FROM public.master_contacts mc
    JOIN public.master_contact_assignments mca ON mc.id = mca.master_contact_id
    WHERE LOWER(TRIM(COALESCE(mca.status, ''))) IN ('not interested', 'not_interested')

    UNION ALL

    -- 5. Master Contacts linked through master_contact_events (rathayatra)
    SELECT 
        '5. master_contact_events (rathayatra)' AS source_branch,
        'master_contact_events_rathayatra' AS source_table,
        ca.id::text AS assignment_id,
        mc.id::text AS source_record_id,
        mc.phone AS raw_phone,
        public.normalize_phone(mc.phone) AS norm_phone,
        mc.name AS contact_name,
        mc.gender,
        ca.updated_at AS status_time
    FROM public.master_contact_events mce
    JOIN public.master_contacts mc ON mce.master_contact_id = mc.id
    JOIN public.contact_assignments ca ON mce.event_record_id = ca.registration_id::text AND mce.source = 'rathayatra'
    WHERE LOWER(TRIM(COALESCE(ca.status, ''))) IN ('not interested', 'not_interested')

    UNION ALL

    -- 6. Master Contacts linked through master_contact_events (krishnashtami)
    SELECT 
        '6. master_contact_events (krishnashtami)' AS source_branch,
        'master_contact_events_krishnashtami' AS source_table,
        kca.id::text AS assignment_id,
        mc.id::text AS source_record_id,
        mc.phone AS raw_phone,
        public.normalize_phone(mc.phone) AS norm_phone,
        mc.name AS contact_name,
        mc.gender,
        kca.updated_at AS status_time
    FROM public.master_contact_events mce
    JOIN public.master_contacts mc ON mce.master_contact_id = mc.id
    JOIN public.krishnashtami_contact_assignments kca ON mce.event_record_id = kca.registration_id::text AND mce.source = 'krishnashtami'
    WHERE LOWER(TRIM(COALESCE(kca.status, ''))) IN ('not interested', 'not_interested')

    UNION ALL

    -- 7. Master Contacts linked through master_contact_events (feedback)
    SELECT 
        '7. master_contact_events (feedback)' AS source_branch,
        'master_contact_events_feedback' AS source_table,
        fca.id::text AS assignment_id,
        mc.id::text AS source_record_id,
        mc.phone AS raw_phone,
        public.normalize_phone(mc.phone) AS norm_phone,
        mc.name AS contact_name,
        mc.gender,
        fca.updated_at AS status_time
    FROM public.master_contact_events mce
    JOIN public.master_contacts mc ON mce.master_contact_id = mc.id
    JOIN public.feedback_contact_assignments fca ON mce.event_record_id = fca.feedback_contact_id::text AND mce.source IN ('feedback_contacts', 'feedback')
    WHERE LOWER(TRIM(COALESCE(fca.status, ''))) IN ('not interested', 'not_interested')

    UNION ALL

    -- 8. audit_logs explicit Not Interested markings (direct master contact)
    SELECT 
        '8. audit_logs (direct master contact)' AS source_branch,
        'audit_logs_direct' AS source_table,
        al.id::text AS assignment_id,
        mc.id::text AS source_record_id,
        mc.phone AS raw_phone,
        public.normalize_phone(mc.phone) AS norm_phone,
        mc.name AS contact_name,
        mc.gender,
        al.created_at AS status_time
    FROM public.master_contacts mc
    JOIN public.audit_logs al ON mc.id::text = al.details->>'contact_id'
    WHERE (al.details->>'new_status' ILIKE 'not interested' OR al.action = 'CONTACT_MARKED_NOT_INTERESTED')
      AND al.details->>'contact_id' IS NOT NULL

    UNION ALL

    -- 9. audit_logs explicit Not Interested markings (event link)
    SELECT 
        '9. audit_logs (event link)' AS source_branch,
        'audit_logs_event_link' AS source_table,
        al.id::text AS assignment_id,
        mc.id::text AS source_record_id,
        mc.phone AS raw_phone,
        public.normalize_phone(mc.phone) AS norm_phone,
        mc.name AS contact_name,
        mc.gender,
        al.created_at AS status_time
    FROM public.master_contact_events mce
    JOIN public.master_contacts mc ON mce.master_contact_id = mc.id
    JOIN public.audit_logs al ON mce.event_record_id = al.details->>'contact_id'
    WHERE (al.details->>'new_status' ILIKE 'not interested' OR al.action = 'CONTACT_MARKED_NOT_INTERESTED')
      AND al.details->>'contact_id' IS NOT NULL
),
eligible_source_records AS (
    -- Replicates Section 5 inner query requirement: raw phone IS NOT NULL
    SELECT * FROM raw_all_historical_ni
    WHERE raw_phone IS NOT NULL
),
valid_discovered AS (
    -- Matches exact aggregation of Section 5 into _tmp_historical_ni_phones
    SELECT 
        norm_phone AS phone,
        COALESCE(NULLIF(TRIM((ARRAY_AGG(contact_name ORDER BY status_time DESC NULLS LAST))[1]), ''), 'Contact') AS name,
        (ARRAY_AGG(gender ORDER BY status_time DESC NULLS LAST))[1] AS gender,
        MAX(status_time) AS status_time
    FROM eligible_source_records
    WHERE norm_phone IS NOT NULL 
      AND length(norm_phone) = 10 
      AND norm_phone <> '0000000000'
    GROUP BY norm_phone
),
skipped_records AS (
    -- Captures every unqualified historical record from raw discovery
    SELECT 
        source_branch,
        source_table,
        assignment_id,
        source_record_id,
        raw_phone,
        norm_phone,
        CASE 
            WHEN raw_phone IS NULL THEN 'RAW_PHONE_NULL'
            WHEN norm_phone IS NULL THEN 'NORMALIZATION_RETURNED_NULL'
            WHEN norm_phone = '0000000000' THEN 'ALL_ZEROS_PHONE'
            WHEN length(norm_phone) <> 10 THEN 'INVALID_DIGIT_LENGTH_' || length(norm_phone)
            ELSE 'OTHER_UNQUALIFIED'
        END AS skip_reason
    FROM raw_all_historical_ni
    WHERE norm_phone IS NULL 
       OR length(norm_phone) <> 10 
       OR norm_phone = '0000000000'
),
step_a_master_ids AS (
    -- Step A: UPDATE master_contacts WHERE normalize_phone(phone) IN (SELECT phone FROM _tmp_historical_ni_phones)
    SELECT DISTINCT mc.id
    FROM public.master_contacts mc
    WHERE public.normalize_phone(mc.phone) IN (SELECT phone FROM valid_discovered)
      AND mc.id IS NOT NULL
),
step_b_master_ids AS (
    -- Step B: Direct relational links (excluding NULL IDs)
    SELECT DISTINCT master_contact_id AS id FROM public.master_contact_assignments
    WHERE LOWER(TRIM(COALESCE(status, ''))) IN ('not interested', 'not_interested')
      AND master_contact_id IS NOT NULL
    UNION
    SELECT DISTINCT mce.master_contact_id AS id
    FROM public.master_contact_events mce
    JOIN public.contact_assignments ca ON mce.event_record_id = ca.registration_id::text AND mce.source = 'rathayatra'
    WHERE LOWER(TRIM(COALESCE(ca.status, ''))) IN ('not interested', 'not_interested')
      AND mce.master_contact_id IS NOT NULL
    UNION
    SELECT DISTINCT mce.master_contact_id AS id
    FROM public.master_contact_events mce
    JOIN public.krishnashtami_contact_assignments kca ON mce.event_record_id = kca.registration_id::text AND mce.source = 'krishnashtami'
    WHERE LOWER(TRIM(COALESCE(kca.status, ''))) IN ('not interested', 'not_interested')
      AND mce.master_contact_id IS NOT NULL
    UNION
    SELECT DISTINCT mce.master_contact_id AS id
    FROM public.master_contact_events mce
    JOIN public.feedback_contact_assignments fca ON mce.event_record_id = fca.feedback_contact_id::text AND mce.source IN ('feedback_contacts', 'feedback')
    WHERE LOWER(TRIM(COALESCE(fca.status, ''))) IN ('not interested', 'not_interested')
      AND mce.master_contact_id IS NOT NULL
    UNION
    SELECT DISTINCT mc.id
    FROM public.master_contacts mc
    JOIN public.audit_logs al ON mc.id::text = al.details->>'contact_id'
    WHERE (al.details->>'new_status' ILIKE 'not interested' OR al.action = 'CONTACT_MARKED_NOT_INTERESTED')
      AND al.details->>'contact_id' IS NOT NULL
      AND mc.id IS NOT NULL
    UNION
    SELECT DISTINCT mce.master_contact_id AS id
    FROM public.master_contact_events mce
    JOIN public.audit_logs al ON mce.event_record_id = al.details->>'contact_id'
    WHERE (al.details->>'new_status' ILIKE 'not interested' OR al.action = 'CONTACT_MARKED_NOT_INTERESTED')
      AND al.details->>'contact_id' IS NOT NULL
      AND mce.master_contact_id IS NOT NULL
),
targeted_existing_master_ids AS (
    -- Combined distinct non-NULL Master Contact IDs targeted by Step A or Step B
    SELECT id FROM step_a_master_ids WHERE id IS NOT NULL
    UNION
    SELECT id FROM step_b_master_ids WHERE id IS NOT NULL
),
pre_existing_blocked_master_ids AS (
    -- Pre-existing blocked Master Contacts (evaluated safely via JSON extraction)
    SELECT mc.id
    FROM public.master_contacts mc
    WHERE (to_jsonb(mc.*)->>'is_not_interested')::boolean IS TRUE
      AND mc.id IS NOT NULL
),
missing_master_to_insert AS (
    -- Step C: Insert missing blocked Master Contacts
    SELECT t.phone, t.name, t.gender, t.status_time
    FROM valid_discovered t
    WHERE NOT EXISTS (
        SELECT 1 FROM public.master_contacts mc
        WHERE public.normalize_phone(mc.phone) = t.phone
           OR mc.phone = t.phone
    )
),
all_blocked_master_ids AS (
    SELECT id FROM targeted_existing_master_ids WHERE id IS NOT NULL
    UNION
    SELECT id FROM pre_existing_blocked_master_ids WHERE id IS NOT NULL
),
deactivated_master_assignments AS (
    -- Step D.1: master_contact_assignments
    SELECT mca.id
    FROM public.master_contact_assignments mca
    WHERE mca.is_active = true
      AND (
          mca.master_contact_id IN (SELECT id FROM all_blocked_master_ids)
          OR LOWER(TRIM(COALESCE(mca.status, ''))) IN ('not interested', 'not_interested')
      )
),
deactivated_contact_assignments AS (
    -- Step D.2: contact_assignments (rathayatra)
    SELECT ca.id
    FROM public.contact_assignments ca
    WHERE ca.is_active = true
      AND (
          LOWER(TRIM(COALESCE(ca.status, ''))) IN ('not interested', 'not_interested')
          OR ca.registration_id IN (
              SELECT r.id FROM public.registrations r 
              WHERE public.normalize_phone(r.phone) IN (SELECT phone FROM valid_discovered)
                 OR public.normalize_phone(r.phone) IN (SELECT public.normalize_phone(mc.phone) FROM public.master_contacts mc WHERE mc.id IN (SELECT id FROM all_blocked_master_ids))
          )
          OR ca.registration_id IN (
              SELECT r.id
              FROM public.registrations r
              JOIN public.master_contact_events mce ON r.id::text = mce.event_record_id AND mce.source = 'rathayatra'
              WHERE mce.master_contact_id IN (SELECT id FROM all_blocked_master_ids)
          )
      )
),
deactivated_krishnashtami_assignments AS (
    -- Step D.3: krishnashtami_contact_assignments
    SELECT kca.id
    FROM public.krishnashtami_contact_assignments kca
    WHERE kca.is_active = true
      AND (
          LOWER(TRIM(COALESCE(kca.status, ''))) IN ('not interested', 'not_interested')
          OR kca.registration_id IN (
              SELECT kr.id FROM public.krishnashtami_registrations kr 
              WHERE public.normalize_phone(kr.phone) IN (SELECT phone FROM valid_discovered)
                 OR public.normalize_phone(kr.phone) IN (SELECT public.normalize_phone(mc.phone) FROM public.master_contacts mc WHERE mc.id IN (SELECT id FROM all_blocked_master_ids))
          )
          OR kca.registration_id IN (
              SELECT kr.id
              FROM public.krishnashtami_registrations kr
              JOIN public.master_contact_events mce ON kr.id::text = mce.event_record_id AND mce.source = 'krishnashtami'
              WHERE mce.master_contact_id IN (SELECT id FROM all_blocked_master_ids)
          )
      )
),
deactivated_feedback_assignments AS (
    -- Step D.4: feedback_contact_assignments
    SELECT fca.id
    FROM public.feedback_contact_assignments fca
    WHERE fca.is_active = true
      AND (
          LOWER(TRIM(COALESCE(fca.status, ''))) IN ('not interested', 'not_interested')
          OR fca.feedback_contact_id IN (
              SELECT fc.id FROM public.feedback_contacts fc 
              WHERE public.normalize_phone(fc.phone) IN (SELECT phone FROM valid_discovered)
                 OR public.normalize_phone(fc.phone) IN (SELECT public.normalize_phone(mc.phone) FROM public.master_contacts mc WHERE mc.id IN (SELECT id FROM all_blocked_master_ids))
          )
          OR fca.feedback_contact_id IN (
              SELECT fc.id
              FROM public.feedback_contacts fc
              JOIN public.master_contact_events mce ON fc.id::text = mce.event_record_id AND mce.source IN ('feedback_contacts', 'feedback')
              WHERE mce.master_contact_id IN (SELECT id FROM all_blocked_master_ids)
          )
      )
),
duplicate_master_affected AS (
    SELECT public.normalize_phone(phone) AS norm_phone, count(*) AS row_cnt
    FROM public.master_contacts
    WHERE public.normalize_phone(phone) IN (SELECT phone FROM valid_discovered)
      AND public.normalize_phone(phone) IS NOT NULL 
      AND length(public.normalize_phone(phone)) = 10 
      AND public.normalize_phone(phone) <> '0000000000'
    GROUP BY public.normalize_phone(phone)
    HAVING count(*) > 1
),
duplicate_master_global AS (
    SELECT public.normalize_phone(phone) AS norm_phone, count(*) AS row_cnt
    FROM public.master_contacts
    WHERE public.normalize_phone(phone) IS NOT NULL 
      AND length(public.normalize_phone(phone)) = 10 
      AND public.normalize_phone(phone) <> '0000000000'
    GROUP BY public.normalize_phone(phone)
    HAVING count(*) > 1
),
cross_source_conflicts AS (
    SELECT norm_phone
    FROM raw_all_historical_ni
    WHERE norm_phone IS NOT NULL 
      AND length(norm_phone) = 10 
      AND norm_phone <> '0000000000'
    GROUP BY norm_phone
    HAVING count(DISTINCT COALESCE(NULLIF(TRIM(contact_name), ''), 'Contact')) > 1
        OR count(DISTINCT gender) > 1
        OR (bool_or(gender IS NULL) AND bool_or(gender IS NOT NULL))
),
timestamp_ties AS (
    SELECT v.norm_phone
    FROM eligible_source_records v
    JOIN (
        SELECT norm_phone, MAX(status_time) AS max_time 
        FROM eligible_source_records 
        WHERE norm_phone IS NOT NULL AND length(norm_phone) = 10 AND norm_phone <> '0000000000'
        GROUP BY norm_phone
    ) m ON v.norm_phone = m.norm_phone AND (v.status_time = m.max_time OR (v.status_time IS NULL AND m.max_time IS NULL))
    WHERE v.norm_phone IS NOT NULL AND length(v.norm_phone) = 10 AND v.norm_phone <> '0000000000'
    GROUP BY v.norm_phone
    HAVING count(*) > 1 
       AND (
           count(DISTINCT COALESCE(NULLIF(TRIM(v.contact_name), ''), 'Contact')) > 1
           OR count(DISTINCT v.gender) > 1
           OR (bool_or(v.gender IS NULL) AND bool_or(v.gender IS NOT NULL))
       )
)
SELECT
    (SELECT count(*) FROM raw_all_historical_ni) AS total_raw_discovery_occurrences,
    (SELECT count(*) FROM eligible_source_records) AS eligible_non_null_phone_occurrences,
    (SELECT count(*) FROM skipped_records) AS total_skipped_unqualified_occurrences,
    (SELECT count(*) FROM skipped_records WHERE skip_reason = 'RAW_PHONE_NULL') AS skipped_occurrences_null_phone,
    (SELECT count(*) FROM skipped_records WHERE skip_reason = 'NORMALIZATION_RETURNED_NULL') AS skipped_occurrences_normalization_null,
    (SELECT count(*) FROM skipped_records WHERE skip_reason = 'ALL_ZEROS_PHONE') AS skipped_occurrences_all_zeros,
    (SELECT count(*) FROM skipped_records WHERE skip_reason LIKE 'INVALID_DIGIT_LENGTH_%') AS skipped_occurrences_invalid_digit_length,
    (SELECT count(*) FROM valid_discovered) AS distinct_normalized_ni_phone_identities,
    (SELECT count(DISTINCT id) FROM step_a_master_ids WHERE id IS NOT NULL) AS unique_master_contact_ids_step_a_phone,
    (SELECT count(DISTINCT id) FROM step_b_master_ids WHERE id IS NOT NULL) AS unique_master_contact_ids_step_b_relational,
    (SELECT count(DISTINCT id) FROM targeted_existing_master_ids WHERE id IS NOT NULL) AS total_unique_existing_master_contact_ids_to_block,
    (
        SELECT count(*) FROM public.master_contacts mc
        WHERE mc.id IN (SELECT id FROM targeted_existing_master_ids WHERE id IS NOT NULL)
          AND to_jsonb(mc.*)->>'not_interested_at' IS NOT NULL
    ) AS existing_master_contacts_with_not_interested_at_set,
    (
        SELECT count(*) FROM public.master_contacts mc
        WHERE mc.id IN (SELECT id FROM targeted_existing_master_ids WHERE id IS NOT NULL)
          AND to_jsonb(mc.*)->>'not_interested_at' IS NULL
    ) AS existing_master_contacts_with_not_interested_at_null,
    (SELECT count(DISTINCT id) FROM pre_existing_blocked_master_ids WHERE id IS NOT NULL) AS pre_existing_blocked_master_contact_ids,
    (SELECT count(*) FROM missing_master_to_insert) AS new_master_contacts_to_insert_rows,
    (SELECT count(*) FROM deactivated_master_assignments) AS active_master_assignments_to_deactivate_rows,
    (SELECT count(*) FROM deactivated_contact_assignments) AS active_rathayatra_assignments_to_deactivate_rows,
    (SELECT count(*) FROM deactivated_krishnashtami_assignments) AS active_krishnashtami_assignments_to_deactivate_rows,
    (SELECT count(*) FROM deactivated_feedback_assignments) AS active_feedback_assignments_to_deactivate_rows,
    (
        (SELECT count(*) FROM deactivated_master_assignments) +
        (SELECT count(*) FROM deactivated_contact_assignments) +
        (SELECT count(*) FROM deactivated_krishnashtami_assignments) +
        (SELECT count(*) FROM deactivated_feedback_assignments)
    ) AS total_active_assignment_rows_to_deactivate,
    (SELECT count(*) FROM duplicate_master_affected) AS duplicate_master_phone_groups_affected,
    (SELECT COALESCE(sum(row_cnt), 0) FROM duplicate_master_affected) AS duplicate_master_rows_affected,
    (SELECT count(*) FROM duplicate_master_global) AS duplicate_master_phone_groups_global,
    (SELECT COALESCE(sum(row_cnt), 0) FROM duplicate_master_global) AS duplicate_master_rows_global,
    (SELECT count(*) FROM cross_source_conflicts) AS phones_with_cross_source_divergence,
    (SELECT count(*) FROM timestamp_ties) AS phones_with_latest_timestamp_ties;


-- ============================================================================
-- QUERY 2: SOURCE BRANCH OCCURRENCES BREAKDOWN
-- Purpose: Audits raw discovered volume, valid 10-digit phones, and malformed
--          records across all 9 discovery paths.
-- ============================================================================
WITH raw_all_historical_ni AS (
    SELECT '1. registrations + contact_assignments' AS source_branch, r.phone AS raw_phone, public.normalize_phone(r.phone) AS norm_phone
    FROM public.registrations r JOIN public.contact_assignments ca ON r.id = ca.registration_id
    WHERE LOWER(TRIM(COALESCE(ca.status, ''))) IN ('not interested', 'not_interested')
    UNION ALL
    SELECT '2. krishnashtami_registrations + assignments', kr.phone, public.normalize_phone(kr.phone)
    FROM public.krishnashtami_registrations kr JOIN public.krishnashtami_contact_assignments kca ON kr.id = kca.registration_id
    WHERE LOWER(TRIM(COALESCE(kca.status, ''))) IN ('not interested', 'not_interested')
    UNION ALL
    SELECT '3. feedback_contacts + assignments', fc.phone, public.normalize_phone(fc.phone)
    FROM public.feedback_contacts fc JOIN public.feedback_contact_assignments fca ON fc.id = fca.feedback_contact_id
    WHERE LOWER(TRIM(COALESCE(fca.status, ''))) IN ('not interested', 'not_interested')
    UNION ALL
    SELECT '4. master_contacts + assignments', mc.phone, public.normalize_phone(mc.phone)
    FROM public.master_contacts mc JOIN public.master_contact_assignments mca ON mc.id = mca.master_contact_id
    WHERE LOWER(TRIM(COALESCE(mca.status, ''))) IN ('not interested', 'not_interested')
    UNION ALL
    SELECT '5. master_contact_events (rathayatra)', mc.phone, public.normalize_phone(mc.phone)
    FROM public.master_contact_events mce JOIN public.master_contacts mc ON mce.master_contact_id = mc.id
    JOIN public.contact_assignments ca ON mce.event_record_id = ca.registration_id::text AND mce.source = 'rathayatra'
    WHERE LOWER(TRIM(COALESCE(ca.status, ''))) IN ('not interested', 'not_interested')
    UNION ALL
    SELECT '6. master_contact_events (krishnashtami)', mc.phone, public.normalize_phone(mc.phone)
    FROM public.master_contact_events mce JOIN public.master_contacts mc ON mce.master_contact_id = mc.id
    JOIN public.krishnashtami_contact_assignments kca ON mce.event_record_id = kca.registration_id::text AND mce.source = 'krishnashtami'
    WHERE LOWER(TRIM(COALESCE(kca.status, ''))) IN ('not interested', 'not_interested')
    UNION ALL
    SELECT '7. master_contact_events (feedback)', mc.phone, public.normalize_phone(mc.phone)
    FROM public.master_contact_events mce JOIN public.master_contacts mc ON mce.master_contact_id = mc.id
    JOIN public.feedback_contact_assignments fca ON mce.event_record_id = fca.feedback_contact_id::text AND mce.source IN ('feedback_contacts', 'feedback')
    WHERE LOWER(TRIM(COALESCE(fca.status, ''))) IN ('not interested', 'not_interested')
    UNION ALL
    SELECT '8. audit_logs (direct master contact)', mc.phone, public.normalize_phone(mc.phone)
    FROM public.master_contacts mc JOIN public.audit_logs al ON mc.id::text = al.details->>'contact_id'
    WHERE (al.details->>'new_status' ILIKE 'not interested' OR al.action = 'CONTACT_MARKED_NOT_INTERESTED')
      AND al.details->>'contact_id' IS NOT NULL
    UNION ALL
    SELECT '9. audit_logs (event link)', mc.phone, public.normalize_phone(mc.phone)
    FROM public.master_contact_events mce JOIN public.master_contacts mc ON mce.master_contact_id = mc.id
    JOIN public.audit_logs al ON mce.event_record_id = al.details->>'contact_id'
    WHERE (al.details->>'new_status' ILIKE 'not interested' OR al.action = 'CONTACT_MARKED_NOT_INTERESTED')
      AND al.details->>'contact_id' IS NOT NULL
)
SELECT 
    source_branch,
    count(*) AS total_raw_occurrences,
    count(*) FILTER (WHERE raw_phone IS NOT NULL) AS eligible_non_null_phone_occurrences,
    count(*) FILTER (WHERE raw_phone IS NULL) AS occurrences_with_null_raw_phone,
    count(DISTINCT norm_phone) FILTER (WHERE norm_phone IS NOT NULL AND length(norm_phone) = 10 AND norm_phone <> '0000000000') AS valid_10digit_phone_identities,
    count(*) FILTER (WHERE norm_phone IS NULL OR length(norm_phone) <> 10 OR norm_phone = '0000000000') AS invalid_or_unqualified_occurrences
FROM raw_all_historical_ni
GROUP BY source_branch
ORDER BY source_branch;


-- ============================================================================
-- QUERY 3: SKIPPED RECORD DIAGNOSTICS ACROSS ALL 9 DISCOVERY PATHS
-- Purpose: Identifies every unqualified historical Not Interested record that
--          will be excluded from _tmp_historical_ni_phones, including NULL phones.
-- ============================================================================
WITH raw_all_historical_ni AS (
    SELECT '1. registrations + contact_assignments' AS source_branch, 'contact_assignments' AS source_table, ca.id::text AS assignment_id, r.id::text AS source_record_id, r.full_name AS contact_name, r.phone AS raw_phone, public.normalize_phone(r.phone) AS norm_phone
    FROM public.registrations r JOIN public.contact_assignments ca ON r.id = ca.registration_id
    WHERE LOWER(TRIM(COALESCE(ca.status, ''))) IN ('not interested', 'not_interested')
    UNION ALL
    SELECT '2. krishnashtami_registrations + assignments', 'krishnashtami_contact_assignments', kca.id::text, kr.id::text, kr.full_name, kr.phone, public.normalize_phone(kr.phone)
    FROM public.krishnashtami_registrations kr JOIN public.krishnashtami_contact_assignments kca ON kr.id = kca.registration_id
    WHERE LOWER(TRIM(COALESCE(kca.status, ''))) IN ('not interested', 'not_interested')
    UNION ALL
    SELECT '3. feedback_contacts + assignments', 'feedback_contact_assignments', fca.id::text, fc.id::text, fc.full_name, fc.phone, public.normalize_phone(fc.phone)
    FROM public.feedback_contacts fc JOIN public.feedback_contact_assignments fca ON fc.id = fca.feedback_contact_id
    WHERE LOWER(TRIM(COALESCE(fca.status, ''))) IN ('not interested', 'not_interested')
    UNION ALL
    SELECT '4. master_contacts + assignments', 'master_contact_assignments', mca.id::text, mc.id::text, mc.name, mc.phone, public.normalize_phone(mc.phone)
    FROM public.master_contacts mc JOIN public.master_contact_assignments mca ON mc.id = mca.master_contact_id
    WHERE LOWER(TRIM(COALESCE(mca.status, ''))) IN ('not interested', 'not_interested')
    UNION ALL
    SELECT '5. master_contact_events (rathayatra)', 'master_contact_events_rathayatra', ca.id::text, mc.id::text, mc.name, mc.phone, public.normalize_phone(mc.phone)
    FROM public.master_contact_events mce JOIN public.master_contacts mc ON mce.master_contact_id = mc.id
    JOIN public.contact_assignments ca ON mce.event_record_id = ca.registration_id::text AND mce.source = 'rathayatra'
    WHERE LOWER(TRIM(COALESCE(ca.status, ''))) IN ('not interested', 'not_interested')
    UNION ALL
    SELECT '6. master_contact_events (krishnashtami)', 'master_contact_events_krishnashtami', kca.id::text, mc.id::text, mc.name, mc.phone, public.normalize_phone(mc.phone)
    FROM public.master_contact_events mce JOIN public.master_contacts mc ON mce.master_contact_id = mc.id
    JOIN public.krishnashtami_contact_assignments kca ON mce.event_record_id = kca.registration_id::text AND mce.source = 'krishnashtami'
    WHERE LOWER(TRIM(COALESCE(kca.status, ''))) IN ('not interested', 'not_interested')
    UNION ALL
    SELECT '7. master_contact_events (feedback)', 'master_contact_events_feedback', fca.id::text, mc.id::text, mc.name, mc.phone, public.normalize_phone(mc.phone)
    FROM public.master_contact_events mce JOIN public.master_contacts mc ON mce.master_contact_id = mc.id
    JOIN public.feedback_contact_assignments fca ON mce.event_record_id = fca.feedback_contact_id::text AND mce.source IN ('feedback_contacts', 'feedback')
    WHERE LOWER(TRIM(COALESCE(fca.status, ''))) IN ('not interested', 'not_interested')
    UNION ALL
    SELECT '8. audit_logs (direct master contact)', 'audit_logs_direct', al.id::text, mc.id::text, mc.name, mc.phone, public.normalize_phone(mc.phone)
    FROM public.master_contacts mc JOIN public.audit_logs al ON mc.id::text = al.details->>'contact_id'
    WHERE (al.details->>'new_status' ILIKE 'not interested' OR al.action = 'CONTACT_MARKED_NOT_INTERESTED') AND al.details->>'contact_id' IS NOT NULL
    UNION ALL
    SELECT '9. audit_logs (event link)', 'audit_logs_event_link', al.id::text, mc.id::text, mc.name, mc.phone, public.normalize_phone(mc.phone)
    FROM public.master_contact_events mce JOIN public.master_contacts mc ON mce.master_contact_id = mc.id
    JOIN public.audit_logs al ON mce.event_record_id = al.details->>'contact_id'
    WHERE (al.details->>'new_status' ILIKE 'not interested' OR al.action = 'CONTACT_MARKED_NOT_INTERESTED') AND al.details->>'contact_id' IS NOT NULL
)
SELECT 
    source_branch,
    source_table,
    assignment_id,
    source_record_id,
    contact_name,
    raw_phone,
    norm_phone,
    CASE 
        WHEN raw_phone IS NULL THEN 'RAW_PHONE_NULL'
        WHEN norm_phone IS NULL THEN 'NORMALIZATION_RETURNED_NULL'
        WHEN norm_phone = '0000000000' THEN 'ALL_ZEROS_PHONE'
        WHEN length(norm_phone) <> 10 THEN 'INVALID_DIGIT_LENGTH_' || length(norm_phone)
        ELSE 'OTHER_UNQUALIFIED'
    END AS skip_reason
FROM raw_all_historical_ni
WHERE norm_phone IS NULL 
   OR length(norm_phone) <> 10 
   OR norm_phone = '0000000000'
ORDER BY source_branch, source_table;


-- ============================================================================
-- QUERY 4: DETAILED PREVIEW OF NEW MASTER CONTACTS TO BE INSERTED (STEP C)
-- Purpose: Previews all fields to be populated in public.master_contacts for
--          orphaned historical Not Interested identities under Step C.
-- ============================================================================
WITH raw_all_historical_ni AS (
    SELECT r.phone AS raw_phone, public.normalize_phone(r.phone) AS norm_phone, r.full_name AS contact_name, r.gender, ca.updated_at AS status_time
    FROM public.registrations r JOIN public.contact_assignments ca ON r.id = ca.registration_id
    WHERE LOWER(TRIM(COALESCE(ca.status, ''))) IN ('not interested', 'not_interested') AND r.phone IS NOT NULL
    UNION ALL
    SELECT kr.phone, public.normalize_phone(kr.phone), kr.full_name, kr.gender, kca.updated_at
    FROM public.krishnashtami_registrations kr JOIN public.krishnashtami_contact_assignments kca ON kr.id = kca.registration_id
    WHERE LOWER(TRIM(COALESCE(kca.status, ''))) IN ('not interested', 'not_interested') AND kr.phone IS NOT NULL
    UNION ALL
    SELECT fc.phone, public.normalize_phone(fc.phone), fc.full_name, fc.gender, fca.updated_at
    FROM public.feedback_contacts fc JOIN public.feedback_contact_assignments fca ON fc.id = fca.feedback_contact_id
    WHERE LOWER(TRIM(COALESCE(fca.status, ''))) IN ('not interested', 'not_interested') AND fc.phone IS NOT NULL
    UNION ALL
    SELECT mc.phone, public.normalize_phone(mc.phone), mc.name, mc.gender, mca.updated_at
    FROM public.master_contacts mc JOIN public.master_contact_assignments mca ON mc.id = mca.master_contact_id
    WHERE LOWER(TRIM(COALESCE(mca.status, ''))) IN ('not interested', 'not_interested') AND mc.phone IS NOT NULL
    UNION ALL
    SELECT mc.phone, public.normalize_phone(mc.phone), mc.name, mc.gender, ca.updated_at
    FROM public.master_contact_events mce JOIN public.master_contacts mc ON mce.master_contact_id = mc.id
    JOIN public.contact_assignments ca ON mce.event_record_id = ca.registration_id::text AND mce.source = 'rathayatra'
    WHERE LOWER(TRIM(COALESCE(ca.status, ''))) IN ('not interested', 'not_interested') AND mc.phone IS NOT NULL
    UNION ALL
    SELECT mc.phone, public.normalize_phone(mc.phone), mc.name, mc.gender, kca.updated_at
    FROM public.master_contact_events mce JOIN public.master_contacts mc ON mce.master_contact_id = mc.id
    JOIN public.krishnashtami_contact_assignments kca ON mce.event_record_id = kca.registration_id::text AND mce.source = 'krishnashtami'
    WHERE LOWER(TRIM(COALESCE(kca.status, ''))) IN ('not interested', 'not_interested') AND mc.phone IS NOT NULL
    UNION ALL
    SELECT mc.phone, public.normalize_phone(mc.phone), mc.name, mc.gender, fca.updated_at
    FROM public.master_contact_events mce JOIN public.master_contacts mc ON mce.master_contact_id = mc.id
    JOIN public.feedback_contact_assignments fca ON mce.event_record_id = fca.feedback_contact_id::text AND mce.source IN ('feedback_contacts', 'feedback')
    WHERE LOWER(TRIM(COALESCE(fca.status, ''))) IN ('not interested', 'not_interested') AND mc.phone IS NOT NULL
    UNION ALL
    SELECT mc.phone, public.normalize_phone(mc.phone), mc.name, mc.gender, al.created_at
    FROM public.master_contacts mc JOIN public.audit_logs al ON mc.id::text = al.details->>'contact_id'
    WHERE (al.details->>'new_status' ILIKE 'not interested' OR al.action = 'CONTACT_MARKED_NOT_INTERESTED') AND al.details->>'contact_id' IS NOT NULL AND mc.phone IS NOT NULL
    UNION ALL
    SELECT mc.phone, public.normalize_phone(mc.phone), mc.name, mc.gender, al.created_at
    FROM public.master_contact_events mce JOIN public.master_contacts mc ON mce.master_contact_id = mc.id
    JOIN public.audit_logs al ON mce.event_record_id = al.details->>'contact_id'
    WHERE (al.details->>'new_status' ILIKE 'not interested' OR al.action = 'CONTACT_MARKED_NOT_INTERESTED') AND al.details->>'contact_id' IS NOT NULL AND mc.phone IS NOT NULL
),
valid_discovered AS (
    SELECT 
        norm_phone AS phone,
        COALESCE(NULLIF(TRIM((ARRAY_AGG(contact_name ORDER BY status_time DESC NULLS LAST))[1]), ''), 'Contact') AS name,
        (ARRAY_AGG(gender ORDER BY status_time DESC NULLS LAST))[1] AS gender,
        MAX(status_time) AS status_time
    FROM raw_all_historical_ni
    WHERE norm_phone IS NOT NULL AND length(norm_phone) = 10 AND norm_phone <> '0000000000'
    GROUP BY norm_phone
)
SELECT 
    v.phone AS inserted_phone,
    v.name AS inserted_name,
    v.gender AS inserted_gender,
    true AS inserted_is_not_interested,
    v.status_time AS inserted_not_interested_at_estimate,
    'now() (if status_time is NULL)' AS inserted_not_interested_at_fallback,
    NULL::uuid AS inserted_not_interested_by,
    'now()' AS inserted_created_at_runtime,
    'now()' AS inserted_updated_at_runtime
FROM valid_discovered v
WHERE NOT EXISTS (
    SELECT 1 FROM public.master_contacts mc
    WHERE public.normalize_phone(mc.phone) = v.phone 
       OR mc.phone = v.phone
)
ORDER BY v.status_time DESC NULLS LAST;


-- ============================================================================
-- QUERY 5A: CROSS-SOURCE DIVERGENCE & NULL-AWARE TIMESTAMP TIE DIAGNOSTICS
-- Purpose: Uncovers phone identities where historical source tables disagree
--          on canonical name or gender, and detects timestamp ties that cause
--          nondeterministic resolution in ARRAY_AGG(... ORDER BY status_time DESC).
-- ============================================================================
WITH raw_discovered AS (
    SELECT '1. registrations' AS source_branch, r.phone AS raw_phone, public.normalize_phone(r.phone) AS norm_phone, r.full_name AS contact_name, r.gender, ca.updated_at AS status_time
    FROM public.registrations r JOIN public.contact_assignments ca ON r.id = ca.registration_id
    WHERE LOWER(TRIM(COALESCE(ca.status, ''))) IN ('not interested', 'not_interested') AND r.phone IS NOT NULL
    UNION ALL
    SELECT '2. krishnashtami', kr.phone, public.normalize_phone(kr.phone), kr.full_name, kr.gender, kca.updated_at
    FROM public.krishnashtami_registrations kr JOIN public.krishnashtami_contact_assignments kca ON kr.id = kca.registration_id
    WHERE LOWER(TRIM(COALESCE(kca.status, ''))) IN ('not interested', 'not_interested') AND kr.phone IS NOT NULL
    UNION ALL
    SELECT '3. feedback', fc.phone, public.normalize_phone(fc.phone), fc.full_name, fc.gender, fca.updated_at
    FROM public.feedback_contacts fc JOIN public.feedback_contact_assignments fca ON fc.id = fca.feedback_contact_id
    WHERE LOWER(TRIM(COALESCE(fca.status, ''))) IN ('not interested', 'not_interested') AND fc.phone IS NOT NULL
    UNION ALL
    SELECT '4. master_contacts', mc.phone, public.normalize_phone(mc.phone), mc.name, mc.gender, mca.updated_at
    FROM public.master_contacts mc JOIN public.master_contact_assignments mca ON mc.id = mca.master_contact_id
    WHERE LOWER(TRIM(COALESCE(mca.status, ''))) IN ('not interested', 'not_interested') AND mc.phone IS NOT NULL
    UNION ALL
    SELECT '5. master_events_rathayatra', mc.phone, public.normalize_phone(mc.phone), mc.name, mc.gender, ca.updated_at
    FROM public.master_contact_events mce JOIN public.master_contacts mc ON mce.master_contact_id = mc.id
    JOIN public.contact_assignments ca ON mce.event_record_id = ca.registration_id::text AND mce.source = 'rathayatra'
    WHERE LOWER(TRIM(COALESCE(ca.status, ''))) IN ('not interested', 'not_interested') AND mc.phone IS NOT NULL
    UNION ALL
    SELECT '6. master_events_krishnashtami', mc.phone, public.normalize_phone(mc.phone), mc.name, mc.gender, kca.updated_at
    FROM public.master_contact_events mce JOIN public.master_contacts mc ON mce.master_contact_id = mc.id
    JOIN public.krishnashtami_contact_assignments kca ON mce.event_record_id = kca.registration_id::text AND mce.source = 'krishnashtami'
    WHERE LOWER(TRIM(COALESCE(kca.status, ''))) IN ('not interested', 'not_interested') AND mc.phone IS NOT NULL
    UNION ALL
    SELECT '7. master_events_feedback', mc.phone, public.normalize_phone(mc.phone), mc.name, mc.gender, fca.updated_at
    FROM public.master_contact_events mce JOIN public.master_contacts mc ON mce.master_contact_id = mc.id
    JOIN public.feedback_contact_assignments fca ON mce.event_record_id = fca.feedback_contact_id::text AND mce.source IN ('feedback_contacts', 'feedback')
    WHERE LOWER(TRIM(COALESCE(fca.status, ''))) IN ('not interested', 'not_interested') AND mc.phone IS NOT NULL
    UNION ALL
    SELECT '8. audit_logs_direct', mc.phone, public.normalize_phone(mc.phone), mc.name, mc.gender, al.created_at
    FROM public.master_contacts mc JOIN public.audit_logs al ON mc.id::text = al.details->>'contact_id'
    WHERE (al.details->>'new_status' ILIKE 'not interested' OR al.action = 'CONTACT_MARKED_NOT_INTERESTED') AND al.details->>'contact_id' IS NOT NULL AND mc.phone IS NOT NULL
    UNION ALL
    SELECT '9. audit_logs_event_link', mc.phone, public.normalize_phone(mc.phone), mc.name, mc.gender, al.created_at
    FROM public.master_contact_events mce JOIN public.master_contacts mc ON mce.master_contact_id = mc.id
    JOIN public.audit_logs al ON mce.event_record_id = al.details->>'contact_id'
    WHERE (al.details->>'new_status' ILIKE 'not interested' OR al.action = 'CONTACT_MARKED_NOT_INTERESTED') AND al.details->>'contact_id' IS NOT NULL AND mc.phone IS NOT NULL
),
valid_records AS (
    SELECT * FROM raw_discovered
    WHERE norm_phone IS NOT NULL AND length(norm_phone) = 10 AND norm_phone <> '0000000000'
),
timestamp_ties AS (
    -- Detects timestamp ties at the maximum status timestamp across multiple records,
    -- including NULL vs non-NULL name/gender divergence, without sentinel string collisions.
    SELECT 
        v.norm_phone,
        count(*) AS tied_records_count,
        array_agg(v.contact_name) AS tied_names,
        array_agg(v.gender) AS tied_genders
    FROM valid_records v
    JOIN (
        SELECT norm_phone, MAX(status_time) AS max_time 
        FROM valid_records 
        GROUP BY norm_phone
    ) m ON v.norm_phone = m.norm_phone AND (v.status_time = m.max_time OR (v.status_time IS NULL AND m.max_time IS NULL))
    GROUP BY v.norm_phone
    HAVING count(*) > 1 
       AND (
           count(DISTINCT COALESCE(NULLIF(TRIM(v.contact_name), ''), 'Contact')) > 1
           OR count(DISTINCT v.gender) > 1
           OR (bool_or(v.gender IS NULL) AND bool_or(v.gender IS NOT NULL))
       )
)
SELECT 
    v.norm_phone AS normalized_phone,
    count(*) AS total_source_records,
    array_agg(DISTINCT v.source_branch) AS source_branches,
    array_agg(DISTINCT v.contact_name) AS distinct_names,
    array_agg(DISTINCT v.gender) AS distinct_genders,
    COALESCE(NULLIF(TRIM((ARRAY_AGG(v.contact_name ORDER BY v.status_time DESC NULLS LAST))[1]), ''), 'Contact') AS migration_resolved_name,
    (ARRAY_AGG(v.gender ORDER BY v.status_time DESC NULLS LAST))[1] AS migration_resolved_gender,
    MAX(v.status_time) AS latest_status_time,
    (t.norm_phone IS NOT NULL) AS has_latest_timestamp_tie_nondeterminism,
    t.tied_names,
    t.tied_genders
FROM valid_records v
LEFT JOIN timestamp_ties t ON v.norm_phone = t.norm_phone
GROUP BY v.norm_phone, t.norm_phone, t.tied_names, t.tied_genders
HAVING count(DISTINCT COALESCE(NULLIF(TRIM(v.contact_name), ''), 'Contact')) > 1
    OR count(DISTINCT v.gender) > 1
    OR (bool_or(v.gender IS NULL) AND bool_or(v.gender IS NOT NULL))
ORDER BY has_latest_timestamp_tie_nondeterminism DESC, total_source_records DESC;


-- ============================================================================
-- QUERY 5B: VALID DUPLICATE MASTER CONTACTS (AFFECTED VS GLOBAL)
-- Purpose: Identifies valid 10-digit phone numbers associated with multiple
--          master_contacts rows, clearly distinguishing Not Interested affected
--          identities from unaffected global duplicates.
-- ============================================================================
WITH valid_discovered_phones AS (
    SELECT public.normalize_phone(phone) AS phone
    FROM (
        SELECT r.phone FROM public.registrations r JOIN public.contact_assignments ca ON r.id = ca.registration_id WHERE LOWER(TRIM(COALESCE(ca.status, ''))) IN ('not interested', 'not_interested') AND r.phone IS NOT NULL
        UNION ALL
        SELECT kr.phone FROM public.krishnashtami_registrations kr JOIN public.krishnashtami_contact_assignments kca ON kr.id = kca.registration_id WHERE LOWER(TRIM(COALESCE(kca.status, ''))) IN ('not interested', 'not_interested') AND kr.phone IS NOT NULL
        UNION ALL
        SELECT fc.phone FROM public.feedback_contacts fc JOIN public.feedback_contact_assignments fca ON fc.id = fca.feedback_contact_id WHERE LOWER(TRIM(COALESCE(fca.status, ''))) IN ('not interested', 'not_interested') AND fc.phone IS NOT NULL
        UNION ALL
        SELECT mc.phone FROM public.master_contacts mc JOIN public.master_contact_assignments mca ON mc.id = mca.master_contact_id WHERE LOWER(TRIM(COALESCE(mca.status, ''))) IN ('not interested', 'not_interested') AND mc.phone IS NOT NULL
        UNION ALL
        SELECT mc.phone FROM public.master_contact_events mce JOIN public.master_contacts mc ON mce.master_contact_id = mc.id JOIN public.contact_assignments ca ON mce.event_record_id = ca.registration_id::text AND mce.source = 'rathayatra' WHERE LOWER(TRIM(COALESCE(ca.status, ''))) IN ('not interested', 'not_interested') AND mc.phone IS NOT NULL
        UNION ALL
        SELECT mc.phone FROM public.master_contact_events mce JOIN public.master_contacts mc ON mce.master_contact_id = mc.id JOIN public.krishnashtami_contact_assignments kca ON mce.event_record_id = kca.registration_id::text AND mce.source = 'krishnashtami' WHERE LOWER(TRIM(COALESCE(kca.status, ''))) IN ('not interested', 'not_interested') AND mc.phone IS NOT NULL
        UNION ALL
        SELECT mc.phone FROM public.master_contact_events mce JOIN public.master_contacts mc ON mce.master_contact_id = mc.id JOIN public.feedback_contact_assignments fca ON mce.event_record_id = fca.feedback_contact_id::text AND mce.source IN ('feedback_contacts', 'feedback') WHERE LOWER(TRIM(COALESCE(fca.status, ''))) IN ('not interested', 'not_interested') AND mc.phone IS NOT NULL
        UNION ALL
        SELECT mc.phone FROM public.master_contacts mc JOIN public.audit_logs al ON mc.id::text = al.details->>'contact_id' WHERE (al.details->>'new_status' ILIKE 'not interested' OR al.action = 'CONTACT_MARKED_NOT_INTERESTED') AND al.details->>'contact_id' IS NOT NULL AND mc.phone IS NOT NULL
        UNION ALL
        SELECT mc.phone FROM public.master_contact_events mce JOIN public.master_contacts mc ON mce.master_contact_id = mc.id JOIN public.audit_logs al ON mce.event_record_id = al.details->>'contact_id' WHERE (al.details->>'new_status' ILIKE 'not interested' OR al.action = 'CONTACT_MARKED_NOT_INTERESTED') AND al.details->>'contact_id' IS NOT NULL AND mc.phone IS NOT NULL
    ) raw
    WHERE public.normalize_phone(phone) IS NOT NULL 
      AND length(public.normalize_phone(phone)) = 10 
      AND public.normalize_phone(phone) <> '0000000000'
),
valid_master_contacts AS (
    SELECT 
        id,
        public.normalize_phone(phone) AS norm_phone,
        name,
        gender,
        created_at
    FROM public.master_contacts
    WHERE public.normalize_phone(phone) IS NOT NULL 
      AND length(public.normalize_phone(phone)) = 10 
      AND public.normalize_phone(phone) <> '0000000000'
),
duplicate_groups AS (
    SELECT 
        norm_phone,
        count(*) AS duplicate_rows_count,
        array_agg(id ORDER BY created_at ASC) AS master_contact_ids,
        array_agg(name ORDER BY created_at ASC) AS names,
        array_agg(gender ORDER BY created_at ASC) AS genders,
        array_agg(created_at ORDER BY created_at ASC) AS created_timestamps
    FROM valid_master_contacts
    GROUP BY norm_phone
    HAVING count(*) > 1
)
SELECT 
    d.norm_phone AS normalized_phone,
    d.duplicate_rows_count,
    (d.norm_phone IN (SELECT phone FROM valid_discovered_phones)) AS is_affected_by_migration,
    d.master_contact_ids,
    d.names,
    d.genders,
    d.created_timestamps
FROM duplicate_groups d
ORDER BY is_affected_by_migration DESC, d.duplicate_rows_count DESC;


-- ============================================================================
-- QUERY 6: DETAILED ACTIVE ASSIGNMENT DEACTIVATION PREVIEW
-- Purpose: Previews every active assignment row (is_active = true) targeted
--          for deactivation across all 4 operational tables under Step D.
-- Note: Uses LEFT JOINs to descriptive contact tables so that orphaned or
--       unlinked assignment rows are NEVER omitted from the deactivation preview.
-- ============================================================================
WITH raw_all_historical_ni AS (
    SELECT r.phone AS raw_phone, public.normalize_phone(r.phone) AS norm_phone, ca.updated_at AS status_time
    FROM public.registrations r JOIN public.contact_assignments ca ON r.id = ca.registration_id
    WHERE LOWER(TRIM(COALESCE(ca.status, ''))) IN ('not interested', 'not_interested') AND r.phone IS NOT NULL
    UNION ALL
    SELECT kr.phone, public.normalize_phone(kr.phone), kca.updated_at
    FROM public.krishnashtami_registrations kr JOIN public.krishnashtami_contact_assignments kca ON kr.id = kca.registration_id
    WHERE LOWER(TRIM(COALESCE(kca.status, ''))) IN ('not interested', 'not_interested') AND kr.phone IS NOT NULL
    UNION ALL
    SELECT fc.phone, public.normalize_phone(fc.phone), fca.updated_at
    FROM public.feedback_contacts fc JOIN public.feedback_contact_assignments fca ON fc.id = fca.feedback_contact_id
    WHERE LOWER(TRIM(COALESCE(fca.status, ''))) IN ('not interested', 'not_interested') AND fc.phone IS NOT NULL
    UNION ALL
    SELECT mc.phone, public.normalize_phone(mc.phone), mca.updated_at
    FROM public.master_contacts mc JOIN public.master_contact_assignments mca ON mc.id = mca.master_contact_id
    WHERE LOWER(TRIM(COALESCE(mca.status, ''))) IN ('not interested', 'not_interested') AND mc.phone IS NOT NULL
    UNION ALL
    SELECT mc.phone, public.normalize_phone(mc.phone), ca.updated_at
    FROM public.master_contact_events mce JOIN public.master_contacts mc ON mce.master_contact_id = mc.id
    JOIN public.contact_assignments ca ON mce.event_record_id = ca.registration_id::text AND mce.source = 'rathayatra'
    WHERE LOWER(TRIM(COALESCE(ca.status, ''))) IN ('not interested', 'not_interested') AND mc.phone IS NOT NULL
    UNION ALL
    SELECT mc.phone, public.normalize_phone(mc.phone), kca.updated_at
    FROM public.master_contact_events mce JOIN public.master_contacts mc ON mce.master_contact_id = mc.id
    JOIN public.krishnashtami_contact_assignments kca ON mce.event_record_id = kca.registration_id::text AND mce.source = 'krishnashtami'
    WHERE LOWER(TRIM(COALESCE(kca.status, ''))) IN ('not interested', 'not_interested') AND mc.phone IS NOT NULL
    UNION ALL
    SELECT mc.phone, public.normalize_phone(mc.phone), fca.updated_at
    FROM public.master_contact_events mce JOIN public.master_contacts mc ON mce.master_contact_id = mc.id
    JOIN public.feedback_contact_assignments fca ON mce.event_record_id = fca.feedback_contact_id::text AND mce.source IN ('feedback_contacts', 'feedback')
    WHERE LOWER(TRIM(COALESCE(fca.status, ''))) IN ('not interested', 'not_interested') AND mc.phone IS NOT NULL
    UNION ALL
    SELECT mc.phone, public.normalize_phone(mc.phone), al.created_at
    FROM public.master_contacts mc JOIN public.audit_logs al ON mc.id::text = al.details->>'contact_id'
    WHERE (al.details->>'new_status' ILIKE 'not interested' OR al.action = 'CONTACT_MARKED_NOT_INTERESTED') AND al.details->>'contact_id' IS NOT NULL AND mc.phone IS NOT NULL
    UNION ALL
    SELECT mc.phone, public.normalize_phone(mc.phone), al.created_at
    FROM public.master_contact_events mce JOIN public.master_contacts mc ON mce.master_contact_id = mc.id
    JOIN public.audit_logs al ON mce.event_record_id = al.details->>'contact_id'
    WHERE (al.details->>'new_status' ILIKE 'not interested' OR al.action = 'CONTACT_MARKED_NOT_INTERESTED') AND al.details->>'contact_id' IS NOT NULL AND mc.phone IS NOT NULL
),
valid_discovered AS (
    SELECT norm_phone AS phone
    FROM raw_all_historical_ni
    WHERE norm_phone IS NOT NULL AND length(norm_phone) = 10 AND norm_phone <> '0000000000'
    GROUP BY norm_phone
),
step_a_master_ids AS (
    SELECT DISTINCT mc.id FROM public.master_contacts mc
    WHERE public.normalize_phone(mc.phone) IN (SELECT phone FROM valid_discovered)
      AND mc.id IS NOT NULL
),
step_b_master_ids AS (
    SELECT DISTINCT master_contact_id AS id FROM public.master_contact_assignments
    WHERE LOWER(TRIM(COALESCE(status, ''))) IN ('not interested', 'not_interested')
      AND master_contact_id IS NOT NULL
    UNION
    SELECT DISTINCT mce.master_contact_id AS id FROM public.master_contact_events mce
    JOIN public.contact_assignments ca ON mce.event_record_id = ca.registration_id::text AND mce.source = 'rathayatra'
    WHERE LOWER(TRIM(COALESCE(ca.status, ''))) IN ('not interested', 'not_interested')
      AND mce.master_contact_id IS NOT NULL
    UNION
    SELECT DISTINCT mce.master_contact_id AS id FROM public.master_contact_events mce
    JOIN public.krishnashtami_contact_assignments kca ON mce.event_record_id = kca.registration_id::text AND mce.source = 'krishnashtami'
    WHERE LOWER(TRIM(COALESCE(kca.status, ''))) IN ('not interested', 'not_interested')
      AND mce.master_contact_id IS NOT NULL
    UNION
    SELECT DISTINCT mce.master_contact_id AS id FROM public.master_contact_events mce
    JOIN public.feedback_contact_assignments fca ON mce.event_record_id = fca.feedback_contact_id::text AND mce.source IN ('feedback_contacts', 'feedback')
    WHERE LOWER(TRIM(COALESCE(fca.status, ''))) IN ('not interested', 'not_interested')
      AND mce.master_contact_id IS NOT NULL
    UNION
    SELECT DISTINCT mc.id FROM public.master_contacts mc
    JOIN public.audit_logs al ON mc.id::text = al.details->>'contact_id'
    WHERE (al.details->>'new_status' ILIKE 'not interested' OR al.action = 'CONTACT_MARKED_NOT_INTERESTED') AND al.details->>'contact_id' IS NOT NULL AND mc.id IS NOT NULL
    UNION
    SELECT DISTINCT mce.master_contact_id FROM public.master_contact_events mce
    JOIN public.audit_logs al ON mce.event_record_id = al.details->>'contact_id'
    WHERE (al.details->>'new_status' ILIKE 'not interested' OR al.action = 'CONTACT_MARKED_NOT_INTERESTED') AND al.details->>'contact_id' IS NOT NULL AND mce.master_contact_id IS NOT NULL
),
all_blocked_master_ids AS (
    SELECT id FROM step_a_master_ids WHERE id IS NOT NULL
    UNION
    SELECT id FROM step_b_master_ids WHERE id IS NOT NULL
    UNION
    SELECT mc.id FROM public.master_contacts mc WHERE (to_jsonb(mc.*)->>'is_not_interested')::boolean IS TRUE AND mc.id IS NOT NULL
)
SELECT 
    'master_contact_assignments' AS assignment_table,
    mca.id AS assignment_id,
    mca.master_contact_id::text AS contact_id,
    mc.name AS contact_name,
    mc.phone AS contact_phone,
    co.name AS operator_name,
    co.email AS operator_email,
    mca.status AS current_status,
    mca.assigned_at,
    'Not Interested' AS new_status,
    false AS new_is_active,
    'now()' AS new_updated_at_runtime,
    'Direct Master Link or Status' AS deactivation_reason
FROM public.master_contact_assignments mca
LEFT JOIN public.master_contacts mc ON mca.master_contact_id = mc.id
LEFT JOIN public.contact_operators co ON mca.operator_id = co.id
WHERE mca.is_active = true
  AND (
      mca.master_contact_id IN (SELECT id FROM all_blocked_master_ids)
      OR LOWER(TRIM(COALESCE(mca.status, ''))) IN ('not interested', 'not_interested')
  )

UNION ALL

SELECT 
    'contact_assignments (rathayatra)' AS assignment_table,
    ca.id AS assignment_id,
    ca.registration_id::text AS contact_id,
    r.full_name AS contact_name,
    r.phone AS contact_phone,
    co.name AS operator_name,
    co.email AS operator_email,
    ca.status AS current_status,
    ca.assigned_at,
    'Not Interested' AS new_status,
    false AS new_is_active,
    'now()' AS new_updated_at_runtime,
    CASE 
        WHEN LOWER(TRIM(COALESCE(ca.status, ''))) IN ('not interested', 'not_interested') THEN 'Assignment Status Not Interested'
        WHEN public.normalize_phone(r.phone) IN (SELECT phone FROM valid_discovered) THEN 'Phone In Historical Discovered Set'
        ELSE 'Linked Master Contact Blocked'
    END AS deactivation_reason
FROM public.contact_assignments ca
LEFT JOIN public.registrations r ON ca.registration_id = r.id
LEFT JOIN public.contact_operators co ON ca.operator_id = co.id
WHERE ca.is_active = true
  AND (
      LOWER(TRIM(COALESCE(ca.status, ''))) IN ('not interested', 'not_interested')
      OR ca.registration_id IN (
          SELECT reg.id FROM public.registrations reg 
          WHERE public.normalize_phone(reg.phone) IN (SELECT phone FROM valid_discovered)
             OR public.normalize_phone(reg.phone) IN (SELECT public.normalize_phone(mc.phone) FROM public.master_contacts mc WHERE mc.id IN (SELECT id FROM all_blocked_master_ids))
      )
      OR ca.registration_id IN (
          SELECT reg.id
          FROM public.registrations reg
          JOIN public.master_contact_events mce ON reg.id::text = mce.event_record_id AND mce.source = 'rathayatra'
          WHERE mce.master_contact_id IN (SELECT id FROM all_blocked_master_ids)
      )
  )

UNION ALL

SELECT 
    'krishnashtami_contact_assignments' AS assignment_table,
    kca.id AS assignment_id,
    kca.registration_id::text AS contact_id,
    kr.full_name AS contact_name,
    kr.phone AS contact_phone,
    co.name AS operator_name,
    co.email AS operator_email,
    kca.status AS current_status,
    kca.assigned_at,
    'Not Interested' AS new_status,
    false AS new_is_active,
    'now()' AS new_updated_at_runtime,
    CASE 
        WHEN LOWER(TRIM(COALESCE(kca.status, ''))) IN ('not interested', 'not_interested') THEN 'Assignment Status Not Interested'
        WHEN public.normalize_phone(kr.phone) IN (SELECT phone FROM valid_discovered) THEN 'Phone In Historical Discovered Set'
        ELSE 'Linked Master Contact Blocked'
    END AS deactivation_reason
FROM public.krishnashtami_contact_assignments kca
LEFT JOIN public.krishnashtami_registrations kr ON kca.registration_id = kr.id
LEFT JOIN public.contact_operators co ON kca.operator_id = co.id
WHERE kca.is_active = true
  AND (
      LOWER(TRIM(COALESCE(kca.status, ''))) IN ('not interested', 'not_interested')
      OR kca.registration_id IN (
          SELECT reg.id FROM public.krishnashtami_registrations reg 
          WHERE public.normalize_phone(reg.phone) IN (SELECT phone FROM valid_discovered)
             OR public.normalize_phone(reg.phone) IN (SELECT public.normalize_phone(mc.phone) FROM public.master_contacts mc WHERE mc.id IN (SELECT id FROM all_blocked_master_ids))
      )
      OR kca.registration_id IN (
          SELECT reg.id
          FROM public.krishnashtami_registrations reg
          JOIN public.master_contact_events mce ON reg.id::text = mce.event_record_id AND mce.source = 'krishnashtami'
          WHERE mce.master_contact_id IN (SELECT id FROM all_blocked_master_ids)
      )
  )

UNION ALL

SELECT 
    'feedback_contact_assignments' AS assignment_table,
    fca.id AS assignment_id,
    fca.feedback_contact_id::text AS contact_id,
    fc.full_name AS contact_name,
    fc.phone AS contact_phone,
    co.name AS operator_name,
    co.email AS operator_email,
    fca.status AS current_status,
    fca.assigned_at,
    'Not Interested' AS new_status,
    false AS new_is_active,
    'now()' AS new_updated_at_runtime,
    CASE 
        WHEN LOWER(TRIM(COALESCE(fca.status, ''))) IN ('not interested', 'not_interested') THEN 'Assignment Status Not Interested'
        WHEN public.normalize_phone(fc.phone) IN (SELECT phone FROM valid_discovered) THEN 'Phone In Historical Discovered Set'
        ELSE 'Linked Master Contact Blocked'
    END AS deactivation_reason
FROM public.feedback_contact_assignments fca
LEFT JOIN public.feedback_contacts fc ON fca.feedback_contact_id = fc.id
LEFT JOIN public.contact_operators co ON fca.operator_id = co.id
WHERE fca.is_active = true
  AND (
      LOWER(TRIM(COALESCE(fca.status, ''))) IN ('not interested', 'not_interested')
      OR fca.feedback_contact_id IN (
          SELECT f.id FROM public.feedback_contacts f 
          WHERE public.normalize_phone(f.phone) IN (SELECT phone FROM valid_discovered)
             OR public.normalize_phone(f.phone) IN (SELECT public.normalize_phone(mc.phone) FROM public.master_contacts mc WHERE mc.id IN (SELECT id FROM all_blocked_master_ids))
      )
      OR fca.feedback_contact_id IN (
          SELECT f.id
          FROM public.feedback_contacts f
          JOIN public.master_contact_events mce ON f.id::text = mce.event_record_id AND mce.source IN ('feedback_contacts', 'feedback')
          WHERE mce.master_contact_id IN (SELECT id FROM all_blocked_master_ids)
      )
  );


-- ============================================================================
-- QUERY 7: INACTIVE ASSIGNMENTS AUDIT (VERIFICATION OF ZERO-MUTATION SCOPE)
-- Purpose: Confirms the exact volume of inactive assignment rows (is_active = false)
--          that are intentionally PRESERVED and UNMODIFIED by Section 5,
--          reconciling across Not Interested, NULL status, and other statuses.
-- Reconciliation: total_inactive_rows = inactive_rows_already_not_interested +
--                 inactive_rows_null_status + inactive_rows_other_non_null_statuses_preserved
-- ============================================================================
SELECT 
    'master_contact_assignments' AS table_name,
    count(*) AS total_inactive_rows,
    count(*) FILTER (WHERE LOWER(TRIM(COALESCE(status, ''))) IN ('not interested', 'not_interested')) AS inactive_rows_already_not_interested,
    count(*) FILTER (WHERE status IS NULL) AS inactive_rows_null_status,
    count(*) FILTER (WHERE status IS NOT NULL AND LOWER(TRIM(status)) NOT IN ('not interested', 'not_interested')) AS inactive_rows_other_non_null_statuses_preserved
FROM public.master_contact_assignments WHERE is_active = false
UNION ALL
SELECT 
    'contact_assignments (rathayatra)',
    count(*),
    count(*) FILTER (WHERE LOWER(TRIM(COALESCE(status, ''))) IN ('not interested', 'not_interested')),
    count(*) FILTER (WHERE status IS NULL),
    count(*) FILTER (WHERE status IS NOT NULL AND LOWER(TRIM(status)) NOT IN ('not interested', 'not_interested'))
FROM public.contact_assignments WHERE is_active = false
UNION ALL
SELECT 
    'krishnashtami_contact_assignments',
    count(*),
    count(*) FILTER (WHERE LOWER(TRIM(COALESCE(status, ''))) IN ('not interested', 'not_interested')),
    count(*) FILTER (WHERE status IS NULL),
    count(*) FILTER (WHERE status IS NOT NULL AND LOWER(TRIM(status)) NOT IN ('not interested', 'not_interested'))
FROM public.krishnashtami_contact_assignments WHERE is_active = false
UNION ALL
SELECT 
    'feedback_contact_assignments',
    count(*),
    count(*) FILTER (WHERE LOWER(TRIM(COALESCE(status, ''))) IN ('not interested', 'not_interested')),
    count(*) FILTER (WHERE status IS NULL),
    count(*) FILTER (WHERE status IS NOT NULL AND LOWER(TRIM(status)) NOT IN ('not interested', 'not_interested'))
FROM public.feedback_contact_assignments WHERE is_active = false;
