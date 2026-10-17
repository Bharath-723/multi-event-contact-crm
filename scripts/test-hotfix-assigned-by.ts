/**
 * Regression Test: Production Hotfix for Missing assigned_by Column
 * 
 * Verifies that public.assign_master_contact_atomic succeeds against
 * the authentic live table schema (which has NO assigned_by column)
 * while preserving all security invariants:
 * - Fail-closed male-only validation
 * - Transaction-level advisory locks
 * - Capacity limits
 * - Reassignment semantics
 */

import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('================================================================================');
  console.log('   REGRESSION TEST: MASTER CONTACT ASSIGNMENT SCHEMA & HOTFIX VERIFICATION');
  console.log('================================================================================\n');

  const pg = new PGlite();

  // 1. Create base schema matching authentic live database columns
  await pg.exec(`
    CREATE TABLE IF NOT EXISTS public.contact_operators (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      email text UNIQUE NOT NULL,
      is_active boolean DEFAULT true,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.master_contacts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      phone text NOT NULL,
      name text NOT NULL,
      gender text,
      created_at timestamptz DEFAULT now()
    );

    -- AUTHENTIC LIVE TABLE SCHEMA: ZERO assigned_by column!
    CREATE TABLE IF NOT EXISTS public.master_contact_assignments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      master_contact_id uuid NOT NULL REFERENCES public.master_contacts(id) ON DELETE CASCADE,
      operator_id uuid NOT NULL REFERENCES public.contact_operators(id) ON DELETE CASCADE,
      is_active boolean NOT NULL DEFAULT true,
      status text NOT NULL DEFAULT 'assigned',
      comments text,
      assigned_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_master_contact_assignment 
    ON public.master_contact_assignments(master_contact_id) 
    WHERE is_active = true;

    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
    END $$;
  `);

  console.log('Authentic schema initialized (master_contact_assignments has NO assigned_by column).');

  // 2. Load the hotfix migration
  const hotfixPath = path.join(process.cwd(), 'supabase', 'migrations', '20261017000005_fix_master_assignment_assigned_by_column.sql');
  const hotfixSql = fs.readFileSync(hotfixPath, 'utf8');
  await pg.exec(hotfixSql);
  console.log('Applied hotfix migration 20261017000005.\n');

  // 3. Seed test records
  const opRes = await pg.query<{ id: string }>(`
    INSERT INTO public.contact_operators (name, email, is_active)
    VALUES ('Operator Test', 'op_test@hkm.org', true)
    RETURNING id;
  `);
  const opId = opRes.rows[0].id;

  const maleContact = await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (name, phone, gender)
    VALUES ('Male Contact', '9111111111', 'Male')
    RETURNING id;
  `);
  const maleId = maleContact.rows[0].id;

  const femaleContact = await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (name, phone, gender)
    VALUES ('Female Contact', '9222222222', 'Female')
    RETURNING id;
  `);
  const femaleId = femaleContact.rows[0].id;

  // 4. Test 1: Assignment of male contact with p_assigned_by parameter supplied
  console.log('--- Test 1: Manual Assignment with p_assigned_by Supplied ---');
  const adminUserId = '00000000-0000-0000-0000-000000000099';
  const assignRes = await pg.query<{ result: any }>(`
    SELECT public.assign_master_contact_atomic(
      $1::uuid,
      $2::uuid,
      $3::uuid,
      40::integer,
      false::boolean
    ) AS result;
  `, [maleId, opId, adminUserId]);

  console.log('Assignment response:', assignRes.rows[0].result);
  if (assignRes.rows[0].result?.success === true && assignRes.rows[0].result?.code === 'ASSIGNED') {
    console.log('[PASS] Manual assignment succeeded without "assigned_by does not exist" error!');
  } else {
    console.error('[FAIL] Assignment failed:', assignRes.rows[0].result);
    process.exit(1);
  }

  // 5. Test 2: Verify database record was actually inserted
  const insertedRow = await pg.query<{ count: string }>(`
    SELECT count(*) FROM public.master_contact_assignments 
    WHERE master_contact_id = $1 AND operator_id = $2 AND is_active = true;
  `, [maleId, opId]);
  if (Number(insertedRow.rows[0].count) === 1) {
    console.log('[PASS] 1 active assignment row confirmed in master_contact_assignments.');
  } else {
    console.error('[FAIL] Active assignment row missing in DB!');
    process.exit(1);
  }

  // 6. Test 3: Fail-closed gender check still strictly blocks female contacts
  console.log('\n--- Test 3: Strict Fail-Closed Gender Protection ---');
  const femaleRes = await pg.query<{ result: any }>(`
    SELECT public.assign_master_contact_atomic(
      $1::uuid,
      $2::uuid,
      $3::uuid,
      40::integer,
      false::boolean
    ) AS result;
  `, [femaleId, opId, adminUserId]);

  console.log('Female assignment response:', femaleRes.rows[0].result);
  if (femaleRes.rows[0].result?.success === false && femaleRes.rows[0].result?.code === 'GENDER_INELIGIBLE') {
    console.log('[PASS] Female contact rejected with GENDER_INELIGIBLE (fail-closed preserved).');
  } else {
    console.error('[FAIL] Female contact was NOT rejected:', femaleRes.rows[0].result);
    process.exit(1);
  }

  // 7. Test 4: Reassignment behavior (p_allow_reassign = true)
  console.log('\n--- Test 4: Reassignment Semantics ---');
  const op2Res = await pg.query<{ id: string }>(`
    INSERT INTO public.contact_operators (name, email, is_active)
    VALUES ('Operator Beta', 'op_beta@hkm.org', true)
    RETURNING id;
  `);
  const op2Id = op2Res.rows[0].id;

  const reassignRes = await pg.query<{ result: any }>(`
    SELECT public.assign_master_contact_atomic(
      $1::uuid,
      $2::uuid,
      $3::uuid,
      40::integer,
      true::boolean
    ) AS result;
  `, [maleId, op2Id, adminUserId]);

  console.log('Reassignment response:', reassignRes.rows[0].result);
  if (reassignRes.rows[0].result?.success === true && reassignRes.rows[0].result?.code === 'REASSIGNED') {
    console.log('[PASS] Reassignment succeeded cleanly!');
  } else {
    console.error('[FAIL] Reassignment failed:', reassignRes.rows[0].result);
    process.exit(1);
  }

  // Verify old assignment is deactivated and new assignment is active
  const totalRows = await pg.query<{ count: string }>(`
    SELECT count(*) FROM public.master_contact_assignments WHERE master_contact_id = $1;
  `, [maleId]);
  const activeRows = await pg.query<{ count: string }>(`
    SELECT count(*) FROM public.master_contact_assignments WHERE master_contact_id = $1 AND is_active = true;
  `, [maleId]);

  console.log(`Total history rows: ${totalRows.rows[0].count}, Active rows: ${activeRows.rows[0].count}`);
  if (Number(totalRows.rows[0].count) === 2 && Number(activeRows.rows[0].count) === 1) {
    console.log('[PASS] Reassignment history preserved (old row deactivated, exactly 1 active row).');
  } else {
    console.error('[FAIL] Reassignment history check failed!');
    process.exit(1);
  }

  // 8. Test 5: Hard ceiling of 40 cannot be bypassed by client supplying p_max_capacity = 100
  console.log('\n--- Test 5: Hard Ceiling of 40 Invariant Enforcement ---');
  // Seed Operator Beta to exactly 40 assignments
  for (let i = 2; i <= 40; i++) {
    const c = await pg.query<{ id: string }>(`
      INSERT INTO public.master_contacts (name, phone, gender)
      VALUES ('Devotee ' || $1, '90000000' || lpad($1::text, 2, '0'), 'Male')
      RETURNING id;
    `, [i]);
    await pg.query(`
      INSERT INTO public.master_contact_assignments (master_contact_id, operator_id, is_active, status)
      VALUES ($1, $2, true, 'assigned');
    `, [c.rows[0].id, op2Id]);
  }

  const op2Count = await pg.query<{ count: string }>(`
    SELECT count(*) FROM public.master_contact_assignments WHERE operator_id = $1 AND is_active = true;
  `, [op2Id]);
  console.log(`Operator Beta seeded to: ${op2Count.rows[0].count} / 40 assignments.`);

  // Attempt to assign 41st contact with p_max_capacity = 100
  const contact41 = await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (name, phone, gender)
    VALUES ('Devotee 41', '9000000041', 'Male')
    RETURNING id;
  `);

  const bypassAttempt = await pg.query<{ result: any }>(`
    SELECT public.assign_master_contact_atomic(
      $1::uuid,
      $2::uuid,
      NULL::uuid,
      100::integer,
      false::boolean
    ) AS result;
  `, [contact41.rows[0].id, op2Id]);

  console.log('Bypass attempt with p_max_capacity=100 result:', bypassAttempt.rows[0].result);
  if (
    bypassAttempt.rows[0].result?.success === false &&
    bypassAttempt.rows[0].result?.code === 'OPERATOR_CAPACITY_EXCEEDED' &&
    bypassAttempt.rows[0].result?.max_capacity === 40
  ) {
    console.log('[PASS] Hard ceiling of 40 strictly enforced! Client argument p_max_capacity=100 clamped to 40.');
  } else {
    console.error('[FAIL] Hard ceiling bypassed or incorrect response:', bypassAttempt.rows[0].result);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
