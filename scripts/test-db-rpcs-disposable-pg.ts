/**
 * Disposable In-Memory PostgreSQL Integration Test Suite
 * Powered by @electric-sql/pglite (Real PostgreSQL 16 engine in WASM)
 * 
 * Verifies live PostgreSQL behaviors:
 * 1. Initial Assignment (Unassigned male contact -> Operator A)
 * 2. Idempotency (Same contact -> Operator A again returns ALREADY_ASSIGNED without duplicate rows)
 * 3. Default Reassign Guard (p_allow_reassign=false returns CONTACT_ALREADY_ASSIGNED; previous assignment untouched)
 * 4. Latest-Assignment-Wins Reassignment (p_allow_reassign=true deactivates previous, activates new, exactly 1 active assignment)
 * 5. Capacity Limit (40) & Rollback Preservation (Target operator at 40 rejects with OPERATOR_CAPACITY_EXCEEDED; previous assignment untouched)
 * 6. Female Restriction Guard (Female contact strictly rejected with GENDER_INELIGIBLE; 0 assignments)
 * 7. Security Permissions (REVOKE from anon/authenticated, GRANT to service_role)
 * 8. Concurrent Race Serialization (10 concurrent requests -> serialized cleanly, 1 winner, 0 duplicate active assignments)
 * 9. Per-Source Capacity & Isolation (Operator at 40 in Rathayatra can still be assigned in Krishnashtami and Master)
 */

import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

interface TestResult {
  suite: string;
  test: string;
  passed: boolean;
  details: string;
}

const testResults: TestResult[] = [];

function recordTest(suite: string, test: string, passed: boolean, details: string) {
  testResults.push({ suite, test, passed, details });
  if (passed) {
    console.log(`  ✅ [PASS] ${test}: ${details}`);
  } else {
    console.error(`  ❌ [FAIL] ${test}: ${details}`);
  }
}

async function runDisposablePgTests() {
  console.log('╔═════════════════════════════════════════════════════════════════════════╗');
  console.log('║   DISPOSABLE POSTGRESQL 16 INTEGRATION TEST SUITE                       ║');
  console.log('╚═════════════════════════════════════════════════════════════════════════╝\n');

  console.log('Initializing disposable in-memory PostgreSQL 16 instance...');
  const pg = new PGlite();

  // ─── Step 1: Create Database Schema ───────────────────────────────────────
  console.log('\nCreating schema, tables, partial unique indexes, and RLS policies...');
  await pg.exec(`
    -- Roles
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role;
      END IF;
    END
    $$;

    -- Tables
    CREATE TABLE public.contact_operators (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      operator_type TEXT NOT NULL DEFAULT 'operator',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE public.registrations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      gender TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE public.krishnashtami_registrations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      gender TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE public.feedback_contacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      gender TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE public.master_contacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      gender TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Assignment Tables
    CREATE TABLE public.contact_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      registration_id UUID NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
      operator_id UUID NOT NULL REFERENCES public.contact_operators(id) ON DELETE CASCADE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      status TEXT NOT NULL DEFAULT 'Pending',
      assigned_by UUID,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE public.krishnashtami_contact_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      registration_id UUID NOT NULL REFERENCES public.krishnashtami_registrations(id) ON DELETE CASCADE,
      operator_id UUID NOT NULL REFERENCES public.contact_operators(id) ON DELETE CASCADE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      status TEXT NOT NULL DEFAULT 'Pending',
      assigned_by UUID,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE public.feedback_contact_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      feedback_contact_id UUID NOT NULL REFERENCES public.feedback_contacts(id) ON DELETE CASCADE,
      operator_id UUID NOT NULL REFERENCES public.contact_operators(id) ON DELETE CASCADE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      status TEXT NOT NULL DEFAULT 'Assigned',
      assigned_by UUID,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE public.master_contact_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      master_contact_id UUID NOT NULL REFERENCES public.master_contacts(id) ON DELETE CASCADE,
      operator_id UUID NOT NULL REFERENCES public.contact_operators(id) ON DELETE CASCADE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      status TEXT NOT NULL DEFAULT 'assigned',
      assigned_by UUID,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Partial Unique Indexes
    CREATE UNIQUE INDEX uq_contact_assignments_active_reg
      ON public.contact_assignments(registration_id)
      WHERE is_active = TRUE;

    CREATE UNIQUE INDEX uq_krishnashtami_assignments_active_reg
      ON public.krishnashtami_contact_assignments(registration_id)
      WHERE is_active = TRUE;

    CREATE UNIQUE INDEX uq_feedback_assignments_active_contact
      ON public.feedback_contact_assignments(feedback_contact_id)
      WHERE is_active = TRUE;

    CREATE UNIQUE INDEX idx_unique_active_master_contact_assignment
      ON public.master_contact_assignments(master_contact_id)
      WHERE is_active = TRUE;

    -- Enable RLS
    ALTER TABLE public.contact_operators ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.krishnashtami_registrations ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.feedback_contacts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.master_contacts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.contact_assignments ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.krishnashtami_contact_assignments ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.feedback_contact_assignments ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.master_contact_assignments ENABLE ROW LEVEL SECURITY;
  `);
  console.log('✅ Schema & Partial Unique Indexes created successfully.');

  // ─── Step 2: Apply Migration 20261010150000 ───────────────────────────────
  console.log('\nApplying migration 20261010150000_latest_assignment_wins_atomic_rpcs.sql...');
  const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20261010150000_latest_assignment_wins_atomic_rpcs.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  await pg.exec(migrationSql);
  console.log('✅ Migration applied successfully.');

  // ─── Helper function to call assign_contact_atomic ─────────────────────────
  async function callContactAtomic(params: {
    contactId: string;
    operatorId: string;
    source: string;
    assignedBy?: string | null;
    maxCapacity?: number;
    allowReassign?: boolean;
  }) {
    const res = await pg.query<{ res: any }>(
      `SELECT public.assign_contact_atomic($1, $2, $3, $4, $5, $6) as res`,
      [
        params.contactId,
        params.operatorId,
        params.source,
        params.assignedBy ?? null,
        params.maxCapacity ?? 40,
        params.allowReassign ?? false,
      ]
    );
    return res.rows[0].res;
  }

  // ─── Helper function to call assign_master_contact_atomic ──────────────────
  async function callMasterAtomic(params: {
    masterContactId: string;
    operatorId: string;
    assignedBy?: string | null;
    maxCapacity?: number;
    allowReassign?: boolean;
  }) {
    const res = await pg.query<{ res: any }>(
      `SELECT public.assign_master_contact_atomic($1, $2, $3, $4, $5) as res`,
      [
        params.masterContactId,
        params.operatorId,
        params.assignedBy ?? null,
        params.maxCapacity ?? 40,
        params.allowReassign ?? false,
      ]
    );
    return res.rows[0].res;
  }

  // ─── Suite 1: Event Source (Rathayatra) Lifecycle Tests ───────────────────
  console.log('\n─── Suite 1: Rathayatra Assignment Lifecycle ───');
  
  // Seed Operators
  const opARes = await pg.query<{ id: string }>(`INSERT INTO public.contact_operators (name, email) VALUES ('Operator Alpha', 'alpha@test.com') RETURNING id`);
  const opBRes = await pg.query<{ id: string }>(`INSERT INTO public.contact_operators (name, email) VALUES ('Operator Beta', 'beta@test.com') RETURNING id`);
  const opCRes = await pg.query<{ id: string }>(`INSERT INTO public.contact_operators (name, email) VALUES ('Operator Gamma', 'gamma@test.com') RETURNING id`);
  const opA = opARes.rows[0].id;
  const opB = opBRes.rows[0].id;
  const opC = opCRes.rows[0].id;

  // Seed Contact
  const contactRes = await pg.query<{ id: string }>(`INSERT INTO public.registrations (full_name, phone, gender) VALUES ('Sita Rama', '9876543210', 'Male') RETURNING id`);
  const contact1 = contactRes.rows[0].id;

  // 1. Initial Assignment
  const r1 = await callContactAtomic({ contactId: contact1, operatorId: opA, source: 'rathayatra' });
  recordTest('Rathayatra', 'Initial Assignment', r1.success === true && r1.code === 'ASSIGNED', `Assigned to Op A with ID ${r1.assignment_id}`);

  // 2. Idempotency Check
  const r2 = await callContactAtomic({ contactId: contact1, operatorId: opA, source: 'rathayatra' });
  recordTest('Rathayatra', 'Idempotent Assignment', r2.success === true && r2.code === 'ALREADY_ASSIGNED' && r2.assignment_id === r1.assignment_id, `Returned existing assignment ID without duplicate rows`);

  const activeCount1 = await pg.query<{ count: any }>(`SELECT COUNT(*) FROM public.contact_assignments WHERE registration_id = $1 AND is_active = TRUE`, [contact1]);
  recordTest('Rathayatra', 'Active Count = 1 After Idempotency', Number(activeCount1.rows[0].count) === 1, `Active assignments count is exactly 1`);

  // 3. Reassignment Blocked by Default
  const r3 = await callContactAtomic({ contactId: contact1, operatorId: opB, source: 'rathayatra', allowReassign: false });
  recordTest('Rathayatra', 'Reassignment Blocked When allowReassign=false', r3.success === false && r3.code === 'CONTACT_ALREADY_ASSIGNED', `Rejected with CONTACT_ALREADY_ASSIGNED`);

  const activeOpAfterBlocked = await pg.query<{ operator_id: string }>(`SELECT operator_id FROM public.contact_assignments WHERE registration_id = $1 AND is_active = TRUE`, [contact1]);
  recordTest('Rathayatra', 'Original Operator Untouched On Blocked Reassign', activeOpAfterBlocked.rows[0].operator_id === opA, `Still assigned to Op A`);

  // 4. Successful Reassignment (Latest-Assignment-Wins)
  const r4 = await callContactAtomic({ contactId: contact1, operatorId: opB, source: 'rathayatra', allowReassign: true });
  recordTest('Rathayatra', 'Reassignment Succeeds When allowReassign=true', r4.success === true && r4.code === 'REASSIGNED', `Successfully reassigned to Op B`);

  const prevAssignmentCheck = await pg.query<{ is_active: boolean }>(`SELECT is_active FROM public.contact_assignments WHERE id = $1`, [r1.assignment_id]);
  recordTest('Rathayatra', 'Previous Assignment Deactivated', prevAssignmentCheck.rows[0].is_active === false, `Old assignment is_active set to FALSE`);

  const activeCountAfterReassign = await pg.query<{ count: any; operator_id: string }>(`SELECT COUNT(*) as count, MAX(operator_id::text) as operator_id FROM public.contact_assignments WHERE registration_id = $1 AND is_active = TRUE`, [contact1]);
  recordTest('Rathayatra', 'Exactly One Active Assignment Remains', Number(activeCountAfterReassign.rows[0].count) === 1 && activeCountAfterReassign.rows[0].operator_id === opB, `Exactly 1 active assignment belonging to Op B`);

  // 5. Capacity Limit (40) & Rollback Preservation
  console.log('\n─── Suite 2: Capacity Limit (40) & Rollback Preservation ───');
  // Seed Op C with 40 contacts
  for (let i = 0; i < 40; i++) {
    const dummyC = await pg.query<{ id: string }>(`INSERT INTO public.registrations (full_name, phone, gender) VALUES ('Dummy ${i}', '90000000${i}', 'Male') RETURNING id`);
    await callContactAtomic({ contactId: dummyC.rows[0].id, operatorId: opC, source: 'rathayatra' });
  }

  const opCCountBefore = await pg.query<{ count: any }>(`SELECT COUNT(*) FROM public.contact_assignments WHERE operator_id = $1 AND is_active = TRUE`, [opC]);
  recordTest('Capacity', 'Operator C Seeded to Max Capacity (40)', Number(opCCountBefore.rows[0].count) === 40, `Op C has exactly 40 active contacts`);

  // Try reassigning contact1 from Op B to Op C (who has 40)
  const r5 = await callContactAtomic({ contactId: contact1, operatorId: opC, source: 'rathayatra', allowReassign: true });
  recordTest('Capacity', 'Reassignment Rejected On Full Capacity', r5.success === false && r5.code === 'OPERATOR_CAPACITY_EXCEEDED', `Returned OPERATOR_CAPACITY_EXCEEDED`);

  // Verify Op B's active assignment was NOT deactivated (rollback preservation)
  const opBActiveCheck = await pg.query<{ is_active: boolean; operator_id: string }>(`SELECT is_active, operator_id FROM public.contact_assignments WHERE id = $1`, [r4.assignment_id]);
  recordTest('Capacity', 'Previous Active Assignment Preserved Untouched', opBActiveCheck.rows[0].is_active === true && opBActiveCheck.rows[0].operator_id === opB, `Op B assignment remains active = TRUE`);

  const opCCountAfter = await pg.query<{ count: any }>(`SELECT COUNT(*) FROM public.contact_assignments WHERE operator_id = $1 AND is_active = TRUE`, [opC]);
  recordTest('Capacity', 'Op C Count Not Exceeded (Still Exactly 40)', Number(opCCountAfter.rows[0].count) === 40, `Op C count remains 40/40`);

  // ─── Suite 3: Female-Contact Rejection ────────────────────────────────────
  console.log('\n─── Suite 3: Database-Level Female Restriction ───');
  const femaleReg = await pg.query<{ id: string }>(`INSERT INTO public.registrations (full_name, phone, gender) VALUES ('Radha Devi', '9123456789', 'Female') RETURNING id`);
  const rFemale = await callContactAtomic({ contactId: femaleReg.rows[0].id, operatorId: opA, source: 'rathayatra' });
  recordTest('Female Restriction', 'Event Female Contact Blocked at DB Level', rFemale.success === false && rFemale.code === 'GENDER_INELIGIBLE', `Rejected with GENDER_INELIGIBLE`);

  const femaleMaster = await pg.query<{ id: string }>(`INSERT INTO public.master_contacts (full_name, phone, gender) VALUES ('Radha Devi', '9123456789', 'female') RETURNING id`);
  const rFemaleMaster = await callMasterAtomic({ masterContactId: femaleMaster.rows[0].id, operatorId: opA });
  recordTest('Female Restriction', 'Master Female Contact Blocked at DB Level', rFemaleMaster.success === false && rFemaleMaster.code === 'GENDER_INELIGIBLE', `Rejected with GENDER_INELIGIBLE`);

  // ─── Suite 4: Master Dashboard Lifecycle Tests ────────────────────────────
  console.log('\n─── Suite 4: Master Dashboard Lifecycle ───');
  const master1 = await pg.query<{ id: string }>(`INSERT INTO public.master_contacts (full_name, phone, gender) VALUES ('Krishna Chaitanya', '9998887770', 'Male') RETURNING id`);
  const mId = master1.rows[0].id;

  // Master Initial Assignment
  const mr1 = await callMasterAtomic({ masterContactId: mId, operatorId: opA });
  recordTest('Master Dashboard', 'Master Contact Initial Assignment', mr1.success === true && mr1.code === 'ASSIGNED', `Assigned to Op A`);

  // Master Idempotency
  const mr2 = await callMasterAtomic({ masterContactId: mId, operatorId: opA });
  recordTest('Master Dashboard', 'Master Contact Idempotency', mr2.success === true && mr2.code === 'ALREADY_ASSIGNED' && mr2.assignment_id === mr1.assignment_id, `Returned existing assignment`);

  // Master Blocked Reassign
  const mr3 = await callMasterAtomic({ masterContactId: mId, operatorId: opB, allowReassign: false });
  recordTest('Master Dashboard', 'Master Contact Blocked When allowReassign=false', mr3.success === false && mr3.code === 'CONTACT_ALREADY_ASSIGNED', `Rejected with CONTACT_ALREADY_ASSIGNED`);

  // Master Reassignment
  const mr4 = await callMasterAtomic({ masterContactId: mId, operatorId: opB, allowReassign: true });
  recordTest('Master Dashboard', 'Master Contact Reassigned to Op B', mr4.success === true && mr4.code === 'REASSIGNED', `Reassigned to Op B`);

  const masterActiveCount = await pg.query<{ count: any; operator_id: string }>(`SELECT COUNT(*) as count, MAX(operator_id::text) as operator_id FROM public.master_contact_assignments WHERE master_contact_id = $1 AND is_active = TRUE`, [mId]);
  recordTest('Master Dashboard', 'Exactly 1 Active Master Assignment Remains', Number(masterActiveCount.rows[0].count) === 1 && masterActiveCount.rows[0].operator_id === opB, `Exactly 1 active master assignment belonging to Op B`);

  // ─── Suite 5: Direct RPC Permissions Check ────────────────────────────────
  console.log('\n─── Suite 5: Direct RPC Permissions ───');
  const permsCheck = await pg.query<{ proname: string; grantee: string }>(`
    SELECT p.proname, b.grantee
    FROM pg_proc p
    JOIN information_schema.routine_privileges b ON b.routine_name = p.proname
    WHERE p.proname IN ('assign_contact_atomic', 'assign_master_contact_atomic')
  `);
  
  const grantees = new Set(permsCheck.rows.map(r => r.grantee));
  const hasAuthenticated = grantees.has('authenticated');
  const hasAnon = grantees.has('anon');
  const hasPublic = grantees.has('PUBLIC');
  const hasServiceRole = grantees.has('service_role');

  recordTest('Permissions', 'Direct Execution Blocked for authenticated', !hasAuthenticated, `authenticated role has no EXECUTE grant`);
  recordTest('Permissions', 'Direct Execution Blocked for anon', !hasAnon, `anon role has no EXECUTE grant`);
  recordTest('Permissions', 'Direct Execution Blocked for PUBLIC', !hasPublic, `PUBLIC has no EXECUTE grant`);
  recordTest('Permissions', 'Execution Granted to service_role ONLY', hasServiceRole, `service_role has EXECUTE grant`);

  // ─── Suite 6: Source Isolation & Capacity Scope ───────────────────────────
  console.log('\n─── Suite 6: Source Isolation & Capacity Scope ───');
  // Operator C has 40 in Rathayatra. Can Operator C be assigned in Krishnashtami?
  const krishContact = await pg.query<{ id: string }>(`INSERT INTO public.krishnashtami_registrations (full_name, phone, gender) VALUES ('Gopal Das', '9888888881', 'Male') RETURNING id`);
  const rKrish = await callContactAtomic({ contactId: krishContact.rows[0].id, operatorId: opC, source: 'krishnashtami' });
  recordTest('Per-Source Capacity', 'Op C (Full in Rathayatra) Can Accept Krishnashtami Contact', rKrish.success === true && rKrish.code === 'ASSIGNED', `Capacity is strictly per-source`);

  // Can Op C also be assigned in Master Dashboard?
  const masterContactForC = await pg.query<{ id: string }>(`INSERT INTO public.master_contacts (full_name, phone, gender) VALUES ('Gopal Das Master', '9888888881', 'Male') RETURNING id`);
  const rMasterForC = await callMasterAtomic({ masterContactId: masterContactForC.rows[0].id, operatorId: opC });
  recordTest('Per-Source Capacity', 'Op C Can Also Accept Master Dashboard Contact', rMasterForC.success === true && rMasterForC.code === 'ASSIGNED', `Master Dashboard has its own independent capacity`);

  // ─── Suite 7: Concurrent Requests & Race Conditions ──────────────────────
  console.log('\n─── Suite 7: Concurrent Race Conditions & Duplicate Prevention ───');
  const raceContact = await pg.query<{ id: string }>(`INSERT INTO public.registrations (full_name, phone, gender) VALUES ('Arjuna Pandava', '9911223344', 'Male') RETURNING id`);
  const raceContactId = raceContact.rows[0].id;

  // Create 10 distinct operators
  const raceOps: string[] = [];
  for (let i = 0; i < 10; i++) {
    const ro = await pg.query<{ id: string }>(`INSERT INTO public.contact_operators (name, email) VALUES ('Race Op ${i}', 'race_${i}@test.com') RETURNING id`);
    raceOps.push(ro.rows[0].id);
  }

  // Fire 10 concurrent requests to assign raceContactId to 10 different operators with allowReassign=false
  const raceResults = await Promise.all(
    raceOps.map(opId => callContactAtomic({ contactId: raceContactId, operatorId: opId, source: 'rathayatra', allowReassign: false }))
  );

  const raceSuccesses = raceResults.filter(r => r.success === true);
  const raceBlocked = raceResults.filter(r => r.success === false && r.code === 'CONTACT_ALREADY_ASSIGNED');

  recordTest('Concurrent Race', 'Exactly 1 Request Won Race', raceSuccesses.length === 1, `1 success, ${raceBlocked.length} rejected with CONTACT_ALREADY_ASSIGNED`);

  const raceDbCount = await pg.query<{ count: any }>(`SELECT COUNT(*) FROM public.contact_assignments WHERE registration_id = $1 AND is_active = TRUE`, [raceContactId]);
  recordTest('Concurrent Race', 'Exactly 1 Active Assignment in Database (No Duplicates)', Number(raceDbCount.rows[0].count) === 1, `DB count is exactly 1; unique partial index strictly enforced`);

  // ─── Summary ───
  console.log('\n═════════════════════════════════════════════════════════════════════════');
  const failed = testResults.filter(r => !r.passed).length;
  if (failed === 0) {
    console.log(`✅ ALL ${testResults.length} DISPOSABLE POSTGRESQL INTEGRATION TESTS PASSED.`);
  } else {
    console.error(`❌ ${failed} OF ${testResults.length} INTEGRATION TESTS FAILED.`);
    process.exitCode = 1;
  }
  console.log('═════════════════════════════════════════════════════════════════════════');
}

runDisposablePgTests().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
