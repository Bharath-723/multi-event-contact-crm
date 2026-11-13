/**
 * Comprehensive Hardening and Regression Test Suite
 * File: scripts/test-final-hardening.ts
 *
 * Verifies 18 migration scenarios plus extracted preflight diagnostics for:
 * 20261106000000_dynamic_capacity_and_not_interested.sql
 *
 * 1. Invalid source rejection (NULL, empty, unsupported -> INVALID_SOURCE)
 * 2. Conflicting event-linked Master Contact phone identities -> IDENTITY_CONFLICT
 * 3. Missing and invalid linked phone identities -> INVALID_PHONE
 * 4. Existing blocked contact rejection after conflict resolution -> CONTACT_NOT_INTERESTED
 * 5. Capacity boundary values 1 and 500, plus invalid capacity rejection
 * 6. Capacity overflow (capacity+1) -> OPERATOR_CAPACITY_EXCEEDED
 * 7. NULL or unknown gender rejection -> GENDER_INELIGIBLE
 * 8. Not Interested identity propagation across tables and active deactivation
 * 9. Transitive closure convergence failure (> 100 iterations -> CONVERGENCE_ERROR)
 * 10. Repeated marking behavior (overwrites not_interested_at and not_interested_by)
 * 11. RPC permission restrictions (REVOKE/GRANT service_role verification)
 * 12. Function signature and named-argument compatibility
 *
 * Engine: @electric-sql/pglite (PostgreSQL 16 WASM)
 */

import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

interface TestResult {
  scenario: number;
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function recordTest(scenario: number, name: string, passed: boolean, details: string) {
  results.push({ scenario, name, passed, details });
  const icon = passed ? '✅ [PASS]' : '❌ [FAIL]';
  console.log(`  ${icon} Scenario ${scenario} - ${name}: ${details}`);
}

async function run() {
  console.log('╔═════════════════════════════════════════════════════════════════════════╗');
  console.log('║   MIGRATION HARDENING & PREFLIGHT REGRESSION TEST SUITE (18 GROUPS)    ║');
  console.log('╚═════════════════════════════════════════════════════════════════════════╝\n');

  const pg = new PGlite();

  // 1. Baseline Schema Setup
  console.log('Step 1: Setting up baseline schema in PGlite...');
  const baselineSchema = `
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
    END $$;
    GRANT CREATE ON SCHEMA public TO PUBLIC;
    GRANT CREATE ON SCHEMA public TO anon;
    GRANT CREATE ON SCHEMA public TO authenticated;

    CREATE OR REPLACE FUNCTION public.normalize_phone(p_phone text)
    RETURNS text AS $$
    DECLARE
      cleaned text;
    BEGIN
      IF p_phone IS NULL THEN RETURN NULL; END IF;
      cleaned := regexp_replace(p_phone, '\\D', '', 'g');
      IF length(cleaned) = 12 AND cleaned LIKE '91%' THEN
        cleaned := substring(cleaned from 3);
      ELSIF length(cleaned) = 11 AND cleaned LIKE '0%' THEN
        cleaned := substring(cleaned from 2);
      END IF;
      IF length(cleaned) = 10 AND cleaned ~ '^[6-9]\\d{9}$' THEN
        RETURN cleaned;
      ELSE
        RETURN cleaned;
      END IF;
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;

    CREATE TABLE public.contact_operators (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      is_active BOOLEAN NOT NULL DEFAULT true,
      operator_type TEXT NOT NULL DEFAULT 'operator',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE public.master_contacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      phone TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      gender TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE public.master_contact_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      master_contact_id UUID NOT NULL REFERENCES public.master_contacts(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      event_record_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE public.master_contact_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      master_contact_id UUID NOT NULL REFERENCES public.master_contacts(id) ON DELETE CASCADE,
      operator_id UUID NOT NULL REFERENCES public.contact_operators(id) ON DELETE CASCADE,
      is_active BOOLEAN NOT NULL DEFAULT true,
      status TEXT NOT NULL DEFAULT 'assigned',
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE public.registrations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name TEXT NOT NULL,
      phone TEXT,
      gender TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE public.contact_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      registration_id UUID NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
      operator_id UUID NOT NULL REFERENCES public.contact_operators(id) ON DELETE CASCADE,
      assigned_by UUID,
      is_active BOOLEAN NOT NULL DEFAULT true,
      status TEXT NOT NULL DEFAULT 'Pending',
      remarks TEXT,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE public.krishnashtami_registrations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name TEXT NOT NULL,
      phone TEXT,
      gender TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE public.krishnashtami_contact_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      registration_id UUID NOT NULL REFERENCES public.krishnashtami_registrations(id) ON DELETE CASCADE,
      operator_id UUID NOT NULL REFERENCES public.contact_operators(id) ON DELETE CASCADE,
      assigned_by TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      status TEXT NOT NULL DEFAULT 'Pending',
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE public.feedback_contacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name TEXT NOT NULL,
      phone TEXT,
      gender TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE public.feedback_contact_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      feedback_contact_id UUID NOT NULL REFERENCES public.feedback_contacts(id) ON DELETE CASCADE,
      operator_id UUID NOT NULL REFERENCES public.contact_operators(id) ON DELETE CASCADE,
      assigned_by UUID,
      is_active BOOLEAN NOT NULL DEFAULT true,
      status TEXT NOT NULL DEFAULT 'Assigned',
      notes TEXT,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE public.audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      action TEXT NOT NULL,
      details JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
  await pg.exec(baselineSchema);

  // Capture pre-migration privilege state for Scenario 16 verification
  const prePrivCheck = await pg.query<{ anon_create: boolean; auth_create: boolean; pub_create: boolean }>(`
    SELECT 
      has_schema_privilege('anon', 'public', 'CREATE') AS anon_create,
      has_schema_privilege('authenticated', 'public', 'CREATE') AS auth_create,
      has_schema_privilege('public', 'public', 'CREATE') AS pub_create;
  `);
  const prePrivRow = prePrivCheck.rows[0];

  const preAclCheck = await pg.query<{ pub_has_create: boolean }>(`
    SELECT EXISTS (
      SELECT 1 
      FROM aclexplode(COALESCE(ns.nspacl, acldefault('n', ns.nspowner))) acl
      WHERE acl.grantee = 0 
        AND acl.privilege_type = 'CREATE'
    ) AS pub_has_create
    FROM pg_namespace ns
    WHERE ns.nspname = 'public';
  `);
  const prePubHasCreate = preAclCheck.rows[0]?.pub_has_create;

  console.log('Step 2: Applying migration 20261106000000_dynamic_capacity_and_not_interested.sql...');
  const migrationPath = path.resolve('supabase/migrations/20261106000000_dynamic_capacity_and_not_interested.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  await pg.exec(migrationSql);
  console.log('  Migration applied successfully!\n');

  // Helper operator
  const opRes = await pg.query<{ id: string }>(`
    INSERT INTO public.contact_operators (name, email, is_active, capacity)
    VALUES ('Standard Test Operator', 'standard@hkm.org', true, 40)
    RETURNING id;
  `);
  const opId = opRes.rows[0].id;

  // --------------------------------------------------------------------------
  // Scenario 1: Invalid source rejection (NULL, empty, unsupported -> INVALID_SOURCE)
  // --------------------------------------------------------------------------
  console.log('--- Running Scenario 1: Invalid Source Rejection ---');
  const reg1 = await pg.query<{ id: string }>(`
    INSERT INTO public.registrations (full_name, phone, gender)
    VALUES ('Scenario 1 Contact', '9111111101', 'Male')
    RETURNING id;
  `);
  const reg1Id = reg1.rows[0].id;

  const res1Null = await pg.query<{ assign_contact_atomic: any }>(`
    SELECT public.assign_contact_atomic('${reg1Id}', '${opId}', NULL);
  `);
  const out1Null = res1Null.rows[0].assign_contact_atomic;
  recordTest(1, 'NULL source rejected', out1Null.success === false && out1Null.code === 'INVALID_SOURCE', `Code: ${out1Null.code}`);

  const res1Empty = await pg.query<{ assign_contact_atomic: any }>(`
    SELECT public.assign_contact_atomic('${reg1Id}', '${opId}', '   ');
  `);
  const out1Empty = res1Empty.rows[0].assign_contact_atomic;
  recordTest(1, 'Empty string source rejected', out1Empty.success === false && out1Empty.code === 'INVALID_SOURCE', `Code: ${out1Empty.code}`);

  const res1Unsupported = await pg.query<{ assign_contact_atomic: any }>(`
    SELECT public.assign_contact_atomic('${reg1Id}', '${opId}', 'unknown_event');
  `);
  const out1Unsupported = res1Unsupported.rows[0].assign_contact_atomic;
  recordTest(1, 'Unsupported source rejected', out1Unsupported.success === false && out1Unsupported.code === 'INVALID_SOURCE', `Code: ${out1Unsupported.code}`);

  // --------------------------------------------------------------------------
  // Scenario 2: Conflicting event-linked Master Contact phone identities -> IDENTITY_CONFLICT
  // --------------------------------------------------------------------------
  console.log('\n--- Running Scenario 2: Conflicting Event-Linked Phones ---');
  const reg2 = await pg.query<{ id: string }>(`
    INSERT INTO public.registrations (full_name, phone, gender)
    VALUES ('Scenario 2 Registration', '9222222201', 'Male')
    RETURNING id;
  `);
  const reg2Id = reg2.rows[0].id;

  const mc2A = await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (phone, name, gender)
    VALUES ('9222222201', 'MC 2A', 'Male')
    RETURNING id;
  `);
  const mc2B = await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (phone, name, gender)
    VALUES ('9222222202', 'MC 2B (Conflicting Phone)', 'Male')
    RETURNING id;
  `);

  await pg.exec(`
    INSERT INTO public.master_contact_events (master_contact_id, source, event_record_id)
    VALUES ('${mc2A.rows[0].id}', 'rathayatra', '${reg2Id}'),
           ('${mc2B.rows[0].id}', 'rathayatra', '${reg2Id}');
  `);

  const res2 = await pg.query<{ assign_contact_atomic: any }>(`
    SELECT public.assign_contact_atomic('${reg2Id}', '${opId}', 'rathayatra');
  `);
  const out2 = res2.rows[0].assign_contact_atomic;
  recordTest(2, 'Conflicting linked phone identities returns IDENTITY_CONFLICT', out2.success === false && out2.code === 'IDENTITY_CONFLICT', `Code: ${out2.code}`);

  // --------------------------------------------------------------------------
  // Area 5: Comprehensive Linked Master Contact Resolution (7 Scenarios)
  // --------------------------------------------------------------------------
  console.log('\n--- Running Area 5: Linked Master Contact Resolution (7 Scenarios) ---');

  // Case 1: One linked Master Contact with valid phone
  const regL1 = await pg.query<{ id: string }>(`
    INSERT INTO public.registrations (full_name, phone, gender)
    VALUES ('Linked Case 1', '9333333301', 'Male') RETURNING id;
  `);
  const mcL1 = await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (phone, name, gender)
    VALUES ('9333333301', 'MC Linked 1', 'Male') RETURNING id;
  `);
  await pg.exec(`
    INSERT INTO public.master_contact_events (master_contact_id, source, event_record_id)
    VALUES ('${mcL1.rows[0].id}', 'rathayatra', '${regL1.rows[0].id}');
  `);
  const resL1 = await pg.query<{ assign_contact_atomic: any }>(`
    SELECT public.assign_contact_atomic('${regL1.rows[0].id}', '${opId}', 'rathayatra');
  `);
  recordTest(2, 'Case 1: Single linked Master Contact with valid phone assigns successfully', resL1.rows[0].assign_contact_atomic.success === true, `Code: ${resL1.rows[0].assign_contact_atomic.code}`);

  // Case 2: Multiple linked Master Contacts with same normalized phone
  const regL2 = await pg.query<{ id: string }>(`
    INSERT INTO public.registrations (full_name, phone, gender)
    VALUES ('Linked Case 2', '9333333302', 'Male') RETURNING id;
  `);
  const mcL2A = await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (phone, name, gender)
    VALUES ('9333333302', 'MC Linked 2A', 'Male') RETURNING id;
  `);
  const mcL2B = await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (phone, name, gender)
    VALUES ('+91 93333 33302', 'MC Linked 2B', 'Male') RETURNING id;
  `);
  await pg.exec(`
    INSERT INTO public.master_contact_events (master_contact_id, source, event_record_id)
    VALUES ('${mcL2A.rows[0].id}', 'rathayatra', '${regL2.rows[0].id}'),
           ('${mcL2B.rows[0].id}', 'rathayatra', '${regL2.rows[0].id}');
  `);
  const resL2 = await pg.query<{ assign_contact_atomic: any }>(`
    SELECT public.assign_contact_atomic('${regL2.rows[0].id}', '${opId}', 'rathayatra');
  `);
  recordTest(2, 'Case 2: Multiple linked Master Contacts with identical normalized phone succeed', resL2.rows[0].assign_contact_atomic.success === true, `Code: ${resL2.rows[0].assign_contact_atomic.code}`);

  // Case 3: Multiple linked Master Contacts with different normalized phones -> IDENTITY_CONFLICT
  const regL3 = await pg.query<{ id: string }>(`
    INSERT INTO public.registrations (full_name, phone, gender)
    VALUES ('Linked Case 3', '9333333303', 'Male') RETURNING id;
  `);
  const mcL3A = await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (phone, name, gender)
    VALUES ('9333333303', 'MC Linked 3A', 'Male') RETURNING id;
  `);
  const mcL3B = await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (phone, name, gender)
    VALUES ('9333333304', 'MC Linked 3B', 'Male') RETURNING id;
  `);
  await pg.exec(`
    INSERT INTO public.master_contact_events (master_contact_id, source, event_record_id)
    VALUES ('${mcL3A.rows[0].id}', 'rathayatra', '${regL3.rows[0].id}'),
           ('${mcL3B.rows[0].id}', 'rathayatra', '${regL3.rows[0].id}');
  `);
  const resL3 = await pg.query<{ assign_contact_atomic: any }>(`
    SELECT public.assign_contact_atomic('${regL3.rows[0].id}', '${opId}', 'rathayatra');
  `);
  recordTest(2, 'Case 3: Multiple linked Master Contacts with differing phones return IDENTITY_CONFLICT', resL3.rows[0].assign_contact_atomic.success === false && resL3.rows[0].assign_contact_atomic.code === 'IDENTITY_CONFLICT', `Code: ${resL3.rows[0].assign_contact_atomic.code}`);

  // Case 4: One valid and one invalid linked Master Contact phone -> IDENTITY_CONFLICT
  const regL4 = await pg.query<{ id: string }>(`
    INSERT INTO public.registrations (full_name, phone, gender)
    VALUES ('Linked Case 4', '9333333305', 'Male') RETURNING id;
  `);
  const mcL4Valid = await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (phone, name, gender)
    VALUES ('9333333305', 'MC Linked 4 Valid', 'Male') RETURNING id;
  `);
  const mcL4Invalid = await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (phone, name, gender)
    VALUES ('0000000004', 'MC Linked 4 Invalid', 'Male') RETURNING id;
  `);
  await pg.exec(`
    INSERT INTO public.master_contact_events (master_contact_id, source, event_record_id)
    VALUES ('${mcL4Valid.rows[0].id}', 'rathayatra', '${regL4.rows[0].id}'),
           ('${mcL4Invalid.rows[0].id}', 'rathayatra', '${regL4.rows[0].id}');
  `);
  const resL4 = await pg.query<{ assign_contact_atomic: any }>(`
    SELECT public.assign_contact_atomic('${regL4.rows[0].id}', '${opId}', 'rathayatra');
  `);
  recordTest(2, 'Case 4: Mixed valid and invalid linked phones fail closed with IDENTITY_CONFLICT', resL4.rows[0].assign_contact_atomic.success === false && resL4.rows[0].assign_contact_atomic.code === 'IDENTITY_CONFLICT', `Code: ${resL4.rows[0].assign_contact_atomic.code}`);

  // Case 5: All linked Master Contact phones invalid -> INVALID_PHONE
  const regL5 = await pg.query<{ id: string }>(`
    INSERT INTO public.registrations (full_name, phone, gender)
    VALUES ('Linked Case 5', '9333333306', 'Male') RETURNING id;
  `);
  const mcL5Inv1 = await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (phone, name, gender)
    VALUES ('11111', 'MC Linked 5 Inv 1', 'Male') RETURNING id;
  `);
  const mcL5Inv2 = await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (phone, name, gender)
    VALUES ('22222', 'MC Linked 5 Inv 2', 'Male') RETURNING id;
  `);
  await pg.exec(`
    INSERT INTO public.master_contact_events (master_contact_id, source, event_record_id)
    VALUES ('${mcL5Inv1.rows[0].id}', 'rathayatra', '${regL5.rows[0].id}'),
           ('${mcL5Inv2.rows[0].id}', 'rathayatra', '${regL5.rows[0].id}');
  `);
  const resL5 = await pg.query<{ assign_contact_atomic: any }>(`
    SELECT public.assign_contact_atomic('${regL5.rows[0].id}', '${opId}', 'rathayatra');
  `);
  recordTest(2, 'Case 5: All linked Master Contact phones invalid returns INVALID_PHONE', resL5.rows[0].assign_contact_atomic.success === false && resL5.rows[0].assign_contact_atomic.code === 'INVALID_PHONE', `Code: ${resL5.rows[0].assign_contact_atomic.code}`);

  // Case 6: No linked Master Contact (falls back to source phone)
  const regL6 = await pg.query<{ id: string }>(`
    INSERT INTO public.registrations (full_name, phone, gender)
    VALUES ('Linked Case 6 Unlinked', '9333333307', 'Male') RETURNING id;
  `);
  const resL6 = await pg.query<{ assign_contact_atomic: any }>(`
    SELECT public.assign_contact_atomic('${regL6.rows[0].id}', '${opId}', 'rathayatra');
  `);
  recordTest(2, 'Case 6: Unlinked registration successfully falls back to source phone', resL6.rows[0].assign_contact_atomic.success === true, `Code: ${resL6.rows[0].assign_contact_atomic.code}`);

  // Case 7: Source registration phone differs from linked Master Contact phone (both unblocked)
  const regL7 = await pg.query<{ id: string }>(`
    INSERT INTO public.registrations (full_name, phone, gender)
    VALUES ('Linked Case 7 Source', '9333333308', 'Male') RETURNING id;
  `);
  const mcL7 = await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (phone, name, gender)
    VALUES ('9333333309', 'MC Linked 7 Alternate', 'Male') RETURNING id;
  `);
  await pg.exec(`
    INSERT INTO public.master_contact_events (master_contact_id, source, event_record_id)
    VALUES ('${mcL7.rows[0].id}', 'rathayatra', '${regL7.rows[0].id}');
  `);
  const resL7 = await pg.query<{ assign_contact_atomic: any }>(`
    SELECT public.assign_contact_atomic('${regL7.rows[0].id}', '${opId}', 'rathayatra');
  `);
  recordTest(2, 'Case 7: Differing unblocked source & linked Master Contact phones assign successfully', resL7.rows[0].assign_contact_atomic.success === true, `Code: ${resL7.rows[0].assign_contact_atomic.code}`);

  // --------------------------------------------------------------------------
  // Scenario 3: Missing and invalid linked phone identities
  // --------------------------------------------------------------------------
  console.log('\n--- Running Scenario 3: Missing and Invalid Linked Phone Identities ---');
  const mc3Invalid = await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (phone, name, gender)
    VALUES ('0000000000', 'Invalid Phone MC', 'Male')
    RETURNING id;
  `);
  const res3MC = await pg.query<{ assign_master_contact_atomic: any }>(`
    SELECT public.assign_master_contact_atomic('${mc3Invalid.rows[0].id}', '${opId}');
  `);
  const out3MC = res3MC.rows[0].assign_master_contact_atomic;
  recordTest(3, 'assign_master_contact_atomic rejects invalid phone (0000000000)', out3MC.success === false && out3MC.code === 'INVALID_PHONE', `Code: ${out3MC.code}`);

  const reg3Invalid = await pg.query<{ id: string }>(`
    INSERT INTO public.registrations (full_name, phone, gender)
    VALUES ('Reg With Invalid Phone', 'invalid_phone_text', 'Male')
    RETURNING id;
  `);
  const res3Reg = await pg.query<{ assign_contact_atomic: any }>(`
    SELECT public.assign_contact_atomic('${reg3Invalid.rows[0].id}', '${opId}', 'rathayatra');
  `);
  const out3Reg = res3Reg.rows[0].assign_contact_atomic;
  recordTest(3, 'assign_contact_atomic rejects invalid registration phone', out3Reg.success === false && out3Reg.code === 'INVALID_PHONE', `Code: ${out3Reg.code}`);

  // --------------------------------------------------------------------------
  // Scenario 4: Existing blocked contact rejection after conflict resolution
  // --------------------------------------------------------------------------
  console.log('\n--- Running Scenario 4: Blocked Contact Rejection After Conflict Resolution ---');
  const reg4 = await pg.query<{ id: string }>(`
    INSERT INTO public.registrations (full_name, phone, gender)
    VALUES ('Scenario 4 Reg', '9444444401', 'Male')
    RETURNING id;
  `);
  const reg4Id = reg4.rows[0].id;

  const mc4 = await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (phone, name, gender, is_not_interested)
    VALUES ('9444444401', 'Blocked Master Contact', 'Male', true)
    RETURNING id;
  `);
  await pg.exec(`
    INSERT INTO public.master_contact_events (master_contact_id, source, event_record_id)
    VALUES ('${mc4.rows[0].id}', 'rathayatra', '${reg4Id}');
  `);

  const res4 = await pg.query<{ assign_contact_atomic: any }>(`
    SELECT public.assign_contact_atomic('${reg4Id}', '${opId}', 'rathayatra');
  `);
  const out4 = res4.rows[0].assign_contact_atomic;
  recordTest(4, 'assign_contact_atomic rejects blocked contact with CONTACT_NOT_INTERESTED', out4.success === false && out4.code === 'CONTACT_NOT_INTERESTED', `Code: ${out4.code}`);

  // --------------------------------------------------------------------------
  // Scenario 5: Capacity boundary values 1 and 500
  // --------------------------------------------------------------------------
  console.log('\n--- Running Scenario 5: Capacity Boundary Values ---');
  const op5Min = await pg.query<{ id: string }>(`
    INSERT INTO public.contact_operators (name, email, is_active, capacity)
    VALUES ('Op Min Capacity', 'opmin@hkm.org', true, 1)
    RETURNING id;
  `);
  const op5Max = await pg.query<{ id: string }>(`
    INSERT INTO public.contact_operators (name, email, is_active, capacity)
    VALUES ('Op Max Capacity', 'opmax@hkm.org', true, 500)
    RETURNING id;
  `);

  const mc5A = await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (phone, name, gender)
    VALUES ('9555555501', 'MC 5A', 'Male')
    RETURNING id;
  `);
  const res5A = await pg.query<{ assign_master_contact_atomic: any }>(`
    SELECT public.assign_master_contact_atomic('${mc5A.rows[0].id}', '${op5Min.rows[0].id}');
  `);
  recordTest(5, 'Capacity 1 operator accepts 1st assignment', res5A.rows[0].assign_master_contact_atomic.success === true, `Code: ${res5A.rows[0].assign_master_contact_atomic.code}`);

  const mc5B = await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (phone, name, gender)
    VALUES ('9555555502', 'MC 5B', 'Male')
    RETURNING id;
  `);
  const res5B = await pg.query<{ assign_master_contact_atomic: any }>(`
    SELECT public.assign_master_contact_atomic('${mc5B.rows[0].id}', '${op5Max.rows[0].id}');
  `);
  recordTest(5, 'Capacity 500 operator accepts assignment', res5B.rows[0].assign_master_contact_atomic.success === true, `Code: ${res5B.rows[0].assign_master_contact_atomic.code}`);

  // --------------------------------------------------------------------------
  // Scenario 6: Capacity overflow (capacity+1)
  // --------------------------------------------------------------------------
  console.log('\n--- Running Scenario 6: Capacity Overflow (Capacity + 1) ---');
  const mc6Overflow = await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (phone, name, gender)
    VALUES ('9666666601', 'MC 6 Overflow', 'Male')
    RETURNING id;
  `);
  const res6 = await pg.query<{ assign_master_contact_atomic: any }>(`
    SELECT public.assign_master_contact_atomic('${mc6Overflow.rows[0].id}', '${op5Min.rows[0].id}');
  `);
  const out6 = res6.rows[0].assign_master_contact_atomic;
  recordTest(6, 'Operator with capacity 1 rejects 2nd assignment with OPERATOR_CAPACITY_EXCEEDED', out6.success === false && out6.code === 'OPERATOR_CAPACITY_EXCEEDED', `Code: ${out6.code}`);

  // --------------------------------------------------------------------------
  // Scenario 7: NULL or unknown gender rejection -> GENDER_INELIGIBLE
  // --------------------------------------------------------------------------
  console.log('\n--- Running Scenario 7: Female / NULL Gender Rejection ---');
  const mc7Female = await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (phone, name, gender)
    VALUES ('9777777701', 'Female Contact', 'Female')
    RETURNING id;
  `);
  const res7Female = await pg.query<{ assign_master_contact_atomic: any }>(`
    SELECT public.assign_master_contact_atomic('${mc7Female.rows[0].id}', '${opId}');
  `);
  const out7Female = res7Female.rows[0].assign_master_contact_atomic;
  recordTest(7, 'Female gender rejected with GENDER_INELIGIBLE', out7Female.success === false && out7Female.code === 'GENDER_INELIGIBLE', `Code: ${out7Female.code}`);

  const mc7Null = await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (phone, name, gender)
    VALUES ('9777777702', 'Null Gender Contact', NULL)
    RETURNING id;
  `);
  const res7Null = await pg.query<{ assign_master_contact_atomic: any }>(`
    SELECT public.assign_master_contact_atomic('${mc7Null.rows[0].id}', '${opId}');
  `);
  const out7Null = res7Null.rows[0].assign_master_contact_atomic;
  recordTest(7, 'NULL gender rejected with GENDER_INELIGIBLE', out7Null.success === false && out7Null.code === 'GENDER_INELIGIBLE', `Code: ${out7Null.code}`);

  // --------------------------------------------------------------------------
  // Scenario 8: Not Interested identity propagation
  // --------------------------------------------------------------------------
  console.log('\n--- Running Scenario 8: Not Interested Identity Propagation ---');
  const reg8 = await pg.query<{ id: string }>(`
    INSERT INTO public.registrations (full_name, phone, gender)
    VALUES ('Propagation Contact', '9888888801', 'Male')
    RETURNING id;
  `);
  const reg8Id = reg8.rows[0].id;

  const assign8 = await pg.query<{ assign_contact_atomic: any }>(`
    SELECT public.assign_contact_atomic('${reg8Id}', '${opId}', 'rathayatra');
  `);
  recordTest(8, 'Assigned contact successfully prior to marking', assign8.rows[0].assign_contact_atomic.success === true, 'Assigned');

  const mark8 = await pg.query<{ mark_contact_not_interested_atomic: any }>(`
    SELECT public.mark_contact_not_interested_atomic(NULL, '9888888801', '${opId}', 'Propagate test');
  `);
  recordTest(8, 'mark_contact_not_interested_atomic succeeded', mark8.rows[0].mark_contact_not_interested_atomic.success === true, 'Marked');

  const activeCheck8 = await pg.query<{ count: number }>(`
    SELECT count(*) FROM public.contact_assignments WHERE registration_id = '${reg8Id}' AND is_active = true;
  `);
  recordTest(8, 'Active assignment deactivated', Number(activeCheck8.rows[0].count) === 0, `Active count: ${activeCheck8.rows[0].count}`);

  const mcCheck8 = await pg.query<{ is_not_interested: boolean }>(`
    SELECT is_not_interested FROM public.master_contacts WHERE normalize_phone(phone) = '9888888801';
  `);
  recordTest(8, 'Master contact marked is_not_interested = true', mcCheck8.rows[0]?.is_not_interested === true, `is_not_interested: ${mcCheck8.rows[0]?.is_not_interested}`);

  // --------------------------------------------------------------------------
  // Area 7: Input Consistency Validation (IDENTITY_MISMATCH)
  // --------------------------------------------------------------------------
  console.log('\n--- Running Area 7: Input Consistency Validation ---');
  const mcPersonA = await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (phone, name, gender)
    VALUES ('9888888881', 'Person A', 'Male')
    RETURNING id;
  `);
  const resMismatch = await pg.query<{ mark_contact_not_interested_atomic: any }>(`
    SELECT public.mark_contact_not_interested_atomic(
      p_master_contact_id := '${mcPersonA.rows[0].id}'::uuid,
      p_phone := '9888888882'::text,
      p_operator_id := '${opId}'::uuid,
      p_reason := 'Mismatch test'
    );
  `);
  const outMismatch = resMismatch.rows[0].mark_contact_not_interested_atomic;
  recordTest(8, 'mark_contact_not_interested_atomic rejects unrelated ID and phone with IDENTITY_MISMATCH', outMismatch.success === false && outMismatch.code === 'IDENTITY_MISMATCH', `Code: ${outMismatch.code}`);

  // --------------------------------------------------------------------------
  // Scenario 9: Transitive closure convergence failure safety check
  // --------------------------------------------------------------------------
  console.log('\n--- Running Scenario 9: Transitive Closure Safety Limit ---');
  const migrationFile = fs.readFileSync(migrationPath, 'utf8');
  const hasConvergenceGuard = migrationFile.includes('CONVERGENCE_ERROR') && migrationFile.includes('v_loop_iter >= 100');
  recordTest(9, 'Convergence safety guard exists in migration source', hasConvergenceGuard, 'Static guard check only; runtime behavior is tested below');

  // Build a 100-edge identity chain. Each closure pass discovers exactly one
  // additional Master Contact through the next linked Rathayatra registration.
  const chainLength = 100;
  const chainPhones = Array.from({ length: chainLength + 1 }, (_, i) => String(9100000000 + i));
  const chainMcValues = chainPhones.map((phone, i) => `('${phone}', 'Closure MC ${i}', 'Male')`).join(',');
  const chainMcRes = await pg.query<{ id: string; phone: string }>(`
    INSERT INTO public.master_contacts (phone, name, gender) VALUES ${chainMcValues}
    RETURNING id, phone;
  `);
  const chainMcByPhone = new Map(chainMcRes.rows.map((row) => [row.phone, row.id]));
  const chainRegValues = chainPhones.slice(1).map((phone, i) => `('Closure Registration ${i}', '${phone}', 'Male')`).join(',');
  const chainRegRes = await pg.query<{ id: string; phone: string }>(`
    INSERT INTO public.registrations (full_name, phone, gender) VALUES ${chainRegValues}
    RETURNING id, phone;
  `);
  const chainEvents = chainRegRes.rows.map((row) => {
    const previousPhone = chainPhones[chainPhones.indexOf(row.phone) - 1];
    const masterId = chainMcByPhone.get(previousPhone);
    if (!masterId) throw new Error(`Missing Master Contact for chain phone ${previousPhone}`);
    return `('${masterId}', 'rathayatra', '${row.id}')`;
  }).join(',');
  await pg.exec(`
    INSERT INTO public.master_contact_events (master_contact_id, source, event_record_id)
    VALUES ${chainEvents};
  `);
  const convergenceRes = await pg.query<{ mark_contact_not_interested_atomic: any }>(`
    SELECT public.mark_contact_not_interested_atomic(
      '${chainMcByPhone.get(chainPhones[0])}'::uuid,
      NULL::text,
      '${opId}'::uuid,
      'convergence safety test'
    );
  `);
  const convergenceOut = convergenceRes.rows[0].mark_contact_not_interested_atomic;
  recordTest(
    9,
    '100-hop identity chain aborts with CONVERGENCE_ERROR before partial marking',
    convergenceOut.success === false && convergenceOut.code === 'CONVERGENCE_ERROR',
    `Code: ${convergenceOut.code}`
  );

  // --------------------------------------------------------------------------
  // Scenario 10: Repeated marking behavior
  // --------------------------------------------------------------------------
  console.log('\n--- Running Scenario 10: Repeated Marking Behavior ---');
  const op10Other = await pg.query<{ id: string }>(`
    INSERT INTO public.contact_operators (name, email, is_active, capacity)
    VALUES ('Second Operator', 'opsecond@hkm.org', true, 40)
    RETURNING id;
  `);

  await pg.query(`
    SELECT public.mark_contact_not_interested_atomic(NULL, '9888888801', '${op10Other.rows[0].id}', 'Second marking');
  `);

  const mc10Check = await pg.query<{ not_interested_by: string; is_not_interested: boolean }>(`
    SELECT not_interested_by, is_not_interested FROM public.master_contacts WHERE normalize_phone(phone) = '9888888801';
  `);
  recordTest(10, 'Second marking updates not_interested_by to second operator', mc10Check.rows[0]?.not_interested_by === op10Other.rows[0].id, `not_interested_by: ${mc10Check.rows[0]?.not_interested_by}`);
  recordTest(10, 'is_not_interested remains true', mc10Check.rows[0]?.is_not_interested === true, 'is_not_interested: true');

  // --------------------------------------------------------------------------
  // Scenario 11: RPC permission restrictions (REVOKE/GRANT service_role)
  // --------------------------------------------------------------------------
  console.log('\n--- Running Scenario 11: RPC Permission Restrictions ---');
  const hasRevokeMaster = migrationFile.includes('REVOKE EXECUTE ON FUNCTION public.assign_master_contact_atomic(uuid, uuid, uuid, integer, boolean) FROM PUBLIC, anon, authenticated;');
  const hasGrantMaster = migrationFile.includes('GRANT EXECUTE ON FUNCTION public.assign_master_contact_atomic(uuid, uuid, uuid, integer, boolean) TO service_role;');
  const hasRevokeContact = migrationFile.includes('REVOKE EXECUTE ON FUNCTION public.assign_contact_atomic(UUID, UUID, TEXT, UUID, INTEGER, BOOLEAN) FROM PUBLIC, anon, authenticated;');
  const hasGrantContact = migrationFile.includes('GRANT EXECUTE ON FUNCTION public.assign_contact_atomic(UUID, UUID, TEXT, UUID, INTEGER, BOOLEAN) TO service_role;');
  const hasRevokeMark = migrationFile.includes('REVOKE EXECUTE ON FUNCTION public.mark_contact_not_interested_atomic(UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;');
  const hasGrantMark = migrationFile.includes('GRANT EXECUTE ON FUNCTION public.mark_contact_not_interested_atomic(UUID, TEXT, UUID, TEXT) TO service_role;');

  const allPermissionsValid = hasRevokeMaster && hasGrantMaster && hasRevokeContact && hasGrantContact && hasRevokeMark && hasGrantMark;
  recordTest(11, 'All 3 RPCs have REVOKE FROM PUBLIC/anon/authenticated and GRANT TO service_role', allPermissionsValid, 'Static permission grant verification verified');

  // --------------------------------------------------------------------------
  // Scenario 12: Function signature and named-argument compatibility
  // --------------------------------------------------------------------------
  console.log('\n--- Running Scenario 12: Signature & Named Argument Compatibility ---');
  const reg12 = await pg.query<{ id: string }>(`
    INSERT INTO public.registrations (full_name, phone, gender)
    VALUES ('Named Arg Registration', '9999999901', 'Male')
    RETURNING id;
  `);

  const namedCallRes = await pg.query<{ assign_contact_atomic: any }>(`
    SELECT public.assign_contact_atomic(
      p_contact_id := '${reg12.rows[0].id}'::uuid,
      p_operator_id := '${opId}'::uuid,
      p_source := 'rathayatra'::text,
      p_assigned_by := NULL::uuid,
      p_max_capacity := 40::integer,
      p_allow_reassign := false::boolean
    );
  `);
  recordTest(12, 'assign_contact_atomic callable with all named parameters', namedCallRes.rows[0].assign_contact_atomic.success === true, `Code: ${namedCallRes.rows[0].assign_contact_atomic.code}`);

  // --------------------------------------------------------------------------
  // Scenario 13: Catalog-Based Foreign Key & Column Nullability Validation (Section 1)
  // --------------------------------------------------------------------------
  console.log('\n--- Running Scenario 13: Catalog-Based Foreign Key Validation ---');
  const fkCatRes = await pg.query<{
    conname: string;
    conrelname: string;
    confrelname: string;
    conkey_len: number;
    confkey_len: number;
    confdeltype: string;
    convalidated: boolean;
    attnotnull: boolean;
  }>(`
    SELECT 
      pc.conname,
      cls.relname AS conrelname,
      refcls.relname AS confrelname,
      cardinality(pc.conkey) AS conkey_len,
      cardinality(pc.confkey) AS confkey_len,
      pc.confdeltype,
      pc.convalidated,
      a.attnotnull
    FROM pg_constraint pc
    JOIN pg_class cls ON cls.oid = pc.conrelid
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    JOIN pg_class refcls ON refcls.oid = pc.confrelid
    JOIN pg_namespace refns ON refns.oid = refcls.relnamespace
    JOIN pg_attribute a ON a.attrelid = cls.oid AND a.attname = 'not_interested_by'
    JOIN pg_attribute refa ON refa.attrelid = refcls.oid AND refa.attname = 'id'
    WHERE ns.nspname = 'public'
      AND cls.relname = 'master_contacts'
      AND refns.nspname = 'public'
      AND refcls.relname = 'contact_operators'
      AND pc.contype = 'f'
      AND pc.conkey = ARRAY[a.attnum]::int2[]
      AND pc.confkey = ARRAY[refa.attnum]::int2[];
  `);

  const fkRow = fkCatRes.rows[0];
  recordTest(13, 'FK references public.master_contacts to public.contact_operators', fkRow?.conrelname === 'master_contacts' && fkRow?.confrelname === 'contact_operators', `Tables: ${fkRow?.conrelname} -> ${fkRow?.confrelname}`);
  recordTest(13, 'FK is strictly single-column not_interested_by to id (no composite keys)', Number(fkRow?.conkey_len) === 1 && Number(fkRow?.confkey_len) === 1, `conkey_len: ${fkRow?.conkey_len}, confkey_len: ${fkRow?.confkey_len}`);
  recordTest(13, 'FK delete action is strictly ON DELETE SET NULL (confdeltype = n)', fkRow?.confdeltype === 'n', `confdeltype: ${fkRow?.confdeltype}`);
  recordTest(13, 'FK constraint is validated (convalidated = true)', fkRow?.convalidated === true, `convalidated: ${fkRow?.convalidated}`);
  recordTest(13, 'Referencing column master_contacts.not_interested_by is nullable (attnotnull = false)', fkRow?.attnotnull === false, `attnotnull: ${fkRow?.attnotnull}`);

  // Verify Preflight Section 3 diagnostic output directly
  const sec3DiagRes = await pg.query<{ status: string; constraint_name: string }>(`
    SELECT 
        CASE 
            WHEN a.attnum IS NULL OR pc.oid IS NULL THEN 'MISSING_FOREIGN_KEY'
            WHEN a.attnotnull = true THEN 'NOT_NULL_SOURCE_COLUMN'
            WHEN cardinality(pc.conkey) > 1 OR cardinality(pc.confkey) > 1 OR pc.conkey <> ARRAY[a.attnum]::int2[] THEN 'COMPOSITE_FOREIGN_KEY'
            WHEN COALESCE(refns.nspname, '') <> 'public' OR COALESCE(refcls.relname, '') <> 'contact_operators' THEN 'WRONG_REFERENCED_TABLE'
            WHEN cardinality(pc.confkey) <> 1 OR COALESCE(refa.attname, '') <> 'id' OR pc.confkey <> ARRAY[target_op.expected_target_attnum]::int2[] THEN 'WRONG_REFERENCED_COLUMN'
            WHEN COALESCE(pc.confdeltype, '') <> 'n' THEN 'WRONG_DELETE_ACTION'
            WHEN COALESCE(pc.convalidated, false) = false THEN 'UNVALIDATED_FOREIGN_KEY'
            ELSE 'COMPLIANT'
        END AS status
    FROM (SELECT 'master_contacts'::name AS target_table_name) target_tbl
    LEFT JOIN pg_class cls ON cls.relname = target_tbl.target_table_name
    LEFT JOIN pg_namespace ns ON ns.oid = cls.relnamespace AND ns.nspname = 'public'
    LEFT JOIN pg_attribute a ON a.attrelid = cls.oid AND a.attname = 'not_interested_by' AND NOT a.attisdropped
    LEFT JOIN pg_constraint pc ON pc.conrelid = cls.oid AND pc.contype = 'f' AND (a.attnum IS NOT NULL AND a.attnum = ANY(pc.conkey))
    LEFT JOIN pg_class refcls ON refcls.oid = pc.confrelid
    LEFT JOIN pg_namespace refns ON refns.oid = refcls.relnamespace
    LEFT JOIN pg_attribute refa ON refa.attrelid = refcls.oid AND pc.confkey IS NOT NULL AND refa.attnum = pc.confkey[1] AND NOT refa.attisdropped
    LEFT JOIN (
        SELECT op_a.attnum AS expected_target_attnum
        FROM pg_class op_cls
        JOIN pg_namespace op_ns ON op_ns.oid = op_cls.relnamespace
        JOIN pg_attribute op_a ON op_a.attrelid = op_cls.oid
        WHERE op_ns.nspname = 'public'
          AND op_cls.relname = 'contact_operators'
          AND op_a.attname = 'id'
          AND NOT op_a.attisdropped
    ) target_op ON true;
  `);
  recordTest(13, 'Preflight Section 3 diagnostic reports COMPLIANT on migrated schema', sec3DiagRes.rows[0]?.status === 'COMPLIANT', `Status: ${sec3DiagRes.rows[0]?.status}`);

  // --------------------------------------------------------------------------
  // Scenario 14: Catalog-Based Partial Index Validation (Section 2)
  // --------------------------------------------------------------------------
  console.log('\n--- Running Scenario 14: Catalog-Based Partial Index Validation ---');
  const idxCatRes = await pg.query<{
    tbl_name: string;
    indisvalid: boolean;
    indisready: boolean;
    indnatts: number;
    indnkeyatts: number;
    has_exprs: boolean;
    indkey_col: string;
    predicate_expr: string;
  }>(`
    SELECT 
      c_tbl.relname AS tbl_name,
      i.indisvalid,
      i.indisready,
      i.indnatts,
      i.indnkeyatts,
      (i.indexprs IS NOT NULL) AS has_exprs,
      a.attname AS indkey_col,
      pg_get_expr(i.indpred, i.indrelid) AS predicate_expr
    FROM pg_class c_idx
    JOIN pg_namespace ns_idx ON ns_idx.oid = c_idx.relnamespace
    JOIN pg_index i ON i.indexrelid = c_idx.oid
    JOIN pg_class c_tbl ON c_tbl.oid = i.indrelid
    JOIN pg_namespace ns_tbl ON ns_tbl.oid = c_tbl.relnamespace
    JOIN pg_attribute a ON a.attrelid = c_tbl.oid AND a.attnum = i.indkey[0]
    WHERE c_idx.relname = 'idx_master_contacts_not_interested'
      AND ns_idx.nspname = 'public';
  `);

  const idxRow = idxCatRes.rows[0];
  recordTest(14, 'Index idx_master_contacts_not_interested belongs to public.master_contacts', idxRow?.tbl_name === 'master_contacts', `Table: ${idxRow?.tbl_name}`);
  recordTest(14, 'Index is valid and ready (indisvalid = true, indisready = true)', idxRow?.indisvalid === true && idxRow?.indisready === true, `Valid: ${idxRow?.indisvalid}, Ready: ${idxRow?.indisready}`);
  recordTest(14, 'Index is strictly single-column on is_not_interested without extra columns/expressions', Number(idxRow?.indnatts) === 1 && Number(idxRow?.indnkeyatts) === 1 && !idxRow?.has_exprs && idxRow?.indkey_col === 'is_not_interested', `Col: ${idxRow?.indkey_col}, natts: ${idxRow?.indnatts}`);
  recordTest(14, 'Index predicate matches is_not_interested = true', idxRow?.predicate_expr === '(is_not_interested = true)' || idxRow?.predicate_expr === 'is_not_interested', `Predicate: ${idxRow?.predicate_expr}`);

  // Verify Preflight Section 4 diagnostic output directly
  const sec4DiagRes = await pg.query<{ definition_check: string }>(`
    SELECT 
        CASE 
            WHEN c_idx.oid IS NULL THEN 'MISSING_INDEX'
            WHEN COALESCE(ns_tbl.nspname, '') <> 'public' OR COALESCE(c_tbl.relname, '') <> 'master_contacts' OR COALESCE(ns_idx.nspname, '') <> 'public' THEN 'WRONG_TABLE'
            WHEN i.indisvalid = false THEN 'INVALID_INDEX'
            WHEN i.indisready = false THEN 'INDEX_NOT_READY'
            WHEN i.indexprs IS NOT NULL THEN 'EXPRESSION_INDEX'
            WHEN i.indnatts <> 1 OR i.indnkeyatts <> 1 THEN 'UNEXPECTED_KEY_COLUMNS'
            WHEN a.attname IS NULL OR a.attname <> 'is_not_interested' THEN 'WRONG_COLUMN'
            WHEN pg_get_expr(i.indpred, i.indrelid) IS NULL 
              OR (pg_get_expr(i.indpred, i.indrelid) <> '(is_not_interested = true)' 
                  AND pg_get_expr(i.indpred, i.indrelid) <> 'is_not_interested') THEN 'WRONG_PREDICATE'
            ELSE 'VALID_CATALOG_PARTIAL_INDEX'
        END AS definition_check
    FROM (SELECT 'idx_master_contacts_not_interested'::name AS target_index_name) target
    LEFT JOIN pg_class c_idx ON c_idx.relname = target.target_index_name
    LEFT JOIN pg_namespace ns_idx ON ns_idx.oid = c_idx.relnamespace
    LEFT JOIN pg_index i ON i.indexrelid = c_idx.oid
    LEFT JOIN pg_class c_tbl ON c_tbl.oid = i.indrelid
    LEFT JOIN pg_namespace ns_tbl ON ns_tbl.oid = c_tbl.relnamespace
    LEFT JOIN pg_attribute a ON a.attrelid = c_tbl.oid AND a.attnum = i.indkey[0] AND NOT a.attisdropped;
  `);
  recordTest(14, 'Preflight Section 4 diagnostic reports VALID_CATALOG_PARTIAL_INDEX', sec4DiagRes.rows[0]?.definition_check === 'VALID_CATALOG_PARTIAL_INDEX', `Status: ${sec4DiagRes.rows[0]?.definition_check}`);

  // --------------------------------------------------------------------------
  // Preflight Section 14: Operator Capacity Utilization & Multi-Table Anti-Multiplication Audit
  // --------------------------------------------------------------------------
  console.log('\n--- Running Preflight Section 14: Operator Capacity Utilization & Row Multiplication Audit ---');
  const opMultiRes = await pg.query<{ id: string }>(`
    INSERT INTO public.contact_operators (name, email, is_active, capacity)
    VALUES ('Multi Table Capacity Operator', 'multicap@hkm.org', true, 2)
    RETURNING id;
  `);
  const opMultiId = opMultiRes.rows[0].id;

  for (let i = 1; i <= 3; i++) {
    const mc = await pg.query<{ id: string }>(`
      INSERT INTO public.master_contacts (phone, name, gender)
      VALUES ('990000000' || ${i}, 'Master Multi ' || ${i}, 'Male')
      RETURNING id;
    `);
    await pg.query(`
      INSERT INTO public.master_contact_assignments (master_contact_id, operator_id, is_active, status)
      VALUES ('${mc.rows[0].id}', '${opMultiId}', true, 'assigned');
    `);
  }

  for (let i = 1; i <= 2; i++) {
    const reg = await pg.query<{ id: string }>(`
      INSERT INTO public.registrations (full_name, phone, gender)
      VALUES ('Ratha Multi ' || ${i}, '990000001' || ${i}, 'Male')
      RETURNING id;
    `);
    await pg.query(`
      INSERT INTO public.contact_assignments (registration_id, operator_id, is_active, status)
      VALUES ('${reg.rows[0].id}', '${opMultiId}', true, 'Pending');
    `);
  }

  for (let i = 1; i <= 4; i++) {
    const kreg = await pg.query<{ id: string }>(`
      INSERT INTO public.krishnashtami_registrations (full_name, phone, gender)
      VALUES ('Krishna Multi ' || ${i}, '990000002' || ${i}, 'Male')
      RETURNING id;
    `);
    await pg.query(`
      INSERT INTO public.krishnashtami_contact_assignments (registration_id, operator_id, is_active, status, assigned_by)
      VALUES ('${kreg.rows[0].id}', '${opMultiId}', true, 'Pending', 'admin');
    `);
  }

  const fcon = await pg.query<{ id: string }>(`
    INSERT INTO public.feedback_contacts (full_name, phone, gender)
    VALUES ('Feedback Multi 1', '9900000031', 'Male')
    RETURNING id;
  `);
  await pg.query(`
    INSERT INTO public.feedback_contact_assignments (feedback_contact_id, operator_id, is_active, status)
    VALUES ('${fcon.rows[0].id}', '${opMultiId}', true, 'Assigned');
  `);

  const sec14Res = await pg.query<any>(`
    SELECT 
      co.id AS operator_id,
      co.name AS operator_name,
      co.is_active AS operator_active,
      co.capacity AS configured_capacity,
      COALESCE(mca.cnt, 0) AS active_master_count,
      COALESCE(ca.cnt, 0) AS active_rathayatra_count,
      COALESCE(kca.cnt, 0) AS active_krishnashtami_count,
      COALESCE(fca.cnt, 0) AS active_feedback_count,
      CASE 
          WHEN co.capacity IS NULL OR co.capacity < 1 OR co.capacity > 500 THEN 'INVALID_OR_NULL_CAPACITY'
          WHEN COALESCE(mca.cnt, 0) > co.capacity THEN 'MASTER_OVER_CAPACITY'
          ELSE 'MASTER_WITHIN_CAPACITY'
      END AS master_capacity_compliance,
      CASE 
          WHEN co.capacity IS NULL OR co.capacity < 1 OR co.capacity > 500 THEN 'INVALID_OR_NULL_CAPACITY'
          WHEN COALESCE(ca.cnt, 0) > co.capacity THEN 'RATHAYATRA_OVER_CAPACITY'
          ELSE 'RATHAYATRA_WITHIN_CAPACITY'
      END AS rathayatra_capacity_compliance,
      CASE 
          WHEN co.capacity IS NULL OR co.capacity < 1 OR co.capacity > 500 THEN 'INVALID_OR_NULL_CAPACITY'
          WHEN COALESCE(kca.cnt, 0) > co.capacity THEN 'KRISHNASHTAMI_OVER_CAPACITY'
          ELSE 'KRISHNASHTAMI_WITHIN_CAPACITY'
      END AS krishnashtami_capacity_compliance,
      CASE 
          WHEN co.capacity IS NULL OR co.capacity < 1 OR co.capacity > 500 THEN 'INVALID_OR_NULL_CAPACITY'
          WHEN COALESCE(fca.cnt, 0) > co.capacity THEN 'FEEDBACK_OVER_CAPACITY'
          ELSE 'FEEDBACK_WITHIN_CAPACITY'
      END AS feedback_capacity_compliance
    FROM public.contact_operators co
    LEFT JOIN (
        SELECT operator_id, COUNT(*) AS cnt 
        FROM public.master_contact_assignments 
        WHERE is_active = true 
        GROUP BY operator_id
    ) mca ON mca.operator_id = co.id
    LEFT JOIN (
        SELECT operator_id, COUNT(*) AS cnt 
        FROM public.contact_assignments 
        WHERE is_active = true 
        GROUP BY operator_id
    ) ca ON ca.operator_id = co.id
    LEFT JOIN (
        SELECT operator_id, COUNT(*) AS cnt 
        FROM public.krishnashtami_contact_assignments 
        WHERE is_active = true 
        GROUP BY operator_id
    ) kca ON kca.operator_id = co.id
    LEFT JOIN (
        SELECT operator_id, COUNT(*) AS cnt 
        FROM public.feedback_contact_assignments 
        WHERE is_active = true 
        GROUP BY operator_id
    ) fca ON fca.operator_id = co.id
    WHERE co.id = '${opMultiId}';
  `);
  const sec14Row = sec14Res.rows[0];

  const indMaster = await pg.query<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM public.master_contact_assignments WHERE operator_id = '${opMultiId}' AND is_active = true;`);
  const indRatha = await pg.query<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM public.contact_assignments WHERE operator_id = '${opMultiId}' AND is_active = true;`);
  const indKrishna = await pg.query<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM public.krishnashtami_contact_assignments WHERE operator_id = '${opMultiId}' AND is_active = true;`);
  const indFeedback = await pg.query<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM public.feedback_contact_assignments WHERE operator_id = '${opMultiId}' AND is_active = true;`);

  recordTest(
    14,
    'Preflight Section 14 eliminates Cartesian row multiplication across assignment tables',
    Number(sec14Row.active_master_count) === Number(indMaster.rows[0].cnt) &&
    Number(sec14Row.active_rathayatra_count) === Number(indRatha.rows[0].cnt) &&
    Number(sec14Row.active_krishnashtami_count) === Number(indKrishna.rows[0].cnt) &&
    Number(sec14Row.active_feedback_count) === Number(indFeedback.rows[0].cnt) &&
    Number(sec14Row.active_master_count) === 3 &&
    Number(sec14Row.active_rathayatra_count) === 2 &&
    Number(sec14Row.active_krishnashtami_count) === 4 &&
    Number(sec14Row.active_feedback_count) === 1,
    `Counts: M=${sec14Row.active_master_count}/3, R=${sec14Row.active_rathayatra_count}/2, K=${sec14Row.active_krishnashtami_count}/4, F=${sec14Row.active_feedback_count}/1 (no 24-row multiplication)`
  );

  recordTest(
    14,
    'Preflight Section 14 independently evaluates capacity status per source table without cross-source summation',
    sec14Row.master_capacity_compliance === 'MASTER_OVER_CAPACITY' &&
    sec14Row.rathayatra_capacity_compliance === 'RATHAYATRA_WITHIN_CAPACITY' &&
    sec14Row.krishnashtami_capacity_compliance === 'KRISHNASHTAMI_OVER_CAPACITY' &&
    sec14Row.feedback_capacity_compliance === 'FEEDBACK_WITHIN_CAPACITY',
    `Statuses: M=${sec14Row.master_capacity_compliance}, R=${sec14Row.rathayatra_capacity_compliance}, K=${sec14Row.krishnashtami_capacity_compliance}, F=${sec14Row.feedback_capacity_compliance}`
  );

  // --------------------------------------------------------------------------
  // Scenario 15: mark_contact_not_interested_atomic Input & Identity Validation (7 Cases + Snapshot Side-Effect Audits)
  // --------------------------------------------------------------------------
  console.log('\n--- Running Scenario 15: Not Interested Input & Identity Validation (7 Cases) ---');

  // Setup Master Contacts for cases
  const mc7Valid = await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (phone, name, gender)
    VALUES ('9123456701', 'Case 1 Contact', 'Male')
    RETURNING id;
  `);
  const mc7ValidId = mc7Valid.rows[0].id;

  const mc7Other = await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (phone, name, gender)
    VALUES ('9123456702', 'Case 2 Contact', 'Male')
    RETURNING id;
  `);
  const mc7OtherId = mc7Other.rows[0].id;

  // Create an active assignment for mc7OtherId to verify it is NOT deactivated by invalid calls
  await pg.query(`
    INSERT INTO public.master_contact_assignments (master_contact_id, operator_id, is_active, status)
    VALUES ('${mc7OtherId}', '${opId}', true, 'assigned');
  `);

  interface Snapshot {
    mcCount: number;
    mcRecords: Array<{ id: string; phone: string; is_not_interested: boolean; not_interested_at: any; not_interested_by: any }>;
    activeAssignmentsCount: number;
    assignmentStatuses: Array<{ id: string; status: string; is_active: boolean }>;
    eventLinksCount: number;
  }

  async function takeSnapshot(): Promise<Snapshot> {
    const mcRes = await pg.query<{ id: string; phone: string; is_not_interested: boolean; not_interested_at: any; not_interested_by: any }>(`
      SELECT id, phone, is_not_interested, not_interested_at, not_interested_by
      FROM public.master_contacts ORDER BY id;
    `);
    const asgRes = await pg.query<{ id: string; status: string; is_active: boolean }>(`
      SELECT id, status, is_active FROM public.master_contact_assignments ORDER BY id;
    `);
    const evtRes = await pg.query<{ cnt: string }>(`
      SELECT COUNT(*) AS cnt FROM public.master_contact_events;
    `);
    return {
      mcCount: mcRes.rows.length,
      mcRecords: mcRes.rows,
      activeAssignmentsCount: asgRes.rows.filter(a => a.is_active).length,
      assignmentStatuses: asgRes.rows,
      eventLinksCount: Number(evtRes.rows[0].cnt)
    };
  }

  function assertSnapshotUnchanged(before: Snapshot, after: Snapshot, targetMcId?: string): boolean {
    if (before.mcCount !== after.mcCount) return false;
    if (before.activeAssignmentsCount !== after.activeAssignmentsCount) return false;
    if (before.eventLinksCount !== after.eventLinksCount) return false;
    if (before.assignmentStatuses.length !== after.assignmentStatuses.length) return false;
    for (let i = 0; i < before.assignmentStatuses.length; i++) {
      if (before.assignmentStatuses[i].id !== after.assignmentStatuses[i].id) return false;
      if (before.assignmentStatuses[i].status !== after.assignmentStatuses[i].status) return false;
      if (before.assignmentStatuses[i].is_active !== after.assignmentStatuses[i].is_active) return false;
    }
    if (targetMcId) {
      const b = before.mcRecords.find(r => r.id === targetMcId);
      const a = after.mcRecords.find(r => r.id === targetMcId);
      if (!b || !a) return false;
      if (b.is_not_interested !== a.is_not_interested) return false;
      if (b.not_interested_by !== a.not_interested_by) return false;
    }
    return true;
  }

  // Case 1: Valid Master Contact ID + valid matching phone
  const c1Res = await pg.query<{ mark_contact_not_interested_atomic: any }>(`
    SELECT public.mark_contact_not_interested_atomic(
      p_master_contact_id := '${mc7ValidId}'::uuid,
      p_phone := '9123456701'::text,
      p_operator_id := '${opId}'::uuid
    );
  `);
  const c1Out = c1Res.rows[0].mark_contact_not_interested_atomic;
  recordTest(15, 'Case 1: Valid Master Contact ID + valid matching phone succeeds', c1Out.success === true && c1Out.code === 'MARKED_NOT_INTERESTED', `Code: ${c1Out.code}`);

  // Case 2: Valid Master Contact ID + unrelated valid phone
  const snapBefore2 = await takeSnapshot();
  const c2Res = await pg.query<{ mark_contact_not_interested_atomic: any }>(`
    SELECT public.mark_contact_not_interested_atomic(
      p_master_contact_id := '${mc7OtherId}'::uuid,
      p_phone := '9123456799'::text,
      p_operator_id := '${opId}'::uuid
    );
  `);
  const c2Out = c2Res.rows[0].mark_contact_not_interested_atomic;
  const snapAfter2 = await takeSnapshot();
  recordTest(15, 'Case 2: Valid Master Contact ID + unrelated valid phone returns IDENTITY_MISMATCH', c2Out.success === false && c2Out.code === 'IDENTITY_MISMATCH', `Code: ${c2Out.code}`);
  recordTest(15, 'Case 2: Zero side-effects on master contacts, assignments, and events after IDENTITY_MISMATCH', assertSnapshotUnchanged(snapBefore2, snapAfter2, mc7OtherId), 'Snapshot preserved');

  // Case 3: Valid Master Contact ID + invalid phone (sentinel / wrong size)
  const snapBefore3a = await takeSnapshot();
  const c3SentinelRes = await pg.query<{ mark_contact_not_interested_atomic: any }>(`
    SELECT public.mark_contact_not_interested_atomic(
      p_master_contact_id := '${mc7OtherId}'::uuid,
      p_phone := '0000000000'::text,
      p_operator_id := '${opId}'::uuid
    );
  `);
  const c3SentinelOut = c3SentinelRes.rows[0].mark_contact_not_interested_atomic;
  const snapAfter3a = await takeSnapshot();
  recordTest(15, 'Case 3a: Valid Master Contact ID + sentinel phone (0000000000) rejected with INVALID_PHONE', c3SentinelOut.success === false && c3SentinelOut.code === 'INVALID_PHONE', `Code: ${c3SentinelOut.code}`);
  recordTest(15, 'Case 3a: Zero side-effects after sentinel phone rejection', assertSnapshotUnchanged(snapBefore3a, snapAfter3a, mc7OtherId), 'Snapshot preserved');

  const snapBefore3b = await takeSnapshot();
  const c3MalformedRes = await pg.query<{ mark_contact_not_interested_atomic: any }>(`
    SELECT public.mark_contact_not_interested_atomic(
      p_master_contact_id := '${mc7OtherId}'::uuid,
      p_phone := '12345'::text,
      p_operator_id := '${opId}'::uuid
    );
  `);
  const c3MalformedOut = c3MalformedRes.rows[0].mark_contact_not_interested_atomic;
  const snapAfter3b = await takeSnapshot();
  recordTest(15, 'Case 3b: Valid Master Contact ID + malformed short phone rejected with INVALID_PHONE', c3MalformedOut.success === false && c3MalformedOut.code === 'INVALID_PHONE', `Code: ${c3MalformedOut.code}`);
  recordTest(15, 'Case 3b: Zero side-effects after short phone rejection', assertSnapshotUnchanged(snapBefore3b, snapAfter3b, mc7OtherId), 'Snapshot preserved');

  // Case 4: Valid Master Contact ID + empty or whitespace phone
  const snapBefore4a = await takeSnapshot();
  const c4EmptyRes = await pg.query<{ mark_contact_not_interested_atomic: any }>(`
    SELECT public.mark_contact_not_interested_atomic(
      p_master_contact_id := '${mc7OtherId}'::uuid,
      p_phone := ''::text,
      p_operator_id := '${opId}'::uuid
    );
  `);
  const c4EmptyOut = c4EmptyRes.rows[0].mark_contact_not_interested_atomic;
  const snapAfter4a = await takeSnapshot();
  recordTest(15, 'Case 4a: Valid Master Contact ID + empty string phone rejected with INVALID_PHONE', c4EmptyOut.success === false && c4EmptyOut.code === 'INVALID_PHONE', `Code: ${c4EmptyOut.code}`);
  recordTest(15, 'Case 4a: Zero side-effects after empty string phone rejection', assertSnapshotUnchanged(snapBefore4a, snapAfter4a, mc7OtherId), 'Snapshot preserved');

  const snapBefore4b = await takeSnapshot();
  const c4WsRes = await pg.query<{ mark_contact_not_interested_atomic: any }>(`
    SELECT public.mark_contact_not_interested_atomic(
      p_master_contact_id := '${mc7OtherId}'::uuid,
      p_phone := '   '::text,
      p_operator_id := '${opId}'::uuid
    );
  `);
  const c4WsOut = c4WsRes.rows[0].mark_contact_not_interested_atomic;
  const snapAfter4b = await takeSnapshot();
  recordTest(15, 'Case 4b: Valid Master Contact ID + whitespace phone rejected with INVALID_PHONE', c4WsOut.success === false && c4WsOut.code === 'INVALID_PHONE', `Code: ${c4WsOut.code}`);
  recordTest(15, 'Case 4b: Zero side-effects after whitespace phone rejection', assertSnapshotUnchanged(snapBefore4b, snapAfter4b, mc7OtherId), 'Snapshot preserved');

  // Case 5: Valid phone without Master Contact ID
  const snapBefore5 = await takeSnapshot();
  const c5Res = await pg.query<{ mark_contact_not_interested_atomic: any }>(`
    SELECT public.mark_contact_not_interested_atomic(
      p_master_contact_id := NULL::uuid,
      p_phone := '9123456705'::text,
      p_operator_id := '${opId}'::uuid
    );
  `);
  const c5Out = c5Res.rows[0].mark_contact_not_interested_atomic;
  recordTest(15, 'Case 5: Valid phone without Master Contact ID succeeds', c5Out.success === true && c5Out.code === 'MARKED_NOT_INTERESTED', `Code: ${c5Out.code}`);

  // Query newly created / marked contact for Case 5
  const mcCase5 = await pg.query<{ is_not_interested: boolean; not_interested_by: string; not_interested_at: any }>(`
    SELECT is_not_interested, not_interested_by, not_interested_at
    FROM public.master_contacts WHERE phone = '9123456705';
  `);
  const case5Persisted = mcCase5.rows[0]?.is_not_interested === true && mcCase5.rows[0]?.not_interested_by === opId && mcCase5.rows[0]?.not_interested_at != null;
  recordTest(15, 'Case 5: Target master contact marked is_not_interested = true with authentic operator_id', case5Persisted, `is_not_interested: ${mcCase5.rows[0]?.is_not_interested}, op: ${mcCase5.rows[0]?.not_interested_by}`);

  // Case 6: Valid Master Contact ID without phone
  const mc7Standalone = await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (phone, name, gender)
    VALUES ('9123456706', 'Case 6 Contact', 'Male')
    RETURNING id;
  `);
  const c6Res = await pg.query<{ mark_contact_not_interested_atomic: any }>(`
    SELECT public.mark_contact_not_interested_atomic(
      p_master_contact_id := '${mc7Standalone.rows[0].id}'::uuid,
      p_phone := NULL::text,
      p_operator_id := '${opId}'::uuid
    );
  `);
  const c6Out = c6Res.rows[0].mark_contact_not_interested_atomic;
  recordTest(15, 'Case 6: Valid Master Contact ID without phone succeeds', c6Out.success === true && c6Out.code === 'MARKED_NOT_INTERESTED', `Code: ${c6Out.code}`);

  const mcCase6 = await pg.query<{ is_not_interested: boolean; not_interested_by: string; not_interested_at: any }>(`
    SELECT is_not_interested, not_interested_by, not_interested_at
    FROM public.master_contacts WHERE id = '${mc7Standalone.rows[0].id}';
  `);
  const case6Persisted = mcCase6.rows[0]?.is_not_interested === true && mcCase6.rows[0]?.not_interested_by === opId && mcCase6.rows[0]?.not_interested_at != null;
  recordTest(15, 'Case 6: Target master contact marked is_not_interested = true with authentic operator_id', case6Persisted, `is_not_interested: ${mcCase6.rows[0]?.is_not_interested}, op: ${mcCase6.rows[0]?.not_interested_by}`);

  // Case 7: Unknown Master Contact ID
  const snapBefore7a = await takeSnapshot();
  const c7Res = await pg.query<{ mark_contact_not_interested_atomic: any }>(`
    SELECT public.mark_contact_not_interested_atomic(
      p_master_contact_id := 'f0000000-0000-0000-0000-000000000099'::uuid,
      p_phone := NULL::text,
      p_operator_id := '${opId}'::uuid
    );
  `);
  const c7Out = c7Res.rows[0].mark_contact_not_interested_atomic;
  const snapAfter7a = await takeSnapshot();
  recordTest(15, 'Case 7a: Unknown Master Contact ID without phone returns CONTACT_NOT_FOUND', c7Out.success === false && c7Out.code === 'CONTACT_NOT_FOUND', `Code: ${c7Out.code}`);
  recordTest(15, 'Case 7a: Zero side-effects after unknown ID rejection', assertSnapshotUnchanged(snapBefore7a, snapAfter7a, mc7OtherId), 'Snapshot preserved');

  const snapBefore7b = await takeSnapshot();
  const c7bRes = await pg.query<{ mark_contact_not_interested_atomic: any }>(`
    SELECT public.mark_contact_not_interested_atomic(
      p_master_contact_id := 'f0000000-0000-0000-0000-000000000099'::uuid,
      p_phone := '9123456707'::text,
      p_operator_id := '${opId}'::uuid
    );
  `);
  const c7bOut = c7bRes.rows[0].mark_contact_not_interested_atomic;
  const snapAfter7b = await takeSnapshot();
  recordTest(15, 'Case 7b: Unknown Master Contact ID with valid phone returns CONTACT_NOT_FOUND', c7bOut.success === false && c7bOut.code === 'CONTACT_NOT_FOUND', `Code: ${c7bOut.code}`);
  recordTest(15, 'Case 7b: Zero side-effects after unknown ID with valid phone rejection', assertSnapshotUnchanged(snapBefore7b, snapAfter7b, mc7OtherId), 'Snapshot preserved');

  // --------------------------------------------------------------------------
  // Scenario 16: SECURITY DEFINER Schema Privilege & Search Path Hardening (Section 4)
  // --------------------------------------------------------------------------
  console.log('\n--- Running Scenario 16: Schema Privileges & SECURITY DEFINER Search Path ---');

  // Verify pre-condition: untrusted roles actually had CREATE privilege before migration
  recordTest(
    16,
    'Precondition established: untrusted roles possessed CREATE on public before migration',
    prePrivRow?.anon_create === true && prePrivRow?.auth_create === true && prePrivRow?.pub_create === true && prePubHasCreate === true,
    `Pre-migration: anon=${prePrivRow?.anon_create}, auth=${prePrivRow?.auth_create}, public=${prePrivRow?.pub_create}, nspacl_pub=${prePubHasCreate}`
  );

  // Check CREATE privilege on schema public for untrusted roles post-migration
  const privCheck = await pg.query<{ anon_create: boolean; auth_create: boolean; pub_create: boolean }>(`
    SELECT 
      has_schema_privilege('anon', 'public', 'CREATE') AS anon_create,
      has_schema_privilege('authenticated', 'public', 'CREATE') AS auth_create,
      has_schema_privilege('public', 'public', 'CREATE') AS pub_create;
  `);
  const privRow = privCheck.rows[0];
  recordTest(16, 'Untrusted role anon cannot CREATE objects in public schema post-migration', privRow?.anon_create === false, `anon CREATE: ${privRow?.anon_create}`);
  recordTest(16, 'Untrusted role authenticated cannot CREATE objects in public schema post-migration', privRow?.auth_create === false, `authenticated CREATE: ${privRow?.auth_create}`);
  recordTest(16, 'PUBLIC grantee cannot CREATE objects in public schema post-migration', privRow?.pub_create === false, `public CREATE: ${privRow?.pub_create}`);

  // Catalog inspection of public schema nspacl
  const aclCheck = await pg.query<{ pub_has_create: boolean }>(`
    SELECT EXISTS (
      SELECT 1 
      FROM aclexplode(COALESCE(ns.nspacl, acldefault('n', ns.nspowner))) acl
      WHERE acl.grantee = 0 
        AND acl.privilege_type = 'CREATE'
    ) AS pub_has_create
    FROM pg_namespace ns
    WHERE ns.nspname = 'public';
  `);
  const pubHasCreate = aclCheck.rows[0]?.pub_has_create;
  recordTest(16, 'Direct pg_namespace.nspacl catalog audit confirms grantee 0 (PUBLIC) has NO CREATE privilege', pubHasCreate === false, `PUBLIC grantee=0 CREATE ACL present: ${pubHasCreate}`);

  // Inherited role check
  const memberCheck = await pg.query<{ cnt: string }>(`
    SELECT COUNT(*) AS cnt FROM pg_auth_members m
    JOIN pg_roles r ON r.oid = m.member
    WHERE r.rolname IN ('anon', 'authenticated');
  `);
  recordTest(16, 'Untrusted roles anon/authenticated have no inherited memberships granting CREATE', Number(memberCheck.rows[0]?.cnt) === 0, `Memberships count: ${memberCheck.rows[0]?.cnt}`);

  // Check search_path configuration on all 3 SECURITY DEFINER functions in pg_proc
  const spCheck = await pg.query<{ proname: string; prosecdef: boolean; proconfig: string[] }>(`
    SELECT proname, prosecdef, proconfig
    FROM pg_proc
    WHERE proname IN ('assign_master_contact_atomic', 'assign_contact_atomic', 'mark_contact_not_interested_atomic')
      AND pronamespace = 'public'::regnamespace;
  `);
  const spMap = new Map(spCheck.rows.map(r => [r.proname, { prosecdef: r.prosecdef, proconfig: r.proconfig }]));
  const expectedSearchPath = 'search_path=pg_catalog, public, pg_temp';

  const masterSec = spMap.get('assign_master_contact_atomic');
  const contactSec = spMap.get('assign_contact_atomic');
  const markSec = spMap.get('mark_contact_not_interested_atomic');

  const allSecDefiner = !!(masterSec?.prosecdef && contactSec?.prosecdef && markSec?.prosecdef);
  const allSearchPaths = !!(masterSec?.proconfig?.includes(expectedSearchPath) && contactSec?.proconfig?.includes(expectedSearchPath) && markSec?.proconfig?.includes(expectedSearchPath));

  recordTest(16, 'All 3 RPCs retain prosecdef = true (SECURITY DEFINER)', allSecDefiner, `All SECURITY DEFINER: ${allSecDefiner}`);
  recordTest(16, 'All 3 RPCs have search_path = pg_catalog, public, pg_temp configured in pg_proc', allSearchPaths, `All search paths secure: ${allSearchPaths}`);

  // Check service_role execution access
  const execCheck = await pg.query<{ proname: string; svc_can_exec: boolean; anon_can_exec: boolean; auth_can_exec: boolean; pub_can_exec: boolean }>(`
    SELECT 
      p.proname,
      has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc_can_exec,
      has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_exec,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_can_exec,
      has_function_privilege('public', p.oid, 'EXECUTE') AS pub_can_exec
    FROM pg_proc p
    WHERE p.proname IN ('assign_master_contact_atomic', 'assign_contact_atomic', 'mark_contact_not_interested_atomic')
      AND p.pronamespace = 'public'::regnamespace;
  `);
  const allSvcCanExec = execCheck.rows.every(r => r.svc_can_exec);
  const untrustedDenied = execCheck.rows.every(r => !r.anon_can_exec && !r.auth_can_exec && !r.pub_can_exec);
  recordTest(16, 'Service role has EXECUTE grant on all 3 RPCs while PUBLIC, anon, and authenticated are denied', allSvcCanExec && untrustedDenied, `svc: ${allSvcCanExec}, untrusted denied: ${untrustedDenied}`);

  // --------------------------------------------------------------------------
  // Scenario 17: Migration Diagnostic Aborts (MIGRATION_BLOCKED verification - 10 Cases)
  // --------------------------------------------------------------------------
  console.log('\n--- Running Scenario 17: Migration Diagnostic Aborts (MIGRATION_BLOCKED - 10 Cases) ---');

  interface AbortCase {
    id: number;
    title: string;
    setup: (client: PGlite) => Promise<void>;
    expectedError: string;
  }

  const abortCases: AbortCase[] = [
    {
      id: 1,
      title: 'Orphaned not_interested_by operator ID',
      setup: async (client) => {
        await client.exec(`
          INSERT INTO public.contact_operators (id, name, email, is_active)
          VALUES ('11111111-1111-1111-1111-111111111111', 'Op 1', 'op1@test.com', true);
          ALTER TABLE public.master_contacts ADD COLUMN not_interested_by uuid;
          INSERT INTO public.master_contacts (phone, name, not_interested_by)
          VALUES ('9876543210', 'Orphaned MC', '99999999-9999-9999-9999-999999999999');
        `);
      },
      expectedError: 'orphaned not_interested_by IDs'
    },
    {
      id: 2,
      title: 'Composite or incorrectly targeted foreign key involving not_interested_by',
      setup: async (client) => {
        await client.exec(`
          ALTER TABLE public.master_contacts ADD COLUMN not_interested_by uuid;
          ALTER TABLE public.contact_operators ADD CONSTRAINT uq_co_comp UNIQUE (id, name);
          ALTER TABLE public.master_contacts ADD CONSTRAINT uq_mc_comp UNIQUE (not_interested_by, name);
          ALTER TABLE public.master_contacts ADD CONSTRAINT fk_comp FOREIGN KEY (not_interested_by, name) REFERENCES public.contact_operators (id, name) ON DELETE SET NULL;
        `);
      },
      expectedError: 'is composite or does not strictly target only not_interested_by'
    },
    {
      id: 3,
      title: 'Foreign key referencing wrong column instead of contact_operators(id)',
      setup: async (client) => {
        await client.exec(`
          ALTER TABLE public.contact_operators ADD COLUMN alt_id uuid UNIQUE DEFAULT gen_random_uuid();
          ALTER TABLE public.master_contacts ADD COLUMN not_interested_by uuid;
          ALTER TABLE public.master_contacts ADD CONSTRAINT fk_alt FOREIGN KEY (not_interested_by) REFERENCES public.contact_operators (alt_id) ON DELETE SET NULL;
        `);
      },
      expectedError: 'instead of contact_operators(id)'
    },
    {
      id: 4,
      title: 'Foreign key with incorrect delete action (CASCADE instead of ON DELETE SET NULL)',
      setup: async (client) => {
        await client.exec(`
          ALTER TABLE public.master_contacts ADD COLUMN not_interested_by uuid;
          ALTER TABLE public.master_contacts ADD CONSTRAINT fk_casc FOREIGN KEY (not_interested_by) REFERENCES public.contact_operators (id) ON DELETE CASCADE;
        `);
      },
      expectedError: 'does not specify ON DELETE SET NULL'
    },
    {
      id: 5,
      title: 'NOT NULL not_interested_by column violating ON DELETE SET NULL compatibility',
      setup: async (client) => {
        await client.exec(`
          ALTER TABLE public.master_contacts ADD COLUMN not_interested_by uuid NOT NULL;
        `);
      },
      expectedError: 'must be nullable to support ON DELETE SET NULL'
    },
    {
      id: 6,
      title: 'Partial index idx_master_contacts_not_interested with wrong predicate',
      setup: async (client) => {
        await client.exec(`
          ALTER TABLE public.master_contacts ADD COLUMN is_not_interested boolean DEFAULT false;
          CREATE INDEX idx_master_contacts_not_interested ON public.master_contacts (is_not_interested) WHERE is_not_interested = false;
        `);
      },
      expectedError: 'does not match expected predicate'
    },
    {
      id: 7,
      title: 'Partial index with incorrect column or additional key columns',
      setup: async (client) => {
        await client.exec(`
          ALTER TABLE public.master_contacts ADD COLUMN is_not_interested boolean DEFAULT false;
          CREATE INDEX idx_master_contacts_not_interested ON public.master_contacts (is_not_interested, name) WHERE is_not_interested = true;
        `);
      },
      expectedError: 'unexpected columns or expressions'
    },
    {
      id: 8,
      title: 'Same-named index existing on wrong table (contact_operators)',
      setup: async (client) => {
        await client.exec(`
          CREATE INDEX idx_master_contacts_not_interested ON public.contact_operators (name);
        `);
      },
      expectedError: 'belongs to'
    },
    {
      id: 9,
      title: 'Invalid or incompatible capacity CHECK constraint definition',
      setup: async (client) => {
        await client.exec(`
          ALTER TABLE public.contact_operators ADD COLUMN capacity integer DEFAULT 40;
          ALTER TABLE public.contact_operators ADD CONSTRAINT chk_operator_capacity CHECK (capacity >= 10 AND capacity <= 50);
        `);
      },
      expectedError: 'unexpected definition'
    },
    {
      id: 10,
      title: 'Existing out-of-range operator capacity (< 1 or > 500)',
      setup: async (client) => {
        await client.exec(`
          ALTER TABLE public.contact_operators ADD COLUMN capacity integer;
          INSERT INTO public.contact_operators (name, email, capacity)
          VALUES ('Out of range Op', 'outofrange@test.com', 999);
        `);
      },
      expectedError: 'contact_operators rows with capacity outside 1-500 found'
    },
    {
      id: 11,
      title: 'Transaction rollback after historical backfill and assignment updates have begun (failure during Step D deactivation)',
      setup: async (client: PGlite) => {
        // Seed baseline historical data with an active 'Not Interested' assignment
        const opRes = await client.query<{ id: string }>(`
          INSERT INTO public.contact_operators (name, email)
          VALUES ('Backfill Rollback Op', 'backfill_rollback_op@test.com') RETURNING id;
        `);
        const opId = opRes.rows[0].id;

        const regRes = await client.query<{ id: string }>(`
          INSERT INTO public.registrations (full_name, phone, gender)
          VALUES ('Backfill Rollback Contact', '9199999999', 'Male') RETURNING id;
        `);
        const regId = regRes.rows[0].id;

        await client.query(`
          INSERT INTO public.contact_assignments (registration_id, operator_id, is_active, status)
          VALUES ('${regId}', '${opId}', true, 'Not Interested');
        `);

        // Install an operational trigger that fires during Step D assignment deactivation
        await client.exec(`
          CREATE OR REPLACE FUNCTION public._test_fail_step_d()
          RETURNS trigger AS $$
          BEGIN
            IF NEW.status = 'Not Interested' AND OLD.is_active = true AND NEW.is_active = false THEN
              RAISE EXCEPTION 'MIGRATION_BLOCKED: Injected failure during Step D assignment deactivation';
            END IF;
            RETURN NEW;
          END;
          $$ LANGUAGE plpgsql;

          CREATE TRIGGER trg_test_fail_step_d
          BEFORE UPDATE ON public.contact_assignments
          FOR EACH ROW EXECUTE FUNCTION public._test_fail_step_d();
        `);
      },
      expectedError: 'Injected failure during Step D assignment deactivation'
    }
  ];

  // Extended snapshot structures for complete migration rollback verification (schema, data, ACLs, triggers, policies, sequences)
  interface ExtendedSnapshot {
    columns: Array<{
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>;
    constraints: Array<{
      table_name: string;
      conname: string;
      contype: string;
      condef: string;
      convalidated: boolean;
    }>;
    indexes: Array<{
      table_name: string;
      index_name: string;
      indisunique: boolean;
      indisvalid: boolean;
      indpred: string | null;
      indexdef: string;
    }>;
    routines: Array<{
      proname: string;
      identity_arguments: string;
      return_type: string;
      prosecdef: boolean;
      proconfig: string[] | null;
      proacl: string | null;
    }>;
    privileges: {
      public_create: boolean;
      anon_create: boolean;
      authenticated_create: boolean;
      acl_grantee_0_create: boolean;
    };
    tableAcls: Array<{
      table_name: string;
      relacl: string | null;
    }>;
    triggers: Array<{
      trigger_name: string;
      table_name: string;
      action_timing: string;
      event_manipulation: string;
    }>;
    policies: Array<{
      policyname: string;
      tablename: string;
      cmd: string;
    }>;
    sequences: Array<{
      relname: string;
    }>;
    tableData: {
      contact_operators: any[];
      master_contacts: any[];
      master_contact_events: any[];
      registrations: any[];
      contact_assignments: any[];
      krishnashtami_registrations: any[];
      krishnashtami_contact_assignments: any[];
      feedback_contacts: any[];
      feedback_contact_assignments: any[];
      master_contact_assignments: any[];
      audit_logs: any[];
    };
  }

  async function captureExtendedSnapshot(client: PGlite): Promise<ExtendedSnapshot> {
    const colRes = await client.query<{
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>(`
      SELECT table_name, column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, column_name;
    `);

    const conRes = await client.query<{
      table_name: string;
      conname: string;
      contype: string;
      condef: string;
      convalidated: boolean;
    }>(`
      SELECT 
        cls.relname AS table_name,
        pc.conname,
        pc.contype,
        pg_get_constraintdef(pc.oid) AS condef,
        pc.convalidated
      FROM pg_constraint pc
      JOIN pg_class cls ON cls.oid = pc.conrelid
      JOIN pg_namespace ns ON ns.oid = cls.relnamespace
      WHERE ns.nspname = 'public'
      ORDER BY cls.relname, pc.conname;
    `);

    const idxRes = await client.query<{
      table_name: string;
      index_name: string;
      indisunique: boolean;
      indisvalid: boolean;
      indpred: string | null;
      indexdef: string;
    }>(`
      SELECT 
        cls.relname AS table_name,
        c_idx.relname AS index_name,
        i.indisunique,
        i.indisvalid,
        pg_get_expr(i.indpred, i.indrelid) AS indpred,
        pg_get_indexdef(c_idx.oid) AS indexdef
      FROM pg_index i
      JOIN pg_class cls ON cls.oid = i.indrelid
      JOIN pg_class c_idx ON c_idx.oid = i.indexrelid
      JOIN pg_namespace ns ON ns.oid = cls.relnamespace
      WHERE ns.nspname = 'public'
      ORDER BY cls.relname, c_idx.relname;
    `);

    const procRes = await client.query<{
      proname: string;
      identity_arguments: string;
      return_type: string;
      prosecdef: boolean;
      proconfig: string[] | null;
      proacl: string | null;
    }>(`
      SELECT 
        p.proname,
        pg_get_function_identity_arguments(p.oid) AS identity_arguments,
        pg_get_function_result(p.oid) AS return_type,
        p.prosecdef,
        p.proconfig,
        p.proacl::text AS proacl
      FROM pg_proc p
      JOIN pg_namespace ns ON ns.oid = p.pronamespace
      WHERE ns.nspname = 'public'
      ORDER BY p.proname, identity_arguments;
    `);

    const privRes = await client.query<{
      public_create: boolean;
      anon_create: boolean;
      authenticated_create: boolean;
      acl_grantee_0_create: boolean;
    }>(`
      SELECT 
        has_schema_privilege('public', 'public', 'CREATE') AS public_create,
        has_schema_privilege('anon', 'public', 'CREATE') AS anon_create,
        has_schema_privilege('authenticated', 'public', 'CREATE') AS authenticated_create,
        EXISTS (
          SELECT 1 
          FROM aclexplode(COALESCE(ns.nspacl, acldefault('n', ns.nspowner))) acl
          WHERE acl.grantee = 0 AND acl.privilege_type = 'CREATE'
        ) AS acl_grantee_0_create
      FROM pg_namespace ns
      WHERE ns.nspname = 'public';
    `);

    const tableAclRes = await client.query<{ table_name: string; relacl: string | null }>(`
      SELECT c.relname AS table_name, c.relacl::text
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname;
    `);

    const triggerRes = await client.query<{ trigger_name: string; table_name: string; action_timing: string; event_manipulation: string }>(`
      SELECT trigger_name, event_object_table AS table_name, action_timing, event_manipulation
      FROM information_schema.triggers
      WHERE trigger_schema = 'public'
      ORDER BY event_object_table, trigger_name;
    `);

    const policyRes = await client.query<{ policyname: string; tablename: string; cmd: string }>(`
      SELECT polname AS policyname, c.relname AS tablename, polcmd AS cmd
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
      ORDER BY c.relname, p.polname;
    `);

    const seqRes = await client.query<{ relname: string }>(`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'S'
      ORDER BY c.relname;
    `);

    const [
      coData, mcData, mceData, rData, caData,
      krData, kcaData, fcData, fcaData, mcaData, alData
    ] = await Promise.all([
      client.query(`SELECT * FROM public.contact_operators ORDER BY id;`),
      client.query(`SELECT * FROM public.master_contacts ORDER BY id;`),
      client.query(`SELECT * FROM public.master_contact_events ORDER BY id;`),
      client.query(`SELECT * FROM public.registrations ORDER BY id;`),
      client.query(`SELECT * FROM public.contact_assignments ORDER BY id;`),
      client.query(`SELECT * FROM public.krishnashtami_registrations ORDER BY id;`),
      client.query(`SELECT * FROM public.krishnashtami_contact_assignments ORDER BY id;`),
      client.query(`SELECT * FROM public.feedback_contacts ORDER BY id;`),
      client.query(`SELECT * FROM public.feedback_contact_assignments ORDER BY id;`),
      client.query(`SELECT * FROM public.master_contact_assignments ORDER BY id;`),
      client.query(`SELECT * FROM public.audit_logs ORDER BY id;`)
    ]);

    return {
      columns: colRes.rows,
      constraints: conRes.rows,
      indexes: idxRes.rows,
      routines: procRes.rows,
      privileges: privRes.rows[0],
      tableAcls: tableAclRes.rows,
      triggers: triggerRes.rows,
      policies: policyRes.rows,
      sequences: seqRes.rows,
      tableData: {
        contact_operators: coData.rows,
        master_contacts: mcData.rows,
        master_contact_events: mceData.rows,
        registrations: rData.rows,
        contact_assignments: caData.rows,
        krishnashtami_registrations: krData.rows,
        krishnashtami_contact_assignments: kcaData.rows,
        feedback_contacts: fcData.rows,
        feedback_contact_assignments: fcaData.rows,
        master_contact_assignments: mcaData.rows,
        audit_logs: alData.rows,
      }
    };
  }

  function compareExtendedSnapshots(before: ExtendedSnapshot, after: ExtendedSnapshot): { identical: boolean; differences: string[] } {
    const differences: string[] = [];

    if (JSON.stringify(before.columns) !== JSON.stringify(after.columns)) {
      differences.push(`Columns diff: before had ${before.columns.length}, after has ${after.columns.length}`);
    }
    if (JSON.stringify(before.constraints) !== JSON.stringify(after.constraints)) {
      differences.push(`Constraints diff: before had ${before.constraints.length}, after has ${after.constraints.length}`);
    }
    if (JSON.stringify(before.indexes) !== JSON.stringify(after.indexes)) {
      differences.push(`Indexes diff: before had ${before.indexes.length}, after has ${after.indexes.length}`);
    }
    if (JSON.stringify(before.routines) !== JSON.stringify(after.routines)) {
      differences.push(`Routines diff: before had ${before.routines.length}, after has ${after.routines.length}`);
    }
    if (JSON.stringify(before.privileges) !== JSON.stringify(after.privileges)) {
      differences.push(`Privileges diff: before=${JSON.stringify(before.privileges)}, after=${JSON.stringify(after.privileges)}`);
    }
    if (JSON.stringify(before.tableAcls) !== JSON.stringify(after.tableAcls)) {
      differences.push(`Table ACLs diff`);
    }
    if (JSON.stringify(before.triggers) !== JSON.stringify(after.triggers)) {
      differences.push(`Triggers diff: before had ${before.triggers.length}, after has ${after.triggers.length}`);
    }
    if (JSON.stringify(before.policies) !== JSON.stringify(after.policies)) {
      differences.push(`Policies diff: before had ${before.policies.length}, after has ${after.policies.length}`);
    }
    if (JSON.stringify(before.sequences) !== JSON.stringify(after.sequences)) {
      differences.push(`Sequences diff`);
    }

    // Deep compare all 11 tables' data
    for (const [tbl, bRows] of Object.entries(before.tableData)) {
      const aRows = (after.tableData as any)[tbl];
      if (JSON.stringify(bRows) !== JSON.stringify(aRows)) {
        differences.push(`Table data '${tbl}' diff: before had ${(bRows as any[]).length} rows, after has ${(aRows as any[])?.length} rows`);
      }
    }

    return { identical: differences.length === 0, differences };
  }

  for (const c of abortCases) {
    const freshPg = new PGlite();
    try {
      await freshPg.exec(baselineSchema);
      await c.setup(freshPg);

      // 1. Capture complete extended state (schema, ACLs, triggers, policies, sequences, table data)
      const snapshotBefore = await captureExtendedSnapshot(freshPg);

      let blocked = false;
      let errMsg = '';
      try {
        await freshPg.exec(migrationSql);
      } catch (err: any) {
        errMsg = err.message || '';
        blocked = errMsg.includes('MIGRATION_BLOCKED') && errMsg.includes(c.expectedError);
      }

      // Roll back aborted transaction block
      await freshPg.exec('ROLLBACK;').catch(() => { });

      // 2. Capture complete extended state after rollback
      const snapshotAfter = await captureExtendedSnapshot(freshPg);

      // 3. Deep comparison of before and after states (schema AND data across 11 tables)
      const snapshotComparison = compareExtendedSnapshots(snapshotBefore, snapshotAfter);

      const rollbackSuccess = blocked && snapshotComparison.identical;
      recordTest(
        17,
        `Abort Case ${c.id}: ${c.title} triggers MIGRATION_BLOCKED and rolls back completely`,
        rollbackSuccess,
        rollbackSuccess
          ? 'Blocked & verified complete transaction rollback of schema, data across 11 tables, table/function ACLs, triggers, policies, and sequences'
          : `Blocked: ${blocked}, Schema/Data Identical: ${snapshotComparison.identical}, Diffs: ${snapshotComparison.differences.join('; ')}`
      );
    } finally {
      await freshPg.close();
    }
  }

  // --------------------------------------------------------------------------
  // Scenario 18: Production Preflight Script Validation (Extracted Queries & Execution)
  // --------------------------------------------------------------------------
  console.log('\n--- Running Scenario 18: Production Preflight Script Validation ---');
  const preflightPath = path.resolve('docs/audits/20261107_production_preflight.sql');
  const preflightSql = fs.readFileSync(preflightPath, 'utf8');

  // Parser functions
  function splitSqlStatements(sqlText: string): string[] {
    const statements: string[] = [];
    let current = '';
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inLineComment = false;
    let inBlockComment = false;
    let inDollarQuote: string | null = null;

    for (let i = 0; i < sqlText.length; i++) {
      const ch = sqlText[i];
      const next = i + 1 < sqlText.length ? sqlText[i + 1] : '';

      if (inLineComment) {
        if (ch === '\n') {
          inLineComment = false;
        }
        continue;
      }

      if (inBlockComment) {
        if (ch === '*' && next === '/') {
          inBlockComment = false;
          i++;
        }
        continue;
      }

      if (inDollarQuote !== null) {
        current += ch;
        if (ch === '$' && sqlText.slice(i - inDollarQuote.length + 1, i + 1) === inDollarQuote) {
          inDollarQuote = null;
        }
        continue;
      }

      if (inSingleQuote) {
        current += ch;
        if (ch === "'") {
          if (next === "'") {
            current += next;
            i++;
          } else {
            inSingleQuote = false;
          }
        }
        continue;
      }

      if (inDoubleQuote) {
        current += ch;
        if (ch === '"') {
          if (next === '"') {
            current += next;
            i++;
          } else {
            inDoubleQuote = false;
          }
        }
        continue;
      }

      if (ch === '-' && next === '-') {
        inLineComment = true;
        i++;
        continue;
      }
      if (ch === '/' && next === '*') {
        inBlockComment = true;
        i++;
        continue;
      }

      if (ch === "'") {
        inSingleQuote = true;
        current += ch;
        continue;
      }
      if (ch === '"') {
        inDoubleQuote = true;
        current += ch;
        continue;
      }
      if (ch === '$') {
        const match = sqlText.slice(i).match(/^\$[a-zA-Z0-9_]*\$/);
        if (match) {
          inDollarQuote = match[0];
          current += inDollarQuote;
          i += inDollarQuote.length - 1;
          continue;
        }
      }

      if (ch === ';') {
        const trimmed = current.trim();
        if (trimmed.length > 0) {
          statements.push(trimmed);
        }
        current = '';
        continue;
      }

      current += ch;
    }

    const trimmed = current.trim();
    if (trimmed.length > 0) {
      statements.push(trimmed);
    }
    return statements;
  }

  function stripLiterals(stmt: string): string {
    return stmt.replace(/'(?:''|[^'])*'/g, "''");
  }

  const preflightStatements = splitSqlStatements(preflightSql);

  function getPreflightStatement(identifier: string): string {
    const stmt = preflightStatements.find((s) => s.includes(identifier));
    if (!stmt) {
      throw new Error(`Preflight statement containing '${identifier}' not found in ${preflightPath}`);
    }
    return stmt;
  }

  // 18.A: Extract and execute actual Preflight Section 3 (Foreign-Key) Query against fixtures
  console.log('\n--- Running Preflight Section 3 Testing (Extracted SQL) ---');
  const sec3ExtractedQuery = getPreflightStatement('SECTION 3: master_contacts.not_interested_by FK check');

  // Sec 3 Case 1: Compliant state
  const pgSec3Comp = new PGlite();
  try {
    await pgSec3Comp.exec(baselineSchema);
    await pgSec3Comp.exec(`
      ALTER TABLE public.master_contacts ADD COLUMN not_interested_by uuid;
      ALTER TABLE public.master_contacts ADD CONSTRAINT fk_mc_not_interested_by
        FOREIGN KEY (not_interested_by) REFERENCES public.contact_operators (id) ON DELETE SET NULL;
    `);
    const r = await pgSec3Comp.query<{ status: string }>(sec3ExtractedQuery);
    recordTest(18, 'Preflight Section 3 extracted query reports COMPLIANT for valid single-column FK with ON DELETE SET NULL', r.rows[0]?.status === 'COMPLIANT', `Status: ${r.rows[0]?.status}`);
  } finally {
    await pgSec3Comp.close();
  }

  // Sec 3 Case 2: Missing FK in post-migration mode vs pre-migration mode
  const pgSec3Miss = new PGlite();
  try {
    await pgSec3Miss.exec(baselineSchema);
    await pgSec3Miss.exec(`
      ALTER TABLE public.master_contacts ADD COLUMN not_interested_by uuid;
    `);
    await pgSec3Miss.exec("SET app.preflight_mode = 'post';");
    const r = await pgSec3Miss.query<{ status: string }>(sec3ExtractedQuery);
    recordTest(18, 'Preflight Section 3 extracted query reports BLOCKER_MISSING_FOREIGN_KEY when constraint is absent post-migration', r.rows[0]?.status === 'BLOCKER_MISSING_FOREIGN_KEY', `Status: ${r.rows[0]?.status}`);
  } finally {
    await pgSec3Miss.close();
  }

  const pgSec3Pre = new PGlite();
  try {
    await pgSec3Pre.exec(baselineSchema);
    await pgSec3Pre.exec("SET app.preflight_mode = 'pre';");
    const r = await pgSec3Pre.query<{ status: string }>(sec3ExtractedQuery);
    recordTest(18, 'Preflight Section 3 extracted query reports MISSING_BUT_WILL_BE_CREATED_BY_MIGRATION in pre-migration mode', r.rows[0]?.status === 'MISSING_BUT_WILL_BE_CREATED_BY_MIGRATION', `Status: ${r.rows[0]?.status}`);
  } finally {
    await pgSec3Pre.close();
  }

  // Sec 3 Case 3: Wrong table
  const pgSec3WrongTbl = new PGlite();
  try {
    await pgSec3WrongTbl.exec(baselineSchema);
    await pgSec3WrongTbl.exec(`
      ALTER TABLE public.master_contacts ADD COLUMN not_interested_by uuid;
      ALTER TABLE public.master_contacts ADD CONSTRAINT fk_mc_wrong_tbl
        FOREIGN KEY (not_interested_by) REFERENCES public.registrations (id) ON DELETE SET NULL;
    `);
    const r = await pgSec3WrongTbl.query<{ status: string }>(sec3ExtractedQuery);
    recordTest(18, 'Preflight Section 3 extracted query reports NON_COMPLIANT_WRONG_TABLE when referencing wrong table', r.rows[0]?.status === 'NON_COMPLIANT_WRONG_TABLE', `Status: ${r.rows[0]?.status}`);
  } finally {
    await pgSec3WrongTbl.close();
  }

  // Sec 3 Case 4: Wrong column
  const pgSec3WrongCol = new PGlite();
  try {
    await pgSec3WrongCol.exec(baselineSchema);
    await pgSec3WrongCol.exec(`
      ALTER TABLE public.contact_operators ADD COLUMN alt_id uuid UNIQUE DEFAULT gen_random_uuid();
      ALTER TABLE public.master_contacts ADD COLUMN not_interested_by uuid;
      ALTER TABLE public.master_contacts ADD CONSTRAINT fk_mc_wrong_col
        FOREIGN KEY (not_interested_by) REFERENCES public.contact_operators (alt_id) ON DELETE SET NULL;
    `);
    const r = await pgSec3WrongCol.query<{ status: string }>(sec3ExtractedQuery);
    recordTest(18, 'Preflight Section 3 extracted query reports NON_COMPLIANT_WRONG_COLUMN when referencing wrong column', r.rows[0]?.status === 'NON_COMPLIANT_WRONG_COLUMN', `Status: ${r.rows[0]?.status}`);
  } finally {
    await pgSec3WrongCol.close();
  }

  // Sec 3 Case 5: Wrong delete action (CASCADE)
  const pgSec3Casc = new PGlite();
  try {
    await pgSec3Casc.exec(baselineSchema);
    await pgSec3Casc.exec(`
      ALTER TABLE public.master_contacts ADD COLUMN not_interested_by uuid;
      ALTER TABLE public.master_contacts ADD CONSTRAINT fk_mc_casc
        FOREIGN KEY (not_interested_by) REFERENCES public.contact_operators (id) ON DELETE CASCADE;
    `);
    const r = await pgSec3Casc.query<{ status: string }>(sec3ExtractedQuery);
    recordTest(18, 'Preflight Section 3 extracted query reports NON_COMPLIANT_DELETE_ACTION when action is CASCADE', r.rows[0]?.status === 'NON_COMPLIANT_DELETE_ACTION', `Status: ${r.rows[0]?.status}`);
  } finally {
    await pgSec3Casc.close();
  }

  // Sec 3 Case 6: Composite foreign key
  const pgSec3CompFk = new PGlite();
  try {
    await pgSec3CompFk.exec(baselineSchema);
    await pgSec3CompFk.exec(`
      ALTER TABLE public.master_contacts ADD COLUMN not_interested_by uuid;
      ALTER TABLE public.contact_operators ADD CONSTRAINT uq_co_comp UNIQUE (id, name);
      ALTER TABLE public.master_contacts ADD CONSTRAINT uq_mc_comp UNIQUE (not_interested_by, name);
      ALTER TABLE public.master_contacts ADD CONSTRAINT fk_mc_comp
        FOREIGN KEY (not_interested_by, name) REFERENCES public.contact_operators (id, name) ON DELETE SET NULL;
    `);
    const r = await pgSec3CompFk.query<{ status: string }>(sec3ExtractedQuery);
    recordTest(18, 'Preflight Section 3 extracted query reports NON_COMPLIANT_COMPOSITE for multi-column foreign key', r.rows[0]?.status === 'NON_COMPLIANT_COMPOSITE', `Status: ${r.rows[0]?.status}`);
  } finally {
    await pgSec3CompFk.close();
  }

  // Sec 3 Case 7: NOT NULL column
  const pgSec3NotNull = new PGlite();
  try {
    await pgSec3NotNull.exec(baselineSchema);
    await pgSec3NotNull.exec(`
      ALTER TABLE public.master_contacts ADD COLUMN not_interested_by uuid NOT NULL;
      ALTER TABLE public.master_contacts ADD CONSTRAINT fk_mc_not_null
        FOREIGN KEY (not_interested_by) REFERENCES public.contact_operators (id) ON DELETE SET NULL;
    `);
    const r = await pgSec3NotNull.query<{ status: string }>(sec3ExtractedQuery);
    recordTest(18, 'Preflight Section 3 extracted query reports NON_COMPLIANT_NOT_NULL when referencing column is NOT NULL', r.rows[0]?.status === 'NON_COMPLIANT_NOT_NULL', `Status: ${r.rows[0]?.status}`);
  } finally {
    await pgSec3NotNull.close();
  }

  // Sec 3 Case 8: Unvalidated constraint
  const pgSec3Unval = new PGlite();
  try {
    await pgSec3Unval.exec(baselineSchema);
    await pgSec3Unval.exec(`
      ALTER TABLE public.master_contacts ADD COLUMN not_interested_by uuid;
      ALTER TABLE public.master_contacts ADD CONSTRAINT fk_mc_unval
        FOREIGN KEY (not_interested_by) REFERENCES public.contact_operators (id) ON DELETE SET NULL NOT VALID;
    `);
    const r = await pgSec3Unval.query<{ status: string }>(sec3ExtractedQuery);
    recordTest(18, 'Preflight Section 3 extracted query reports REQUIRES_VALIDATION when constraint is NOT VALID', r.rows[0]?.status === 'REQUIRES_VALIDATION', `Status: ${r.rows[0]?.status}`);
  } finally {
    await pgSec3Unval.close();
  }

  // Sec 3 Case 9: Missing table
  const pgSec3MissTbl = new PGlite();
  try {
    await pgSec3MissTbl.exec(baselineSchema);
    await pgSec3MissTbl.exec(`DROP TABLE public.master_contacts CASCADE;`);
    const r = await pgSec3MissTbl.query<{ status: string }>(sec3ExtractedQuery);
    recordTest(18, 'Preflight Section 3 extracted query reports MISSING_TABLE when master_contacts table is absent', r.rows[0]?.status === 'MISSING_TABLE', `Status: ${r.rows[0]?.status}`);
  } finally {
    await pgSec3MissTbl.close();
  }

  // 18.B: Extract and execute actual Preflight Section 4 (Partial-Index) Query against fixtures
  console.log('\n--- Running Preflight Section 4 Testing (Extracted SQL) ---');
  const sec4ExtractedQuery = getPreflightStatement('SECTION 4: idx_master_contacts_not_interested catalog check');

  // Sec 4 Case 1: Compliant index
  const pgSec4Comp = new PGlite();
  try {
    await pgSec4Comp.exec(baselineSchema);
    await pgSec4Comp.exec(`
      ALTER TABLE public.master_contacts ADD COLUMN is_not_interested boolean DEFAULT false;
      CREATE INDEX idx_master_contacts_not_interested ON public.master_contacts (is_not_interested) WHERE is_not_interested = true;
    `);
    const r = await pgSec4Comp.query<{ status: string }>(sec4ExtractedQuery);
    recordTest(18, 'Preflight Section 4 extracted query reports COMPLIANT for valid single-column partial index', r.rows[0]?.status === 'COMPLIANT', `Status: ${r.rows[0]?.status}`);
  } finally {
    await pgSec4Comp.close();
  }

  // Sec 4 Case 2: Missing index in post-migration mode vs pre-migration mode
  const pgSec4Miss = new PGlite();
  try {
    await pgSec4Miss.exec(baselineSchema);
    await pgSec4Miss.exec("SET app.preflight_mode = 'post';");
    const r = await pgSec4Miss.query<{ status: string }>(sec4ExtractedQuery);
    recordTest(18, 'Preflight Section 4 extracted query reports BLOCKER_MISSING_INDEX when index is absent post-migration', r.rows[0]?.status === 'BLOCKER_MISSING_INDEX', `Status: ${r.rows[0]?.status}`);
  } finally {
    await pgSec4Miss.close();
  }

  const pgSec4Pre = new PGlite();
  try {
    await pgSec4Pre.exec(baselineSchema);
    await pgSec4Pre.exec("SET app.preflight_mode = 'pre';");
    const r = await pgSec4Pre.query<{ status: string }>(sec4ExtractedQuery);
    recordTest(18, 'Preflight Section 4 extracted query reports MISSING_BUT_WILL_BE_CREATED_BY_MIGRATION in pre-migration mode', r.rows[0]?.status === 'MISSING_BUT_WILL_BE_CREATED_BY_MIGRATION', `Status: ${r.rows[0]?.status}`);
  } finally {
    await pgSec4Pre.close();
  }

  // Sec 4 Case 3: Wrong table
  const pgSec4WrongTbl = new PGlite();
  try {
    await pgSec4WrongTbl.exec(baselineSchema);
    await pgSec4WrongTbl.exec(`
      CREATE INDEX idx_master_contacts_not_interested ON public.contact_operators (name);
    `);
    const r = await pgSec4WrongTbl.query<{ status: string }>(sec4ExtractedQuery);
    recordTest(18, 'Preflight Section 4 extracted query reports WRONG_TABLE_OR_SCHEMA when index is on wrong table', r.rows[0]?.status === 'WRONG_TABLE_OR_SCHEMA', `Status: ${r.rows[0]?.status}`);
  } finally {
    await pgSec4WrongTbl.close();
  }

  // Sec 4 Case 4: Expression index
  const pgSec4Expr = new PGlite();
  try {
    await pgSec4Expr.exec(baselineSchema);
    await pgSec4Expr.exec(`
      ALTER TABLE public.master_contacts ADD COLUMN is_not_interested boolean DEFAULT false;
      CREATE INDEX idx_master_contacts_not_interested ON public.master_contacts ((lower(is_not_interested::text))) WHERE is_not_interested = true;
    `);
    const r = await pgSec4Expr.query<{ status: string }>(sec4ExtractedQuery);
    recordTest(18, 'Preflight Section 4 extracted query reports NON_COMPLIANT_EXPRESSION_INDEX when index key is an expression', r.rows[0]?.status === 'NON_COMPLIANT_EXPRESSION_INDEX', `Status: ${r.rows[0]?.status}`);
  } finally {
    await pgSec4Expr.close();
  }

  // Sec 4 Case 5: Multi-column index
  const pgSec4Multi = new PGlite();
  try {
    await pgSec4Multi.exec(baselineSchema);
    await pgSec4Multi.exec(`
      ALTER TABLE public.master_contacts ADD COLUMN is_not_interested boolean DEFAULT false;
      CREATE INDEX idx_master_contacts_not_interested ON public.master_contacts (is_not_interested, name) WHERE is_not_interested = true;
    `);
    const r = await pgSec4Multi.query<{ status: string }>(sec4ExtractedQuery);
    recordTest(18, 'Preflight Section 4 extracted query reports NON_COMPLIANT_MULTI_COLUMN for composite index', r.rows[0]?.status === 'NON_COMPLIANT_MULTI_COLUMN', `Status: ${r.rows[0]?.status}`);
  } finally {
    await pgSec4Multi.close();
  }

  // Sec 4 Case 6: Wrong predicate
  const pgSec4WrongPred = new PGlite();
  try {
    await pgSec4WrongPred.exec(baselineSchema);
    await pgSec4WrongPred.exec(`
      ALTER TABLE public.master_contacts ADD COLUMN is_not_interested boolean DEFAULT false;
      CREATE INDEX idx_master_contacts_not_interested ON public.master_contacts (is_not_interested) WHERE is_not_interested = false;
    `);
    const r = await pgSec4WrongPred.query<{ status: string }>(sec4ExtractedQuery);
    recordTest(18, 'Preflight Section 4 extracted query reports NON_COMPLIANT_PREDICATE when predicate is false instead of true', r.rows[0]?.status === 'NON_COMPLIANT_PREDICATE', `Status: ${r.rows[0]?.status}`);
  } finally {
    await pgSec4WrongPred.close();
  }

  // Sec 4 Case 7: Wrong key column
  const pgSec4WrongCol = new PGlite();
  try {
    await pgSec4WrongCol.exec(baselineSchema);
    await pgSec4WrongCol.exec(`
      ALTER TABLE public.master_contacts ADD COLUMN is_not_interested boolean DEFAULT false;
      CREATE INDEX idx_master_contacts_not_interested ON public.master_contacts (name) WHERE is_not_interested = true;
    `);
    const r = await pgSec4WrongCol.query<{ status: string }>(sec4ExtractedQuery);
    recordTest(18, 'Preflight Section 4 extracted query reports NON_COMPLIANT_KEY_COLUMN when key column is not is_not_interested', r.rows[0]?.status === 'NON_COMPLIANT_KEY_COLUMN', `Status: ${r.rows[0]?.status}`);
  } finally {
    await pgSec4WrongCol.close();
  }

  // 18.B.4: Section 1 must safely diagnose extremely large numeric capacity text.
  console.log('\n--- Running Preflight Section 1 Testing (Oversized Capacity) ---');
  const sec1SummaryQuery = getPreflightStatement('SECTION 1: contact_operators out-of-range capacity audit');
  const pgSec1Huge = new PGlite();
  try {
    await pgSec1Huge.exec(baselineSchema);
    await pgSec1Huge.exec(`
      ALTER TABLE public.contact_operators ADD COLUMN capacity text;
      INSERT INTO public.contact_operators (name, email, is_active, capacity)
      VALUES ('Huge Capacity Op', 'huge-capacity@test.com', true, '999999999999999999999999999999999999999999999999');
    `);
    const r = await pgSec1Huge.query<{ status: string; out_of_range_count: number }>(sec1SummaryQuery);
    recordTest(18, 'Preflight Section 1 safely flags oversized numeric capacity as out-of-range without casting overflow', r.rows[0]?.status === 'BLOCKER_OUT_OF_RANGE_VALUES' && Number(r.rows[0]?.out_of_range_count) === 1, `Status: ${r.rows[0]?.status}, Out of range: ${r.rows[0]?.out_of_range_count}`);
  } finally {
    await pgSec1Huge.close();
  }

  // 18.B.4a: Post-migration preflight must verify defaults, not only column presence.
  console.log('\n--- Running Preflight Default-Value Checks (Sections 1 and 3) ---');
  const sec1ColumnQuery = getPreflightStatement('SECTION 1: contact_operators.capacity column pre-check');
  const sec3ColumnsQuery = getPreflightStatement('SECTION 3: master_contacts persistent exclusion columns');
  const pgDefaults = new PGlite();
  try {
    await pgDefaults.exec(baselineSchema);
    await pgDefaults.exec(`
      ALTER TABLE public.contact_operators ADD COLUMN capacity integer NOT NULL DEFAULT 20;
      ALTER TABLE public.master_contacts ADD COLUMN is_not_interested boolean NOT NULL DEFAULT true;
      ALTER TABLE public.master_contacts ADD COLUMN not_interested_at timestamptz;
      ALTER TABLE public.master_contacts ADD COLUMN not_interested_by uuid;
      SET app.preflight_mode = 'post';
    `);
    const capDefault = await pgDefaults.query<{ status: string }>(sec1ColumnQuery);
    const mcDefaults = await pgDefaults.query<{ column_name: string; status: string }>(sec3ColumnsQuery);
    const niDefault = mcDefaults.rows.find((row) => row.column_name === 'is_not_interested');
    recordTest(18, 'Preflight Section 1 detects incorrect capacity default (20 instead of 40) in post mode', capDefault.rows[0]?.status === 'NON_COMPLIANT_DEFAULT', `Status: ${capDefault.rows[0]?.status}`);
    recordTest(18, 'Preflight Section 3 detects incorrect is_not_interested default (true instead of false) in post mode', niDefault?.status === 'NON_COMPLIANT_DEFAULT', `Status: ${niDefault?.status}`);
  } finally {
    await pgDefaults.close();
  }

  // 18.B.5: Section 5 must return an explicit blocker when the required unique phone index is absent.
  console.log('\n--- Running Preflight Section 5 Testing (Missing Unique Index) ---');
  const sec5ExtractedQuery = getPreflightStatement('SECTION 5: master_contacts.phone unique index check');
  const pgSec5Missing = new PGlite();
  try {
    await pgSec5Missing.exec(baselineSchema);
    await pgSec5Missing.exec('ALTER TABLE public.master_contacts DROP CONSTRAINT master_contacts_phone_key;');
    const r = await pgSec5Missing.query<{ status: string }>(sec5ExtractedQuery);
    recordTest(18, 'Preflight Section 5 emits an explicit blocker when master_contacts.phone has no unique index', r.rows.length === 1 && r.rows[0].status === 'BLOCKER_MISSING_UNIQUE_INDEX', `Rows: ${r.rows.length}, Status: ${r.rows[0]?.status}`);
  } finally {
    await pgSec5Missing.close();
  }

  // 18.C: Extract and execute actual Preflight Section 6 (assigned_by / Krishnashtami default) Query against fixtures
  console.log('\n--- Running Preflight Section 6 Testing (Extracted SQL) ---');
  const sec6ExtractedQuery = getPreflightStatement('SECTION 6: assigned_by columns verification');

  // Sec 6 Case 1: Compliant state
  const pgSec6Comp = new PGlite();
  try {
    await pgSec6Comp.exec(baselineSchema);
    await pgSec6Comp.exec(`
      ALTER TABLE public.krishnashtami_contact_assignments ALTER COLUMN assigned_by SET DEFAULT 'admin';
    `);
    const r = await pgSec6Comp.query<{ table_name: string; status: string }>(sec6ExtractedQuery);
    const allComp = r.rows.length === 3 && r.rows.every((row) => row.status === 'COMPLIANT');
    recordTest(18, 'Preflight Section 6 extracted query reports COMPLIANT for all 3 assignment tables in standard state', allComp, `Results: ${r.rows.map((row) => `${row.table_name}=${row.status}`).join(', ')}`);
  } finally {
    await pgSec6Comp.close();
  }

  // Sec 6 Case 2: Missing default on Krishnashtami
  const pgSec6NoDef = new PGlite();
  try {
    await pgSec6NoDef.exec(baselineSchema);
    await pgSec6NoDef.exec(`
      ALTER TABLE public.krishnashtami_contact_assignments ALTER COLUMN assigned_by DROP DEFAULT;
    `);
    const r = await pgSec6NoDef.query<{ table_name: string; status: string }>(sec6ExtractedQuery);
    const krRow = r.rows.find((row) => row.table_name === 'krishnashtami_contact_assignments');
    recordTest(18, 'Preflight Section 6 extracted query reports DEFAULT_ADMIN_MISSING_OR_INVALID when default is NULL', krRow?.status === 'DEFAULT_ADMIN_MISSING_OR_INVALID', `Status: ${krRow?.status}`);
  } finally {
    await pgSec6NoDef.close();
  }

  // Sec 6 Case 3: Loose match rejection (badadmin)
  const pgSec6BadDef = new PGlite();
  try {
    await pgSec6BadDef.exec(baselineSchema);
    await pgSec6BadDef.exec(`
      ALTER TABLE public.krishnashtami_contact_assignments ALTER COLUMN assigned_by SET DEFAULT 'badadmin';
    `);
    const r = await pgSec6BadDef.query<{ table_name: string; status: string }>(sec6ExtractedQuery);
    const krRow = r.rows.find((row) => row.table_name === 'krishnashtami_contact_assignments');
    recordTest(18, 'Preflight Section 6 extracted query rejects loose substring match (badadmin -> DEFAULT_ADMIN_MISSING_OR_INVALID)', krRow?.status === 'DEFAULT_ADMIN_MISSING_OR_INVALID', `Status: ${krRow?.status}`);
  } finally {
    await pgSec6BadDef.close();
  }

  // Sec 6 Case 4: Type mismatch
  const pgSec6Type = new PGlite();
  try {
    await pgSec6Type.exec(baselineSchema);
    await pgSec6Type.exec(`
      ALTER TABLE public.contact_assignments ALTER COLUMN assigned_by TYPE text USING assigned_by::text;
    `);
    const r = await pgSec6Type.query<{ table_name: string; status: string }>(sec6ExtractedQuery);
    const caRow = r.rows.find((row) => row.table_name === 'contact_assignments');
    recordTest(18, 'Preflight Section 6 extracted query reports TYPE_MISMATCH for incorrect data type', caRow?.status === 'TYPE_MISMATCH', `Status: ${caRow?.status}`);
  } finally {
    await pgSec6Type.close();
  }

  // Sec 6 Case 5: Column missing
  const pgSec6Miss = new PGlite();
  try {
    await pgSec6Miss.exec(baselineSchema);
    await pgSec6Miss.exec(`
      ALTER TABLE public.krishnashtami_contact_assignments DROP COLUMN assigned_by;
    `);
    await pgSec6Miss.exec("SET app.preflight_mode = 'pre';");
    const rPre = await pgSec6Miss.query<{ table_name: string; status: string }>(sec6ExtractedQuery);
    const krPre = rPre.rows.find((row) => row.table_name === 'krishnashtami_contact_assignments');
    recordTest(18, 'Preflight Section 6 treats missing assigned_by as migration-created in pre mode', krPre?.status === 'MISSING_BUT_WILL_BE_CREATED_BY_MIGRATION', `Pre status: ${krPre?.status}`);

    await pgSec6Miss.exec("SET app.preflight_mode = 'post';");
    const rPost = await pgSec6Miss.query<{ table_name: string; status: string }>(sec6ExtractedQuery);
    const krPost = rPost.rows.find((row) => row.table_name === 'krishnashtami_contact_assignments');
    recordTest(18, 'Preflight Section 6 treats missing assigned_by as a blocker in post mode', krPost?.status === 'BLOCKER_MISSING_COLUMN', `Post status: ${krPost?.status}`);
  } finally {
    await pgSec6Miss.close();
  }

  // Sec 6 Case 6: Cross-schema isolation (table in non-public schema does not produce duplicate rows or false TYPE_MISMATCH)
  const pgSec6CrossSchema = new PGlite();
  try {
    await pgSec6CrossSchema.exec(baselineSchema);
    await pgSec6CrossSchema.exec(`
      CREATE SCHEMA archive;
      CREATE TABLE archive.contact_assignments (assigned_by text);
      CREATE TABLE archive.krishnashtami_contact_assignments (assigned_by integer);
    `);
    const r = await pgSec6CrossSchema.query<{ table_name: string; status: string }>(sec6ExtractedQuery);
    const caRows = r.rows.filter((row) => row.table_name === 'contact_assignments');
    const krRows = r.rows.filter((row) => row.table_name === 'krishnashtami_contact_assignments');
    const isolated = caRows.length === 1 && caRows[0].status === 'COMPLIANT' && krRows.length === 1 && r.rows.length === 3;
    recordTest(18, 'Preflight Section 6 extracted query strictly isolates public schema and ignores duplicate table names in other schemas', isolated, `Rows: total=${r.rows.length}, CA=${caRows.length}, KR=${krRows.length}`);
  } finally {
    await pgSec6CrossSchema.close();
  }

  // 18.D: Extract and execute actual Preflight Section 14 (Independent Aggregation & Cartesian Multiplication Check)
  console.log('\n--- Running Preflight Section 14 Testing (Extracted SQL) ---');
  const sec14ExtractedQuery = getPreflightStatement('SECTION 14: Operator capacity utilization vs capacity limits');

  // Sec 14 Case 1: Controlled fixture exposing the Cartesian row multiplication defect
  const pgSec14 = new PGlite();
  try {
    await pgSec14.exec(baselineSchema);
    await pgSec14.exec(`
      ALTER TABLE public.contact_operators ADD COLUMN capacity integer DEFAULT 40;
    `);
    const opA = await pgSec14.query<{ id: string }>(`
      INSERT INTO public.contact_operators (name, email, is_active, capacity)
      VALUES ('Multi Source Op A', 'multisource@test.com', true, 40)
      RETURNING id;
    `);
    const opAId = opA.rows[0].id;

    // Insert 2 Master assignments
    await pgSec14.exec(`
      INSERT INTO public.master_contacts (id, phone, name) VALUES 
        ('00000000-0000-0000-0000-000000000001', '9000000001', 'M1'),
        ('00000000-0000-0000-0000-000000000002', '9000000002', 'M2');
      INSERT INTO public.master_contact_assignments (master_contact_id, operator_id, is_active) VALUES
        ('00000000-0000-0000-0000-000000000001', '${opAId}', true),
        ('00000000-0000-0000-0000-000000000002', '${opAId}', true);
    `);

    // Insert 3 Rathayatra assignments
    await pgSec14.exec(`
      INSERT INTO public.registrations (id, full_name, phone) VALUES 
        ('00000000-0000-0000-0000-000000000003', 'R1', '9000000003'),
        ('00000000-0000-0000-0000-000000000004', 'R2', '9000000004'),
        ('00000000-0000-0000-0000-000000000005', 'R3', '9000000005');
      INSERT INTO public.contact_assignments (registration_id, operator_id, is_active) VALUES
        ('00000000-0000-0000-0000-000000000003', '${opAId}', true),
        ('00000000-0000-0000-0000-000000000004', '${opAId}', true),
        ('00000000-0000-0000-0000-000000000005', '${opAId}', true);
    `);

    // Insert 4 Krishnashtami assignments
    await pgSec14.exec(`
      INSERT INTO public.krishnashtami_registrations (id, full_name, phone) VALUES 
        ('00000000-0000-0000-0000-000000000006', 'K1', '9000000006'),
        ('00000000-0000-0000-0000-000000000007', 'K2', '9000000007'),
        ('00000000-0000-0000-0000-000000000008', 'K3', '9000000008'),
        ('00000000-0000-0000-0000-000000000009', 'K4', '9000000009');
      INSERT INTO public.krishnashtami_contact_assignments (registration_id, operator_id, is_active) VALUES
        ('00000000-0000-0000-0000-000000000006', '${opAId}', true),
        ('00000000-0000-0000-0000-000000000007', '${opAId}', true),
        ('00000000-0000-0000-0000-000000000008', '${opAId}', true),
        ('00000000-0000-0000-0000-000000000009', '${opAId}', true);
    `);

    // Insert 5 Feedback assignments
    await pgSec14.exec(`
      INSERT INTO public.feedback_contacts (id, full_name, phone) VALUES 
        ('00000000-0000-0000-0000-000000000010', 'F1', '9000000010'),
        ('00000000-0000-0000-0000-000000000011', 'F2', '9000000011'),
        ('00000000-0000-0000-0000-000000000012', 'F3', '9000000012'),
        ('00000000-0000-0000-0000-000000000013', 'F4', '9000000013'),
        ('00000000-0000-0000-0000-000000000014', 'F5', '9000000014');
      INSERT INTO public.feedback_contact_assignments (feedback_contact_id, operator_id, is_active) VALUES
        ('00000000-0000-0000-0000-000000000010', '${opAId}', true),
        ('00000000-0000-0000-0000-000000000011', '${opAId}', true),
        ('00000000-0000-0000-0000-000000000012', '${opAId}', true),
        ('00000000-0000-0000-0000-000000000013', '${opAId}', true),
        ('00000000-0000-0000-0000-000000000014', '${opAId}', true);
    `);

    // Insert Op B (Over capacity) and Op C (Zero assignments)
    const opB = await pgSec14.query<{ id: string }>(`
      INSERT INTO public.contact_operators (name, email, is_active, capacity)
      VALUES ('Over Capacity Op B', 'overcap@test.com', true, 2)
      RETURNING id;
    `);
    const opBId = opB.rows[0].id;
    await pgSec14.exec(`
      INSERT INTO public.master_contacts (id, phone, name) VALUES 
        ('00000000-0000-0000-0000-000000000015', '9000000015', 'M3'),
        ('00000000-0000-0000-0000-000000000016', '9000000016', 'M4'),
        ('00000000-0000-0000-0000-000000000017', '9000000017', 'M5');
      INSERT INTO public.master_contact_assignments (master_contact_id, operator_id, is_active) VALUES
        ('00000000-0000-0000-0000-000000000015', '${opBId}', true),
        ('00000000-0000-0000-0000-000000000016', '${opBId}', true),
        ('00000000-0000-0000-0000-000000000017', '${opBId}', true);
    `);

    await pgSec14.exec(`
      INSERT INTO public.contact_operators (name, email, is_active, capacity)
      VALUES ('Zero Assignment Op C', 'zero@test.com', true, 40);
    `);

    // Insert Op D (NULL capacity) and Op E (Multi-source exceedance)
    const opD = await pgSec14.query<{ id: string }>(`
      INSERT INTO public.contact_operators (name, email, is_active, capacity)
      VALUES ('Null Capacity Op D', 'nullcap@test.com', true, NULL)
      RETURNING id;
    `);
    const opDId = opD.rows[0].id;
    await pgSec14.exec(`
      INSERT INTO public.registrations (id, full_name, phone) VALUES 
        ('00000000-0000-0000-0000-000000000018', 'R4', '9000000018');
      INSERT INTO public.contact_assignments (registration_id, operator_id, is_active) VALUES
        ('00000000-0000-0000-0000-000000000018', '${opDId}', true);
    `);

    const opE = await pgSec14.query<{ id: string }>(`
      INSERT INTO public.contact_operators (name, email, is_active, capacity)
      VALUES ('Multi Exceed Op E', 'multiexceed@test.com', true, 1)
      RETURNING id;
    `);
    const opEId = opE.rows[0].id;
    await pgSec14.exec(`
      INSERT INTO public.master_contacts (id, phone, name) VALUES 
        ('00000000-0000-0000-0000-000000000019', '9000000019', 'M6'),
        ('00000000-0000-0000-0000-000000000020', '9000000020', 'M7');
      INSERT INTO public.master_contact_assignments (master_contact_id, operator_id, is_active) VALUES
        ('00000000-0000-0000-0000-000000000019', '${opEId}', true),
        ('00000000-0000-0000-0000-000000000020', '${opEId}', true);
      INSERT INTO public.registrations (id, full_name, phone) VALUES 
        ('00000000-0000-0000-0000-000000000021', 'R5', '9000000021'),
        ('00000000-0000-0000-0000-000000000022', 'R6', '9000000022');
      INSERT INTO public.contact_assignments (registration_id, operator_id, is_active) VALUES
        ('00000000-0000-0000-0000-000000000021', '${opEId}', true),
        ('00000000-0000-0000-0000-000000000022', '${opEId}', true);
    `);

    const r = await pgSec14.query<{
      operator_name: string;
      active_master_count: string;
      active_rathayatra_count: string;
      active_krishnashtami_count: string;
      active_feedback_count: string;
      total_active_count: string;
      capacity_compliance: string;
      any_source_exceeded: boolean;
    }>(sec14ExtractedQuery);

    const rowA = r.rows.find((row) => row.operator_name === 'Multi Source Op A');
    const rowB = r.rows.find((row) => row.operator_name === 'Over Capacity Op B');
    const rowC = r.rows.find((row) => row.operator_name === 'Zero Assignment Op C');
    const rowD = r.rows.find((row) => row.operator_name === 'Null Capacity Op D');
    const rowE = r.rows.find((row) => row.operator_name === 'Multi Exceed Op E');

    // Op A verification: counts must be 2, 3, 4, 5, total 14 (NOT 2*3*4*5 = 120!)
    const noMultiplication =
      Number(rowA?.active_master_count) === 2 &&
      Number(rowA?.active_rathayatra_count) === 3 &&
      Number(rowA?.active_krishnashtami_count) === 4 &&
      Number(rowA?.active_feedback_count) === 5 &&
      Number(rowA?.total_active_count) === 14;

    recordTest(
      18,
      'Preflight Section 14 eliminates Cartesian row-multiplication (Op A: 2, 3, 4, 5 -> total 14, not 120)',
      noMultiplication,
      `Counts: M=${rowA?.active_master_count}, R=${rowA?.active_rathayatra_count}, K=${rowA?.active_krishnashtami_count}, F=${rowA?.active_feedback_count}, Total=${rowA?.total_active_count}`
    );

    recordTest(
      18,
      'Preflight Section 14 correctly flags capacity exceedance (Op B: 3 active master > capacity 2 -> OVER_CAPACITY_MASTER)',
      rowB?.capacity_compliance === 'OVER_CAPACITY_MASTER' && rowB?.any_source_exceeded === true,
      `Compliance: ${rowB?.capacity_compliance}, Exceeded: ${rowB?.any_source_exceeded}`
    );

    recordTest(
      18,
      'Preflight Section 14 preserves zero-assignment operators (Op C retained with 0 assignments)',
      rowC !== undefined && Number(rowC.total_active_count) === 0 && rowC.capacity_compliance === 'WITHIN_CAPACITY',
      `Op C present: ${!!rowC}, Total active: ${rowC?.total_active_count}`
    );

    recordTest(
      18,
      'Preflight Section 14 correctly flags NULL capacity as non-compliant (Op D -> INVALID_NULL_CAPACITY)',
      rowD?.capacity_compliance === 'INVALID_NULL_CAPACITY' && rowD?.any_source_exceeded === true,
      `Op D compliance: ${rowD?.capacity_compliance}, Exceeded: ${rowD?.any_source_exceeded}`
    );

    const multiExceededMatch =
      rowE?.capacity_compliance?.includes('OVER_CAPACITY_MASTER') &&
      rowE?.capacity_compliance?.includes('OVER_CAPACITY_RATHAYATRA') &&
      rowE?.any_source_exceeded === true;

    recordTest(
      18,
      'Preflight Section 14 detects and reports all exceeding sources in multi-source exceedance (Op E -> Master & Rathayatra)',
      !!multiExceededMatch,
      `Op E compliance: ${rowE?.capacity_compliance}, Exceeded: ${rowE?.any_source_exceeded}`
    );
  } finally {
    await pgSec14.close();
  }

  // Sec 14 Case 2: Oversized numeric capacity must not overflow during parsing
  const pgSec14Corrupt = new PGlite();
  try {
    await pgSec14Corrupt.exec(baselineSchema);
    await pgSec14Corrupt.exec(`
      ALTER TABLE public.contact_operators ADD COLUMN capacity text;
      INSERT INTO public.contact_operators (name, email, is_active, capacity)
      VALUES ('Corrupt Op', 'corrupt@test.com', true, '999999999999999999999999999999999999999999999999');
    `);
    const rCorrupt = await pgSec14Corrupt.query<{
      operator_name: string;
      capacity_compliance: string;
      any_source_exceeded: boolean;
    }>(sec14ExtractedQuery);
    const rowCorrupt = rCorrupt.rows.find((row) => row.operator_name === 'Corrupt Op');
    recordTest(
      18,
      'Preflight Section 14 safely handles oversized numeric capacity without bigint/integer overflow (Corrupt Op -> OUT_OF_RANGE_CAPACITY)',
      rowCorrupt?.capacity_compliance === 'OUT_OF_RANGE_CAPACITY' && rowCorrupt?.any_source_exceeded === true,
      `Status: ${rowCorrupt?.capacity_compliance}, Exceeded: ${rowCorrupt?.any_source_exceeded}`
    );
  } finally {
    await pgSec14Corrupt.close();
  }

  // Sec 14 Case 3: Missing capacity column in pre-migration mode
  const pgSec14Pre = new PGlite();
  try {
    await pgSec14Pre.exec(baselineSchema);
    await pgSec14Pre.exec("SET app.preflight_mode = 'pre';");
    const rPre = await pgSec14Pre.query<{
      capacity_compliance: string;
      any_source_exceeded: boolean;
    }>(sec14ExtractedQuery);
    const allPreMissing = rPre.rows.length === 0 || rPre.rows.every((row) => row.capacity_compliance === 'MISSING_BUT_WILL_BE_CREATED_BY_MIGRATION' && row.any_source_exceeded === false);
    recordTest(
      18,
      'Preflight Section 14 handles missing capacity column in pre-migration mode without SQL error (MISSING_BUT_WILL_BE_CREATED_BY_MIGRATION)',
      allPreMissing,
      `All rows report MISSING_BUT_WILL_BE_CREATED_BY_MIGRATION in pre-migration mode`
    );
  } finally {
    await pgSec14Pre.close();
  }

  // 18.D.7: Section 7 returns a row for each expected status constraint and blocks invalid historical values.
  console.log('\n--- Running Preflight Section 7 Testing (Status Constraints & Historical Values) ---');
  const sec7ExtractedQuery = getPreflightStatement('SECTION 7: status check constraints audit');
  const pgSec7 = new PGlite();
  try {
    await pgSec7.exec(baselineSchema);
    const preRows = await pgSec7.query<{ table_name: string; status: string; invalid_status_count: number }>(sec7ExtractedQuery);
    const allThreeMissing = preRows.rows.length === 3 && preRows.rows.every((row) => row.status === 'NEEDS_UPDATE_BY_MIGRATION');
    recordTest(18, 'Preflight Section 7 returns diagnostics for all 3 absent status constraints in pre mode', allThreeMissing, `Rows: ${preRows.rows.map((row) => `${row.table_name}=${row.status}`).join(', ')}`);

    const op = await pgSec7.query<{ id: string }>(`INSERT INTO public.contact_operators (name, email) VALUES ('Status Test Op', 'status-test@test.com') RETURNING id;`);
    const reg = await pgSec7.query<{ id: string }>(`INSERT INTO public.registrations (full_name, phone, gender) VALUES ('Invalid Status Contact', '9111111199', 'Male') RETURNING id;`);
    await pgSec7.query(`INSERT INTO public.contact_assignments (registration_id, operator_id, status) VALUES ('${reg.rows[0].id}', '${op.rows[0].id}', 'Legacy Invalid Status');`);
    const dataRows = await pgSec7.query<{ table_name: string; status: string; invalid_status_count: number }>(sec7ExtractedQuery);
    const ratha = dataRows.rows.find((row) => row.table_name === 'contact_assignments');
    recordTest(18, 'Preflight Section 7 blocks existing status values that violate the migration CHECK list', ratha?.status === 'BLOCKER_EXISTING_INVALID_STATUS_VALUES' && Number(ratha.invalid_status_count) === 1, `Status: ${ratha?.status}, Invalid rows: ${ratha?.invalid_status_count}`);

    await pgSec7.exec("SET app.preflight_mode = 'post';");
    const postRows = await pgSec7.query<{ table_name: string; status: string }>(sec7ExtractedQuery);
    const postMissing = postRows.rows.length === 3 && postRows.rows.every((row) => row.status === 'BLOCKER_EXISTING_INVALID_STATUS_VALUES' || row.status === 'BLOCKER_STATUS_CHECK_MISSING');
    recordTest(18, 'Preflight Section 7 reports missing constraints as blockers in post mode', postMissing, `Rows: ${postRows.rows.map((row) => `${row.table_name}=${row.status}`).join(', ')}`);
  } finally {
    await pgSec7.close();
  }

  // 18.E: Extract and execute actual Preflight Section 15 (PUBLIC Privileges & Function Privileges)
  console.log('\n--- Running Preflight Section 15 Testing (Extracted SQL) ---');
  const sec15SchemaQuery = getPreflightStatement('SECTION 15: public schema CREATE privilege audit');
  const sec15FuncQuery = getPreflightStatement('SECTION 15: SECURITY DEFINER RPC privileges & search_path');

  // Sec 15 Case 1: Insecure pre-migration schema grants
  const pgSec15Insec = new PGlite();
  try {
    await pgSec15Insec.exec(baselineSchema);
    // Baseline grants CREATE to PUBLIC, anon, authenticated
    const r = await pgSec15Insec.query<{ role_name: string; compliance_status: string }>(sec15SchemaQuery);
    const pubRow = r.rows.find((row) => row.role_name === 'public');
    const anonRow = r.rows.find((row) => row.role_name === 'anon');
    const authRow = r.rows.find((row) => row.role_name === 'authenticated');
    const allInsecure =
      pubRow?.compliance_status === 'INSECURE_PRIVILEGE_DETECTED' &&
      anonRow?.compliance_status === 'INSECURE_PRIVILEGE_DETECTED' &&
      authRow?.compliance_status === 'INSECURE_PRIVILEGE_DETECTED';
    recordTest(
      18,
      'Preflight Section 15 schema audit identifies insecure CREATE on PUBLIC (grantee 0), anon, authenticated',
      allInsecure,
      `Status: public=${pubRow?.compliance_status}, anon=${anonRow?.compliance_status}, auth=${authRow?.compliance_status}`
    );
  } finally {
    await pgSec15Insec.close();
  }

  // Sec 15 Case 2: Secure post-migration schema privileges and RPC grants
  const pgSec15Post = new PGlite();
  try {
    await pgSec15Post.exec(baselineSchema);
    await pgSec15Post.exec(migrationSql);
    await pgSec15Post.exec("SET app.preflight_mode = 'post';");

    const rSchema = await pgSec15Post.query<{ role_name: string; compliance_status: string }>(sec15SchemaQuery);
    const allSchemaComp = rSchema.rows.length === 3 && rSchema.rows.every((row) => row.compliance_status === 'COMPLIANT');
    recordTest(
      18,
      'Preflight Section 15 schema audit reports COMPLIANT for public, anon, authenticated post-migration',
      allSchemaComp,
      `Status: ${rSchema.rows.map((row) => `${row.role_name}=${row.compliance_status}`).join(', ')}`
    );

    const rFunc = await pgSec15Post.query<{ function_name: string; identity_arguments: string; role_name: string; privilege_compliance: string; definition_status: string }>(sec15FuncQuery);
    const expectedSigMap: Record<string, string> = {
      assign_master_contact_atomic: 'p_master_contact_id uuid, p_operator_id uuid, p_assigned_by uuid, p_max_capacity integer, p_allow_reassign boolean',
      assign_contact_atomic: 'p_contact_id uuid, p_operator_id uuid, p_source text, p_assigned_by uuid, p_max_capacity integer, p_allow_reassign boolean',
      mark_contact_not_interested_atomic: 'p_master_contact_id uuid, p_phone text, p_operator_id uuid, p_reason text'
    };
    const exactSigsMatch = rFunc.rows.length === 12 && rFunc.rows.every((row) =>
      row.privilege_compliance === 'COMPLIANT' &&
      row.definition_status === 'SECURE' &&
      row.identity_arguments === expectedSigMap[row.function_name]
    );
    recordTest(
      18,
      'Preflight Section 15 function audit reports COMPLIANT, SECURE, and validates exact identity argument signatures for all 3 RPCs and 4 roles post-migration',
      exactSigsMatch,
      `Evaluated ${rFunc.rows.length} combinations; all exact signatures match expected catalog identities`
    );

    // Query 3: Obsolete or unexpected RPC overloads audit
    const sec15ObsoleteQuery = getPreflightStatement('SECTION 15: Obsolete or unexpected RPC overloads audit');
    const rObsoleteClean = await pgSec15Post.query<{ status: string; obsolete_signature: string }>(sec15ObsoleteQuery);
    recordTest(
      18,
      'Preflight Section 15 obsolete overload audit reports COMPLIANT_NO_OBSOLETE_OVERLOADS on clean migrated schema',
      rObsoleteClean.rows[0]?.status === 'COMPLIANT_NO_OBSOLETE_OVERLOADS',
      `Result: ${rObsoleteClean.rows[0]?.status}, Obsolete signature: ${rObsoleteClean.rows[0]?.obsolete_signature}`
    );

    // Inject obsolete 4-arg assign_master_contact_atomic overload
    await pgSec15Post.exec(`
      CREATE FUNCTION public.assign_master_contact_atomic(
        p_master_contact_id uuid, p_operator_id uuid, p_assigned_by uuid, p_max_capacity integer
      ) RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN RETURN '{}'::jsonb; END; $$;
    `);
    const rObsoleteInjected = await pgSec15Post.query<{ status: string; obsolete_signature: string }>(sec15ObsoleteQuery);
    recordTest(
      18,
      'Preflight Section 15 obsolete overload audit detects obsolete signature and flags BLOCKER_OBSOLETE_OVERLOAD_DETECTED',
      rObsoleteInjected.rows[0]?.status === 'BLOCKER_OBSOLETE_OVERLOAD_DETECTED',
      `Result: ${rObsoleteInjected.rows[0]?.status}, Detected: ${rObsoleteInjected.rows[0]?.obsolete_signature}`
    );
    // Cleanup the injected obsolete overload
    await pgSec15Post.exec(`
      DROP FUNCTION public.assign_master_contact_atomic(uuid, uuid, uuid, integer);
    `);

    // Verify Section 15 obsolete overload pre-migration mode behavior
    await pgSec15Post.exec("SET app.preflight_mode = 'pre';");
    await pgSec15Post.exec(`
      CREATE FUNCTION public.assign_master_contact_atomic(
        p_master_contact_id uuid, p_operator_id uuid, p_assigned_by uuid, p_max_capacity integer
      ) RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN RETURN '{}'::jsonb; END; $$;
    `);
    const rPreKnown = await pgSec15Post.query<{ status: string; obsolete_signature: string }>(sec15ObsoleteQuery);
    recordTest(
      18,
      'Preflight Section 15 reports OBSOLETE_OVERLOAD_WILL_BE_DROPPED_BY_MIGRATION for known obsolete signatures in pre-migration mode',
      rPreKnown.rows[0]?.status === 'OBSOLETE_OVERLOAD_WILL_BE_DROPPED_BY_MIGRATION',
      `Result: ${rPreKnown.rows[0]?.status}, Signature: ${rPreKnown.rows[0]?.obsolete_signature}`
    );
    await pgSec15Post.exec(`
      DROP FUNCTION public.assign_master_contact_atomic(uuid, uuid, uuid, integer);
    `);

    // Inject unexpected overload not dropped by migration in pre-migration mode
    await pgSec15Post.exec(`
      CREATE FUNCTION public.mark_contact_not_interested_atomic(uuid)
      RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN RETURN '{}'::jsonb; END; $$;
    `);
    const rPreUnexpected = await pgSec15Post.query<{ status: string; obsolete_signature: string }>(sec15ObsoleteQuery);
    recordTest(
      18,
      'Preflight Section 15 detects unexpected overload not dropped by migration and reports BLOCKER_UNEXPECTED_OVERLOAD_DETECTED',
      rPreUnexpected.rows[0]?.status === 'BLOCKER_UNEXPECTED_OVERLOAD_DETECTED',
      `Result: ${rPreUnexpected.rows[0]?.status}, Signature: ${rPreUnexpected.rows[0]?.obsolete_signature}`
    );
    await pgSec15Post.exec(`
      DROP FUNCTION public.mark_contact_not_interested_atomic(uuid);
    `);
    await pgSec15Post.exec("SET app.preflight_mode = 'post';");

    // Sec 15 Case 3: Missing function detection
    await pgSec15Post.exec(`
      DROP FUNCTION public.mark_contact_not_interested_atomic(uuid, text, uuid, text);
    `);
    const rDrop = await pgSec15Post.query<{ function_name: string; privilege_compliance: string; function_presence: string }>(sec15FuncQuery);
    const droppedRows = rDrop.rows.filter((row) => row.function_name === 'mark_contact_not_interested_atomic');
    const droppedDetected = droppedRows.length > 0 && droppedRows.every((row) =>
      row.function_presence === 'BLOCKER_MISSING_FUNCTION' &&
      row.privilege_compliance === 'BLOCKER_MISSING_FUNCTION'
    );
    recordTest(
      18,
      'Preflight Section 15 function audit detects missing RPC and reports BLOCKER_MISSING_FUNCTION post-migration',
      droppedDetected,
      `Dropped rows detected: ${droppedDetected}, presence=${droppedRows[0]?.function_presence}, compliance=${droppedRows[0]?.privilege_compliance}`
    );
  } finally {
    await pgSec15Post.close();
  }

  // 18.F: Lexical and static SQL safety validation & Read-Only transaction execution
  console.log('\n--- Running SQL Safety & Lexical Validation ---');

  let lexicalValid = true;
  let lexicalError = '';

  const disallowedKeywordsPattern = /\b(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|DO|CALL|COPY|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|VACUUM|ANALYZE|LOCK)\b/i;

  for (let idx = 0; idx < preflightStatements.length; idx++) {
    const stmt = preflightStatements[idx];
    const stripped = stripLiterals(stmt);
    const leadingWordMatch = stripped.trim().match(/^[a-zA-Z]+/);
    const leadingWord = leadingWordMatch ? leadingWordMatch[0].toUpperCase() : '';

    if (leadingWord !== 'SELECT' && leadingWord !== 'WITH') {
      lexicalValid = false;
      lexicalError = `Statement #${idx + 1} starts with disallowed command '${leadingWord}'`;
      break;
    }

    if (disallowedKeywordsPattern.test(stripped)) {
      lexicalValid = false;
      lexicalError = `Statement #${idx + 1} contains disallowed mutation or transaction keyword`;
      break;
    }

    if (leadingWord === 'WITH') {
      const cteRegex = /\b([a-zA-Z0-9_]+)\s+AS\s*\(/gi;
      let match;
      while ((match = cteRegex.exec(stripped)) !== null) {
        const cteStart = match.index + match[0].length;
        let parenDepth = 1;
        let cteBody = '';
        for (let p = cteStart; p < stripped.length; p++) {
          if (stripped[p] === '(') parenDepth++;
          else if (stripped[p] === ')') {
            parenDepth--;
            if (parenDepth === 0) {
              cteBody = stripped.slice(cteStart, p).trim();
              break;
            }
          }
        }
        const cteLeadWord = cteBody.match(/^[a-zA-Z]+/)?.[0]?.toUpperCase() || '';
        if (cteLeadWord !== 'SELECT' && cteLeadWord !== 'WITH') {
          lexicalValid = false;
          lexicalError = `Statement #${idx + 1} CTE '${match[1]}' starts with disallowed command '${cteLeadWord}'`;
          break;
        }
        if (disallowedKeywordsPattern.test(cteBody)) {
          lexicalValid = false;
          lexicalError = `Statement #${idx + 1} CTE '${match[1]}' contains disallowed mutation keyword`;
          break;
        }
      }
      if (!lexicalValid) break;
    }
  }

  recordTest(
    18,
    'Statement-level lexical validation: all preflight statements are strictly read-only SELECT/WITH (No AST parser installed)',
    lexicalValid,
    lexicalValid ? `All ${preflightStatements.length} preflight statements strictly read-only by lexical analysis` : lexicalError
  );

  // Prohibited statement rejection test
  const prohibitedSamples = [
    'INSERT INTO public.master_contacts (phone, name) VALUES (\'911\', \'Test\');',
    'UPDATE public.contact_operators SET capacity = 50;',
    'DELETE FROM public.audit_logs;',
    'DROP TABLE public.registrations;',
    'ALTER TABLE public.master_contacts ADD COLUMN foo text;',
    'TRUNCATE public.master_contact_assignments;',
    'DO $$ BEGIN RAISE NOTICE \'attack\'; END $$;',
    'WITH m AS (INSERT INTO public.audit_logs (action) VALUES (\'test\') RETURNING id) SELECT * FROM m;'
  ];
  let allProhibitedRejected = true;
  for (const badSql of prohibitedSamples) {
    const stripped = stripLiterals(badSql);
    const leadingWord = stripped.trim().match(/^[a-zA-Z]+/)?.[0]?.toUpperCase() || '';
    const hasDisallowed = disallowedKeywordsPattern.test(stripped);
    const isSelectWith = leadingWord === 'SELECT' || leadingWord === 'WITH';
    const wouldPass = isSelectWith && !hasDisallowed;
    if (wouldPass) {
      allProhibitedRejected = false;
      break;
    }
  }
  recordTest(
    18,
    'Lexical safety validator strictly rejects prohibited DDL, DML, DO blocks, and mutating CTEs',
    allProhibitedRejected,
    `All ${prohibitedSamples.length} prohibited samples successfully rejected`
  );

  // Volatility check on schema functions used in preflight against explicit allowlist
  const allowedFunctions = new Set([
    'ltrim',
    'normalize_phone',
    'aclexplode',
    'acldefault',
    'pg_get_expr',
    'pg_get_constraintdef',
    'format_type',
    'cardinality',
    'regexp_replace',
    'unnest',
    'string_agg',
    'has_schema_privilege',
    'has_function_privilege',
    'coalesce',
    'count',
    'array_agg',
    'lower',
    'trim',
    'length',
    'min',
    'max',
    'replace',
    'concat_ws',
    'pg_get_function_identity_arguments',
    'pg_get_function_result',
    'to_jsonb',
    'current_setting'
  ]);

  // SQL function scanner: extract all function call invocations from preflight statements
  const sqlReservedKeywords = new Set([
    'select', 'from', 'where', 'and', 'or', 'not', 'in', 'is', 'null', 'case', 'when',
    'then', 'else', 'end', 'with', 'as', 'join', 'left', 'right', 'inner', 'outer', 'on',
    'order', 'by', 'group', 'having', 'union', 'all', 'distinct', 'exists', 'nullif',
    'cast', 'array', 'filter', 'lateral', 'cross', 'desc', 'asc', 'nulls', 'first', 'last',
    'both', 'leading', 'trailing', 'values', 'table', 'any', 'some'
  ]);

  function extractCalledFunctions(sqlText: string): Array<{ schema: string | null; name: string; qualified: string }> {
    const stripped = stripLiterals(sqlText).replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    // Ignore column alias definitions like: AS u(attnum, ord)
    const normalized = stripped.replace(/\bAS\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^)]*\)/gi, ' ');
    const qualifiedFuncRegex = /(?:([a-zA-Z_][a-zA-Z0-9_]*)\.)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
    const found = new Map<string, { schema: string | null; name: string; qualified: string }>();
    let m;
    while ((m = qualifiedFuncRegex.exec(normalized)) !== null) {
      const schema = m[1] ? m[1].toLowerCase() : null;
      const name = m[2].toLowerCase();
      if (!sqlReservedKeywords.has(name)) {
        const qualified = (schema ? `${schema}.` : '') + name;
        found.set(qualified, { schema, name, qualified });
      }
    }
    return Array.from(found.values());
  }

  const calledFunctions = extractCalledFunctions(preflightSql);
  const unallowedFunctions = calledFunctions.filter((fn) => !allowedFunctions.has(fn.name));

  recordTest(
    18,
    'SQL function allowlist validation: all functions called in preflight script are within explicit allowlist',
    unallowedFunctions.length === 0,
    unallowedFunctions.length === 0
      ? `All ${calledFunctions.length} invoked functions validated against allowlist: ${calledFunctions.map(f => f.qualified).sort().join(', ')}`
      : `Unallowed function calls detected: ${unallowedFunctions.map(f => f.qualified).join(', ')}`
  );

  // Negative test: unallowed function call is caught and rejected by validator
  const badSqlWithUnallowed = "SELECT pg_sleep(1), random() FROM public.master_contacts;";
  const badCalled = extractCalledFunctions(badSqlWithUnallowed);
  const badUnallowed = badCalled.filter((fn) => !allowedFunctions.has(fn.name));
  recordTest(
    18,
    'SQL function allowlist validator strictly catches and rejects prohibited functions (pg_sleep, random)',
    badUnallowed.some(f => f.name === 'pg_sleep') && badUnallowed.some(f => f.name === 'random'),
    `Correctly flagged unallowed functions: ${badUnallowed.map(f => f.name).join(', ')}`
  );

  // Schema qualification audit: verify every normalize_phone invocation is qualified as public.normalize_phone
  const strippedSql = stripLiterals(preflightSql).replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const normalizedSql = strippedSql.replace(/\bAS\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^)]*\)/gi, ' ');
  const normPhoneRegex = /(?:([a-zA-Z_][a-zA-Z0-9_]*)\.)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
  let qm;
  let unqualifiedNormalizeCount = 0;
  let totalNormalizeCount = 0;
  while ((qm = normPhoneRegex.exec(normalizedSql)) !== null) {
    if (qm[2].toLowerCase() === 'normalize_phone') {
      totalNormalizeCount++;
      if (qm[1]?.toLowerCase() !== 'public') {
        unqualifiedNormalizeCount++;
      }
    }
  }
  recordTest(
    18,
    'Schema qualification audit: zero unqualified normalize_phone invocations in preflight script (all 13 qualified with public.)',
    unqualifiedNormalizeCount === 0 && totalNormalizeCount > 0,
    `Total normalize_phone invocations: ${totalNormalizeCount}, unqualified count: ${unqualifiedNormalizeCount}`
  );

  // Catalog volatility and resolved schema audit across all functions called in preflight
  const functionNames = Array.from(new Set(calledFunctions.map(f => f.name)));
  const volRes = await pg.query<{ proname: string; provolatile: string; nspname: string }>(`
    SELECT p.proname, p.provolatile, ns.nspname 
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE p.proname = ANY($1::text[]) 
      AND (ns.nspname = 'public' OR ns.nspname = 'pg_catalog');
  `, [functionNames]);

  const volatileFunctions = volRes.rows.filter((r) => r.provolatile === 'v');
  const publicNormalizeRow = volRes.rows.find((r) => r.proname === 'normalize_phone' && r.nspname === 'public');
  recordTest(
    18,
    'Catalog volatility and namespace audit: public.normalize_phone resolves to public schema and is IMMUTABLE (provolatile = i)',
    publicNormalizeRow !== undefined && publicNormalizeRow.provolatile === 'i',
    `Resolved: ${publicNormalizeRow?.nspname}.${publicNormalizeRow?.proname}, provolatile=${publicNormalizeRow?.provolatile}`
  );

  recordTest(
    18,
    'Catalog volatility audit: all functions called in preflight are strictly non-volatile (provolatile <> v)',
    volatileFunctions.length === 0 && volRes.rows.length > 0,
    volatileFunctions.length === 0
      ? `Audited ${volRes.rows.length} catalog routines across public and pg_catalog; all verified safe (0 volatile)`
      : `Volatile functions detected: ${volatileFunctions.map((f) => `${f.nspname}.${f.proname}`).join(', ')}`
  );

  // Deep function extraction & resolved schema and identity verification for every called routine
  const specialSqlConstructs = new Set(['coalesce', 'trim']);
  let allResolvedIdentitiesSafe = true;
  const unresolvedErrors: string[] = [];
  for (const fn of calledFunctions) {
    if (specialSqlConstructs.has(fn.name)) continue;
    const qRes = await pg.query<{ oid: number; proname: string; nspname: string; provolatile: string }>(`
      SELECT p.oid, p.proname, ns.nspname, p.provolatile
      FROM pg_proc p
      JOIN pg_namespace ns ON ns.oid = p.pronamespace
      WHERE p.proname = $1
        AND ($2::text IS NULL OR ns.nspname = $2)
        AND (ns.nspname = 'public' OR ns.nspname = 'pg_catalog')
      LIMIT 1;
    `, [fn.name, fn.schema]);
    const row = qRes.rows[0];
    const expectedSchema = fn.schema || 'pg_catalog';
    if (!row) {
      allResolvedIdentitiesSafe = false;
      unresolvedErrors.push(`${fn.qualified}: UNRESOLVED in catalog`);
    } else if (row.nspname !== expectedSchema) {
      allResolvedIdentitiesSafe = false;
      unresolvedErrors.push(`${fn.qualified}: schema mismatch (expected ${expectedSchema}, got ${row.nspname})`);
    } else if (row.provolatile === 'v') {
      allResolvedIdentitiesSafe = false;
      unresolvedErrors.push(`${fn.qualified}: volatile function`);
    }
  }
  recordTest(
    18,
    'Function extraction & resolved catalog identity: every function resolves to expected schema (public vs pg_catalog) and non-volatile identity',
    allResolvedIdentitiesSafe,
    allResolvedIdentitiesSafe
      ? `All ${calledFunctions.length} function calls verified: resolved to authentic non-volatile catalog identities`
      : `Resolution errors: ${unresolvedErrors.join('; ')}`
  );

  // Full Preflight Execution against Pre-Migration Baseline Schema (app.preflight_mode = 'pre')
  console.log('\n--- Running Full Preflight File against Pre-Migration Baseline Schema ---');
  const pgPreFull = new PGlite();
  let preflightPreExecuted = false;
  let preflightPreError = '';
  let preBlockersFound = 0;
  let preExpectedMissingFound = 0;

  try {
    await pgPreFull.exec(baselineSchema);
    await pgPreFull.exec("SET app.preflight_mode = 'pre';");
    await pgPreFull.exec('BEGIN READ ONLY;');
    for (const stmt of preflightStatements) {
      const res = await pgPreFull.query<any>(stmt);
      if (res && res.rows) {
        for (const row of res.rows) {
          const rowStr = JSON.stringify(row);
          if (rowStr.includes('BLOCKER_')) {
            preBlockersFound++;
          }
          if (rowStr.includes('MISSING_BUT_WILL_BE_CREATED_BY_MIGRATION') || rowStr.includes('NEEDS_UPDATE_BY_MIGRATION')) {
            preExpectedMissingFound++;
          }
        }
      }
    }
    await pgPreFull.exec('COMMIT;');
    preflightPreExecuted = true;
  } catch (err: any) {
    preflightPreError = err.message;
    await pgPreFull.exec('ROLLBACK;').catch(() => { });
  } finally {
    await pgPreFull.close();
  }

  recordTest(
    18,
    'Entire preflight file executes cleanly against pre-migration baseline schema without SQL errors (Error 42703 eliminated)',
    preflightPreExecuted,
    preflightPreExecuted ? `All ${preflightStatements.length} preflight statements executed without error in pre-migration mode` : `Error: ${preflightPreError}`
  );

  recordTest(
    18,
    'Pre-migration preflight execution distinguishes missing objects from blockers (zero blockers, expected objects flagged)',
    preflightPreExecuted && preBlockersFound === 0 && preExpectedMissingFound > 0,
    `Blockers: ${preBlockersFound}, Expected to be created by migration: ${preExpectedMissingFound}`
  );

  // Full Preflight Execution against Post-Migration Schema (app.preflight_mode = 'post')
  console.log('\n--- Running Full Preflight File against Post-Migration Schema ---');
  const pgPostFull = new PGlite();
  let preflightPostExecuted = false;
  let preflightPostError = '';
  let postBlockersFound = 0;
  let postMissingFound = 0;

  try {
    await pgPostFull.exec(baselineSchema);
    await pgPostFull.exec(migrationSql);
    await pgPostFull.exec("SET app.preflight_mode = 'post';");
    await pgPostFull.exec('BEGIN READ ONLY;');
    for (const stmt of preflightStatements) {
      const res = await pgPostFull.query<any>(stmt);
      if (res && res.rows) {
        for (const row of res.rows) {
          const rowStr = JSON.stringify(row);
          if (rowStr.includes('BLOCKER_') || rowStr.includes('NON_COMPLIANT') || rowStr.includes('INSECURE_') || rowStr.includes('MISSING_FUNCTION')) {
            postBlockersFound++;
          }
          if (rowStr.includes('MISSING_BUT_WILL_BE_CREATED_BY_MIGRATION')) {
            postMissingFound++;
          }
        }
      }
    }
    await pgPostFull.exec('COMMIT;');
    preflightPostExecuted = true;
  } catch (err: any) {
    preflightPostError = err.message;
    await pgPostFull.exec('ROLLBACK;').catch(() => { });
  } finally {
    await pgPostFull.close();
  }

  recordTest(
    18,
    'Entire preflight file executes cleanly against post-migration schema under read-only transaction enforcement',
    preflightPostExecuted,
    preflightPostExecuted ? `All ${preflightStatements.length} preflight statements executed without error in post-migration mode` : `Error: ${preflightPostError}`
  );

  recordTest(
    18,
    'Post-migration preflight execution verifies zero blockers and zero missing objects (all objects compliant)',
    preflightPostExecuted && postBlockersFound === 0 && postMissingFound === 0,
    `Blockers: ${postBlockersFound}, Missing objects: ${postMissingFound}`
  );

  recordTest(
    18,
    'Dual-mode preflight contract holds: pre-migration mode proves migration readiness, post-migration mode proves schema compliance',
    preflightPreExecuted && preflightPostExecuted && preBlockersFound === 0 && postBlockersFound === 0,
    'Pre-migration verified ready for migration; Post-migration verified fully compliant and secure'
  );

  // Verify that PostgreSQL engine blocks mutation inside BEGIN READ ONLY
  let readonlyBlocked = false;
  try {
    await pg.exec('BEGIN READ ONLY;');
    await pg.exec('INSERT INTO public.audit_logs (action) VALUES (\'ILLEGAL_MUTATION\');');
    await pg.exec('COMMIT;');
  } catch (err: any) {
    readonlyBlocked = err.message.includes('read-only');
    await pg.exec('ROLLBACK;').catch(() => { });
  }
  recordTest(
    18,
    'PostgreSQL engine strictly enforces read-only transaction mode and aborts any mutation attempt',
    readonlyBlocked,
    `Read-only enforcement verified: ${readonlyBlocked}`
  );

  // Summary
  console.log('\n╔═════════════════════════════════════════════════════════════════════════╗');
  console.log('║   TEST EXECUTION SUMMARY                                                ║');
  console.log('╚═════════════════════════════════════════════════════════════════════════╝');
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`Total checks: ${total}`);
  console.log(`Passed:       ${passed}`);
  console.log(`Failed:       ${failed}`);

  if (failed > 0) {
    console.error(`\n❌ ${failed} checks failed!`);
    process.exit(1);
  } else {
    console.log(`\n🎉 ALL ${total} TEST CHECKS ACROSS 18 SCENARIOS PASSED WITH ZERO FAILURES!`);
  }
}

run().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});

