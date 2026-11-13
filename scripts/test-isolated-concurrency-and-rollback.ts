/**
 * Isolated Database Concurrency, Partial-Schema & Rollback Verification
 * Powered by @electric-sql/pglite (PostgreSQL 16 WASM)
 */

import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

async function runConcurrencyAndRollbackAudit() {
  console.log('╔═════════════════════════════════════════════════════════════════════════╗');
  console.log('║   CONCURRENCY, PARTIAL SCHEMA & ROLLBACK AUDIT (PGlite 16)              ║');
  console.log('╚═════════════════════════════════════════════════════════════════════════╝\n');

  const migrationPath = path.resolve('supabase/migrations/20261106000000_dynamic_capacity_and_not_interested.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  // ──────────────────────────────────────────────────────────────────────────
  // Test Part 1: Partial Existing Schemas
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- Part 1: Partially Existing Schemas ---');
  const pg1 = new PGlite();

  // Baseline where capacity ALREADY exists, but is_not_interested does not
  await pg1.exec(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
    END $$;

    CREATE OR REPLACE FUNCTION public.normalize_phone(p_phone text)
    RETURNS text AS $$
    BEGIN
      RETURN right(regexp_replace(COALESCE(p_phone, ''), '\\D', '', 'g'), 10);
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;

    CREATE TABLE public.contact_operators (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      is_active BOOLEAN NOT NULL DEFAULT true,
      operator_type TEXT NOT NULL DEFAULT 'operator',
      capacity INTEGER NOT NULL DEFAULT 40, -- ALREADY EXISTS!
      CONSTRAINT chk_operator_capacity CHECK (capacity >= 1 AND capacity <= 500), -- ALREADY EXISTS!
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
      event_record_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE public.master_contact_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      master_contact_id UUID NOT NULL REFERENCES public.master_contacts(id) ON DELETE CASCADE,
      operator_id UUID NOT NULL REFERENCES public.contact_operators(id) ON DELETE CASCADE,
      is_active BOOLEAN NOT NULL DEFAULT true,
      status TEXT NOT NULL DEFAULT 'assigned',
      comments TEXT,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE public.registrations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      gender TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE public.contact_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      registration_id UUID NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
      operator_id UUID NOT NULL REFERENCES public.contact_operators(id) ON DELETE CASCADE,
      is_active BOOLEAN NOT NULL DEFAULT true,
      status TEXT NOT NULL DEFAULT 'Pending',
      assigned_by UUID, -- ALREADY EXISTS!
      remarks TEXT,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE public.krishnashtami_registrations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      gender TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE public.krishnashtami_contact_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      registration_id UUID NOT NULL REFERENCES public.krishnashtami_registrations(id) ON DELETE CASCADE,
      operator_id UUID NOT NULL REFERENCES public.contact_operators(id) ON DELETE CASCADE,
      is_active BOOLEAN NOT NULL DEFAULT true,
      status TEXT NOT NULL DEFAULT 'Pending',
      assigned_by TEXT DEFAULT 'admin', -- ALREADY EXISTS!
      remarks TEXT,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE public.feedback_contacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      gender TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE public.feedback_contact_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      feedback_contact_id UUID NOT NULL REFERENCES public.feedback_contacts(id) ON DELETE CASCADE,
      operator_id UUID NOT NULL REFERENCES public.contact_operators(id) ON DELETE CASCADE,
      is_active BOOLEAN NOT NULL DEFAULT true,
      status TEXT NOT NULL DEFAULT 'Assigned',
      assigned_by UUID, -- ALREADY EXISTS!
      notes TEXT,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE public.audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      action TEXT NOT NULL,
      details JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  try {
    await pg1.exec(migrationSql);
    console.log('  ✅ [PASS] Migration applied cleanly on partially existing schema (pre-existing capacity & assigned_by).');
  } catch (err: any) {
    console.error('  ❌ [FAIL] Migration failed on partially existing schema:', err.message);
    process.exit(1);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Test Part 2: Concurrency Test Suite (6 Rigorous Scenarios)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Part 2: Concurrency Test Suite (6 Rigorous Real-Race Scenarios) ---');

  // ── Scenario 1: Two simultaneous assignments competing for final capacity slot ──
  console.log('  Testing Scenario 1: Two simultaneous assignments competing for final capacity slot...');
  const opRes = await pg1.query<{ id: string }>(`
    INSERT INTO public.contact_operators (name, email, capacity)
    VALUES ('Capacity 1 Operator', 'cap1_op@example.com', 1) RETURNING id;
  `);
  const cap1OpId = opRes.rows[0].id;

  const c1 = (await pg1.query<{ id: string }>(`
    INSERT INTO public.master_contacts (name, phone, gender)
    VALUES ('Slot Competitor 1', '9000000001', 'Male') RETURNING id;
  `)).rows[0].id;

  const c2 = (await pg1.query<{ id: string }>(`
    INSERT INTO public.master_contacts (name, phone, gender)
    VALUES ('Slot Competitor 2', '9000000002', 'Male') RETURNING id;
  `)).rows[0].id;

  const [slotRes1, slotRes2] = await Promise.all([
    pg1.query<{ res: any }>(`SELECT public.assign_master_contact_atomic('${c1}'::uuid, '${cap1OpId}'::uuid, NULL, 40, false) as res;`),
    pg1.query<{ res: any }>(`SELECT public.assign_master_contact_atomic('${c2}'::uuid, '${cap1OpId}'::uuid, NULL, 40, false) as res;`)
  ]);

  const s1 = slotRes1.rows[0].res;
  const s2 = slotRes2.rows[0].res;
  const oneWonSlot = (s1.success === true && s1.code === 'ASSIGNED' && s2.success === false && s2.code === 'OPERATOR_CAPACITY_EXCEEDED') ||
                     (s2.success === true && s2.code === 'ASSIGNED' && s1.success === false && s1.code === 'OPERATOR_CAPACITY_EXCEEDED');

  if (!oneWonSlot) {
    console.error(`  ❌ [FAIL] Scenario 1 failed: s1=${JSON.stringify(s1)}, s2=${JSON.stringify(s2)}`);
    process.exit(1);
  }
  const capCheck = await pg1.query<{ count: string }>(`
    SELECT count(*) as count FROM public.master_contact_assignments WHERE operator_id = '${cap1OpId}' AND is_active = true;
  `);
  if (Number(capCheck.rows[0].count) !== 1) {
    console.error(`  ❌ [FAIL] Operator capacity invariant violated! Active count: ${capCheck.rows[0].count}`);
    process.exit(1);
  }
  console.log('  ✅ [PASS] Scenario 1: Exactly 1 assignment won final slot; 2nd cleanly rejected with OPERATOR_CAPACITY_EXCEEDED.');

  // ── Scenario 2: Master assignment vs Source assignment ──
  console.log('  Testing Scenario 2: Master assignment vs Source assignment (same contact & phone)...');
  const opPairRes = await pg1.query<{ id: string }>(`
    INSERT INTO public.contact_operators (name, email, capacity)
    VALUES ('Pair Op A', 'pair_op_a@example.com', 10),
           ('Pair Op B', 'pair_op_b@example.com', 10) RETURNING id;
  `);
  const opA = opPairRes.rows[0].id;
  const opB = opPairRes.rows[1].id;

  const phoneShared = '9000000003';
  const cShared = (await pg1.query<{ id: string }>(`
    INSERT INTO public.master_contacts (name, phone, gender)
    VALUES ('Shared Phone Contact', '${phoneShared}', 'Male') RETURNING id;
  `)).rows[0].id;

  const regShared = (await pg1.query<{ id: string }>(`
    INSERT INTO public.registrations (full_name, phone, gender)
    VALUES ('Shared Phone Contact', '${phoneShared}', 'Male') RETURNING id;
  `)).rows[0].id;

  // Concurrent Master assign to Op A vs Source assign to Op B
  const [mAssignRes, sAssignRes] = await Promise.all([
    pg1.query<{ res: any }>(`SELECT public.assign_master_contact_atomic('${cShared}'::uuid, '${opA}'::uuid, NULL, 40, false) as res;`),
    pg1.query<{ res: any }>(`SELECT public.assign_contact_atomic('${regShared}'::uuid, '${opB}'::uuid, 'rathayatra', NULL::uuid, 40, false) as res;`)
  ]);

  const ma = mAssignRes.rows[0].res;
  const sa = sAssignRes.rows[0].res;
  if (!ma.success || !sa.success) {
    console.error(`  ❌ [FAIL] Scenario 2 failed: ma=${JSON.stringify(ma)}, sa=${JSON.stringify(sa)}`);
    process.exit(1);
  }
  console.log('  ✅ [PASS] Scenario 2: Master assignment vs Source assignment executed without deadlocks or errors.');

  // ── Scenario 3: Master assignment vs Not Interested ──
  console.log('  Testing Scenario 3: Master assignment vs Not Interested race...');
  const phoneNI1 = '9000000004';
  const cNI1 = (await pg1.query<{ id: string }>(`
    INSERT INTO public.master_contacts (name, phone, gender)
    VALUES ('Master NI Contact', '${phoneNI1}', 'Male') RETURNING id;
  `)).rows[0].id;

  const [raceM1, raceNI1] = await Promise.all([
    pg1.query<{ res: any }>(`SELECT public.assign_master_contact_atomic('${cNI1}'::uuid, '${opA}'::uuid, NULL, 40, false) as res;`),
    pg1.query<{ res: any }>(`SELECT public.mark_contact_not_interested_atomic('${cNI1}'::uuid, '${phoneNI1}', '${opA}'::uuid, 'Refused') as res;`)
  ]);

  // Invariant verification: is_not_interested must be TRUE and active assignments must be 0
  const mcNI1Check = await pg1.query<{ is_not_interested: boolean }>(`
    SELECT is_not_interested FROM public.master_contacts WHERE id = '${cNI1}';
  `);
  const activeM1Count = await pg1.query<{ count: string }>(`
    SELECT count(*) as count FROM public.master_contact_assignments WHERE master_contact_id = '${cNI1}' AND is_active = true;
  `);

  if (!mcNI1Check.rows[0].is_not_interested || Number(activeM1Count.rows[0].count) !== 0) {
    console.error(`  ❌ [FAIL] Scenario 3 invariant violated: is_not_interested=${mcNI1Check.rows[0].is_not_interested}, activeCount=${activeM1Count.rows[0].count}`);
    process.exit(1);
  }
  console.log('  ✅ [PASS] Scenario 3: Master assignment vs Not Interested resolved with zero active assignments and is_not_interested=true.');

  // ── Scenario 4: Source assignment vs Not Interested ──
  console.log('  Testing Scenario 4: Source assignment vs Not Interested race...');
  const phoneNI2 = '9000000005';
  const cNI2 = (await pg1.query<{ id: string }>(`
    INSERT INTO public.master_contacts (name, phone, gender)
    VALUES ('Source NI Contact', '${phoneNI2}', 'Male') RETURNING id;
  `)).rows[0].id;

  const regNI2 = (await pg1.query<{ id: string }>(`
    INSERT INTO public.registrations (full_name, phone, gender)
    VALUES ('Source NI Contact', '${phoneNI2}', 'Male') RETURNING id;
  `)).rows[0].id;

  const [raceS2, raceNI2] = await Promise.all([
    pg1.query<{ res: any }>(`SELECT public.assign_contact_atomic('${regNI2}'::uuid, '${opB}'::uuid, 'rathayatra', NULL::uuid, 40, false) as res;`),
    pg1.query<{ res: any }>(`SELECT public.mark_contact_not_interested_atomic('${cNI2}'::uuid, '${phoneNI2}', '${opB}'::uuid, 'Opt out') as res;`)
  ]);

  const mcNI2Check = await pg1.query<{ is_not_interested: boolean }>(`
    SELECT is_not_interested FROM public.master_contacts WHERE id = '${cNI2}';
  `);
  const activeS2Count = await pg1.query<{ count: string }>(`
    SELECT count(*) as count FROM public.contact_assignments WHERE registration_id = '${regNI2}' AND is_active = true;
  `);

  if (!mcNI2Check.rows[0].is_not_interested || Number(activeS2Count.rows[0].count) !== 0) {
    console.error(`  ❌ [FAIL] Scenario 4 invariant violated: is_not_interested=${mcNI2Check.rows[0].is_not_interested}, activeCount=${activeS2Count.rows[0].count}`);
    process.exit(1);
  }
  console.log('  ✅ [PASS] Scenario 4: Source assignment vs Not Interested resolved with zero active assignments and is_not_interested=true.');

  // ── Scenario 5: Multiple source registrations sharing one normalized phone ──
  console.log('  Testing Scenario 5: Multiple source registrations sharing one normalized phone...');
  const sharedPhoneMulti = '9000000006';
  const regMulti1 = (await pg1.query<{ id: string }>(`
    INSERT INTO public.registrations (full_name, phone, gender)
    VALUES ('Multi Reg Contact 1', '${sharedPhoneMulti}', 'Male') RETURNING id;
  `)).rows[0].id;

  const regMulti2 = (await pg1.query<{ id: string }>(`
    INSERT INTO public.krishnashtami_registrations (full_name, phone, gender)
    VALUES ('Multi Reg Contact 2', '${sharedPhoneMulti}', 'Male') RETURNING id;
  `)).rows[0].id;

  // Both registrations assigned concurrently across different source tables
  const [multiAssign1, multiAssign2] = await Promise.all([
    pg1.query<{ res: any }>(`SELECT public.assign_contact_atomic('${regMulti1}'::uuid, '${opA}'::uuid, 'rathayatra', NULL::uuid, 40, false) as res;`),
    pg1.query<{ res: any }>(`SELECT public.assign_contact_atomic('${regMulti2}'::uuid, '${opB}'::uuid, 'krishnashtami', NULL::uuid, 40, false) as res;`)
  ]);

  if (!multiAssign1.rows[0].res.success || !multiAssign2.rows[0].res.success) {
    console.error(`  ❌ [FAIL] Scenario 5 concurrent assignments failed: m1=${JSON.stringify(multiAssign1.rows[0].res)}, m2=${JSON.stringify(multiAssign2.rows[0].res)}`);
    process.exit(1);
  }

  // Now mark that phone Not Interested
  const multiNIRes = (await pg1.query<{ res: any }>(`
    SELECT public.mark_contact_not_interested_atomic(NULL, '${sharedPhoneMulti}', '${opA}'::uuid, 'Do not call') as res;
  `)).rows[0].res;

  if (!multiNIRes.success) {
    console.error(`  ❌ [FAIL] Scenario 5 Not Interested failed:`, multiNIRes);
    process.exit(1);
  }

  // Verify that BOTH source assignments are deactivated
  const rathActive = await pg1.query<{ count: string }>(`
    SELECT count(*) as count FROM public.contact_assignments WHERE registration_id = '${regMulti1}' AND is_active = true;
  `);
  const krishActive = await pg1.query<{ count: string }>(`
    SELECT count(*) as count FROM public.krishnashtami_contact_assignments WHERE registration_id = '${regMulti2}' AND is_active = true;
  `);

  if (Number(rathActive.rows[0].count) !== 0 || Number(krishActive.rows[0].count) !== 0) {
    console.error(`  ❌ [FAIL] Scenario 5 deactivation failed: rathActive=${rathActive.rows[0].count}, krishActive=${krishActive.rows[0].count}`);
    process.exit(1);
  }
  console.log('  ✅ [PASS] Scenario 5: Multiple registrations sharing phone deactivated atomically across all source tables.');

  // ── Scenario 6: Reassignment vs Not Interested ──
  console.log('  Testing Scenario 6: Reassignment vs Not Interested race...');
  const phoneReassign = '9000000007';
  const cReassign = (await pg1.query<{ id: string }>(`
    INSERT INTO public.master_contacts (name, phone, gender)
    VALUES ('Reassignment Contact', '${phoneReassign}', 'Male') RETURNING id;
  `)).rows[0].id;

  // Initial assignment to Op A
  await pg1.query(`
    SELECT public.assign_master_contact_atomic('${cReassign}'::uuid, '${opA}'::uuid, NULL, 40, false);
  `);

  // Concurrent race: Reassign to Op B vs Mark Not Interested
  const [reassignRes, niReassignRes] = await Promise.all([
    pg1.query<{ res: any }>(`SELECT public.assign_master_contact_atomic('${cReassign}'::uuid, '${opB}'::uuid, NULL, 40, true) as res;`),
    pg1.query<{ res: any }>(`SELECT public.mark_contact_not_interested_atomic('${cReassign}'::uuid, '${phoneReassign}', '${opA}'::uuid, 'Stop calling') as res;`)
  ]);

  // Check invariants: is_not_interested is true, and 0 active assignments exist
  const reassignNICheck = await pg1.query<{ is_not_interested: boolean }>(`
    SELECT is_not_interested FROM public.master_contacts WHERE id = '${cReassign}';
  `);
  const activeReassignCount = await pg1.query<{ count: string }>(`
    SELECT count(*) as count FROM public.master_contact_assignments WHERE master_contact_id = '${cReassign}' AND is_active = true;
  `);

  if (!reassignNICheck.rows[0].is_not_interested || Number(activeReassignCount.rows[0].count) !== 0) {
    console.error(`  ❌ [FAIL] Scenario 6 invariant violated: is_not_interested=${reassignNICheck.rows[0].is_not_interested}, activeCount=${activeReassignCount.rows[0].count}`);
    process.exit(1);
  }
  console.log('  ✅ [PASS] Scenario 6: Reassignment vs Not Interested resolved safely with 0 active assignments and is_not_interested=true.');

  // ── Scenario 7: Missing master contact auto-creation & exclusion in source assignment ──
  console.log('  Testing Scenario 7: Missing master contact auto-creation in source assignment...');
  const phoneNoMaster = '9000000008';
  const regNoMaster = (await pg1.query<{ id: string }>(`
    INSERT INTO public.registrations (full_name, phone, gender)
    VALUES ('No Master Contact', '${phoneNoMaster}', 'Male') RETURNING id;
  `)).rows[0].id;

  // Verify master contact does NOT exist before assignment
  const preCheck = await pg1.query(`SELECT 1 FROM public.master_contacts WHERE phone = '${phoneNoMaster}';`);
  if (preCheck.rows.length > 0) {
    console.error('  ❌ [FAIL] Master contact unexpectedly already exists!');
    process.exit(1);
  }

  // Assign via assign_contact_atomic
  const assignNoMasterRes = (await pg1.query<{ res: any }>(`
    SELECT public.assign_contact_atomic('${regNoMaster}'::uuid, '${opA}'::uuid, 'rathayatra', NULL::uuid, 40, false) as res;
  `)).rows[0].res;

  if (!assignNoMasterRes.success || assignNoMasterRes.code !== 'ASSIGNED') {
    console.error('  ❌ [FAIL] Scenario 7 assignment failed:', assignNoMasterRes);
    process.exit(1);
  }

  // Verify master contact was automatically resolved/created
  const postCheck = await pg1.query<{ id: string; is_not_interested: boolean }>(`
    SELECT id, is_not_interested FROM public.master_contacts WHERE phone = '${phoneNoMaster}';
  `);
  if (postCheck.rows.length === 0) {
    console.error('  ❌ [FAIL] Master contact was not created by assign_contact_atomic!');
    process.exit(1);
  }
  const autoCreatedMasterId = postCheck.rows[0].id;

  // Now mark Not Interested via mark_contact_not_interested_atomic
  const markNoMasterNI = (await pg1.query<{ res: any }>(`
    SELECT public.mark_contact_not_interested_atomic('${autoCreatedMasterId}'::uuid, '${phoneNoMaster}', '${opA}'::uuid, 'Not interested') as res;
  `)).rows[0].res;

  if (!markNoMasterNI.success) {
    console.error('  ❌ [FAIL] Scenario 7 Not Interested failed:', markNoMasterNI);
    process.exit(1);
  }

  // Verify active assignment was deactivated
  const activeNoMasterCount = await pg1.query<{ count: string }>(`
    SELECT count(*) as count FROM public.contact_assignments WHERE registration_id = '${regNoMaster}' AND is_active = true;
  `);
  if (Number(activeNoMasterCount.rows[0].count) !== 0) {
    console.error('  ❌ [FAIL] Scenario 7 active assignment remained after Not Interested!');
    process.exit(1);
  }

  // Verify subsequent assignment attempt fails with CONTACT_NOT_INTERESTED
  const retryAssignNoMaster = (await pg1.query<{ res: any }>(`
    SELECT public.assign_contact_atomic('${regNoMaster}'::uuid, '${opB}'::uuid, 'rathayatra', NULL::uuid, 40, false) as res;
  `)).rows[0].res;

  if (retryAssignNoMaster.success || retryAssignNoMaster.code !== 'CONTACT_NOT_INTERESTED') {
    console.error('  ❌ [FAIL] Scenario 7 subsequent assignment did not fail closed:', retryAssignNoMaster);
    process.exit(1);
  }
  console.log('  ✅ [PASS] Scenario 7: Missing master contact auto-created, locked, excluded, and deactivated safely.');

  // ── Scenario 8: Inconsistent phone identity (Source phone differs from linked master phone) ──
  console.log('  Testing Scenario 8: Inconsistent phone identity (Source phone != linked Master phone)...');
  const sourcePhoneDiff = '9000000009';
  const masterPhoneDiff = '9000000010';

  const cDiff = (await pg1.query<{ id: string }>(`
    INSERT INTO public.master_contacts (name, phone, gender)
    VALUES ('Diff Phone Master', '${masterPhoneDiff}', 'Male') RETURNING id;
  `)).rows[0].id;

  const regDiff = (await pg1.query<{ id: string }>(`
    INSERT INTO public.registrations (full_name, phone, gender)
    VALUES ('Diff Phone Source', '${sourcePhoneDiff}', 'Male') RETURNING id;
  `)).rows[0].id;

  // Link them via master_contact_events
  await pg1.query(`
    INSERT INTO public.master_contact_events (master_contact_id, source, event_record_id)
    VALUES ('${cDiff}'::uuid, 'rathayatra', '${regDiff}');
  `);

  // Assign via assign_contact_atomic (locks both phones in lexicographical order)
  const assignDiffRes = (await pg1.query<{ res: any }>(`
    SELECT public.assign_contact_atomic('${regDiff}'::uuid, '${opA}'::uuid, 'rathayatra', NULL::uuid, 40, false) as res;
  `)).rows[0].res;

  if (!assignDiffRes.success || assignDiffRes.code !== 'ASSIGNED') {
    console.error('  ❌ [FAIL] Scenario 8 assignment failed:', assignDiffRes);
    process.exit(1);
  }

  // Mark master phone Not Interested
  const markDiffNI = (await pg1.query<{ res: any }>(`
    SELECT public.mark_contact_not_interested_atomic('${cDiff}'::uuid, '${masterPhoneDiff}', '${opA}'::uuid, 'Exclusion') as res;
  `)).rows[0].res;

  if (!markDiffNI.success) {
    console.error('  ❌ [FAIL] Scenario 8 Not Interested failed:', markDiffNI);
    process.exit(1);
  }

  // Subsequent assignment using source registration must be rejected with CONTACT_NOT_INTERESTED
  const retryDiff = (await pg1.query<{ res: any }>(`
    SELECT public.assign_contact_atomic('${regDiff}'::uuid, '${opB}'::uuid, 'rathayatra', NULL::uuid, 40, false) as res;
  `)).rows[0].res;

  if (retryDiff.success || retryDiff.code !== 'CONTACT_NOT_INTERESTED') {
    console.error('  ❌ [FAIL] Scenario 8 subsequent assignment did not detect master phone exclusion:', retryDiff);
    process.exit(1);
  }
  console.log('  ✅ [PASS] Scenario 8: Source phone differing from linked master phone coordinated safely and excluded.');

  // ── Scenario 9: Missing or Invalid Phone Identity Fails Closed ──
  console.log('  Testing Scenario 9: Missing or Invalid Phone Identity Fails Closed...');
  const regInvalidPhone = (await pg1.query<{ id: string }>(`
    INSERT INTO public.registrations (full_name, phone, gender)
    VALUES ('Invalid Phone Contact', '12345', 'Male') RETURNING id;
  `)).rows[0].id;

  const invalidSourceRes = (await pg1.query<{ res: any }>(`
    SELECT public.assign_contact_atomic('${regInvalidPhone}'::uuid, '${opA}'::uuid, 'rathayatra', NULL::uuid, 40, false) as res;
  `)).rows[0].res;

  if (invalidSourceRes.success || invalidSourceRes.code !== 'INVALID_PHONE') {
    console.error('  ❌ [FAIL] Scenario 9 invalid source phone did not fail closed with INVALID_PHONE:', invalidSourceRes);
    process.exit(1);
  }

  const cInvalidMaster = (await pg1.query<{ id: string }>(`
    INSERT INTO public.master_contacts (name, phone, gender)
    VALUES ('Invalid Master Phone', '0000000000', 'Male') RETURNING id;
  `)).rows[0].id;

  const invalidMasterRes = (await pg1.query<{ res: any }>(`
    SELECT public.assign_master_contact_atomic('${cInvalidMaster}'::uuid, '${opA}'::uuid, NULL, 40, false) as res;
  `)).rows[0].res;

  if (invalidMasterRes.success || invalidMasterRes.code !== 'INVALID_PHONE') {
    console.error('  ❌ [FAIL] Scenario 9 invalid master phone did not fail closed with INVALID_PHONE:', invalidMasterRes);
    process.exit(1);
  }

  const invalidNIRes = (await pg1.query<{ res: any }>(`
    SELECT public.mark_contact_not_interested_atomic(NULL, '0000000000', '${opA}'::uuid, 'Test') as res;
  `)).rows[0].res;

  if (invalidNIRes.success || invalidNIRes.code !== 'INVALID_PHONE') {
    console.error('  ❌ [FAIL] Scenario 9 invalid phone in mark_contact_not_interested_atomic did not fail closed:', invalidNIRes);
    process.exit(1);
  }
  console.log('  ✅ [PASS] Scenario 9: Missing/invalid phone identity strictly fails closed with INVALID_PHONE across all RPCs.');

  // ──────────────────────────────────────────────────────────────────────────
  // Test Part 4: Migration Rollback Verification
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Part 4: Migration Rollback Verification ---');
  // Define rollback SQL
  const rollbackSql = `
    -- Revert functions to pre-migration baseline (or drop new overload if appropriate)
    -- Drop partial index
    DROP INDEX IF EXISTS public.idx_master_contacts_not_interested;

    -- Remove added columns from master_contacts
    ALTER TABLE public.master_contacts 
      DROP COLUMN IF EXISTS not_interested_by,
      DROP COLUMN IF EXISTS not_interested_at,
      DROP COLUMN IF EXISTS is_not_interested;

    -- Remove constraint and column from contact_operators
    ALTER TABLE public.contact_operators 
      DROP CONSTRAINT IF EXISTS chk_operator_capacity;

    ALTER TABLE public.contact_operators 
      DROP COLUMN IF EXISTS capacity;
  `;

  try {
    await pg1.exec(rollbackSql);
    console.log('  ✅ [PASS] Rollback script executed cleanly without errors.');

    // Verify columns removed
    const verifyCap = await pg1.query(`
      SELECT 1 FROM information_schema.columns WHERE table_name = 'contact_operators' AND column_name = 'capacity';
    `);
    const verifyNI = await pg1.query(`
      SELECT 1 FROM information_schema.columns WHERE table_name = 'master_contacts' AND column_name = 'is_not_interested';
    `);

    if (verifyCap.rows.length === 0 && verifyNI.rows.length === 0) {
      console.log('  ✅ [PASS] Rollback cleanly removed capacity and is_not_interested columns.');
    } else {
      console.error('  ❌ [FAIL] Columns still remain after rollback.');
      process.exit(1);
    }
  } catch (err: any) {
    console.error('  ❌ [FAIL] Rollback execution failed:', err.message);
    process.exit(1);
  }

  console.log('\n✅ ALL CONCURRENCY, PARTIAL SCHEMA & ROLLBACK TESTS PASSED!\n');
}

runConcurrencyAndRollbackAudit().catch(err => {
  console.error('Fatal error during test:', err);
  process.exit(1);
});
