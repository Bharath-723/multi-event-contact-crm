-- ============================================================================
-- HKM Admin Portal — Read-Only Assignment Integrity & Security Audit Queries
-- SAFE FOR EXECUTION: ZERO WRITES, ZERO DROPS, 100% READ-ONLY
-- ============================================================================

-- 1. Contacts with more than one active Master Dashboard assignment (Invariant 1)
-- Expected: 0 rows returned
SELECT 
    mca.master_contact_id,
    mc.name AS contact_name,
    mc.phone,
    count(*) AS active_count,
    array_agg(mca.operator_id) AS operator_ids,
    array_agg(co.name) AS operator_names
FROM public.master_contact_assignments mca
JOIN public.master_contacts mc ON mc.id = mca.master_contact_id
JOIN public.contact_operators co ON co.id = mca.operator_id
WHERE mca.is_active = true
GROUP BY mca.master_contact_id, mc.name, mc.phone
HAVING count(*) > 1;

-- 2. Operators with more than 40 active Master Dashboard assignments (Invariant 2)
-- Expected: 0 rows returned
SELECT 
    mca.operator_id,
    co.name AS operator_name,
    co.email AS operator_email,
    count(*) AS active_assignment_count
FROM public.master_contact_assignments mca
JOIN public.contact_operators co ON co.id = mca.operator_id
WHERE mca.is_active = true
GROUP BY mca.operator_id, co.name, co.email
HAVING count(*) > 40
ORDER BY active_assignment_count DESC;

-- 3. Active assignments belonging to female or unknown/missing gender contacts
-- Expected: 0 rows returned
SELECT 
    mca.id AS assignment_id,
    mca.master_contact_id,
    mc.name AS contact_name,
    mc.phone,
    mc.gender AS contact_gender,
    mca.operator_id,
    co.name AS operator_name,
    mca.assigned_at
FROM public.master_contact_assignments mca
JOIN public.master_contacts mc ON mc.id = mca.master_contact_id
JOIN public.contact_operators co ON co.id = mca.operator_id
WHERE mca.is_active = true
  AND (
      mc.gender IS NULL 
      OR LOWER(TRIM(mc.gender)) NOT IN ('male', 'm')
  );

-- 4. Operators workload summary: at or near capacity (>= 35 active assignments)
SELECT 
    co.id,
    co.name AS operator_name,
    co.email AS operator_email,
    co.is_active,
    count(mca.id) AS active_assignments,
    40 - count(mca.id) AS remaining_capacity,
    CASE 
        WHEN count(mca.id) >= 40 THEN 'FULL (40/40)'
        WHEN count(mca.id) >= 35 THEN 'NEAR CAPACITY (35-39)'
        ELSE 'AVAILABLE'
    END AS capacity_status
FROM public.contact_operators co
LEFT JOIN public.master_contact_assignments mca 
    ON mca.operator_id = co.id AND mca.is_active = true
WHERE co.is_active = true
GROUP BY co.id, co.name, co.email, co.is_active
ORDER BY active_assignments DESC;

-- 5. Existing Partial Unique Indexes protecting active assignment integrity
SELECT 
    schemaname,
    tablename,
    indexname, 
    indexdef 
FROM pg_indexes 
WHERE tablename IN (
    'master_contact_assignments', 
    'contact_assignments', 
    'krishnashtami_contact_assignments', 
    'feedback_contact_assignments'
)
AND indexdef ILIKE '%UNIQUE%'
ORDER BY tablename, indexname;

-- 6. Assignment RPC signatures and execute permissions
SELECT 
    p.proname AS rpc_name,
    pg_get_function_arguments(p.oid) AS signature,
    b.grantee,
    b.privilege_type
FROM pg_proc p
JOIN information_schema.routine_privileges b ON b.routine_name = p.proname
WHERE p.proname IN ('assign_master_contact_atomic', 'assign_contact_atomic')
ORDER BY p.proname, b.grantee;
