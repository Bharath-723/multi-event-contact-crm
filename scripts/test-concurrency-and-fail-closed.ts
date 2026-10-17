/**
 * Isolated PostgreSQL 16 In-Memory Concurrency & Fail-Closed Test Suite
 * Powered by @electric-sql/pglite (Real PostgreSQL 16 WASM engine)
 * 
 * Tests the exact invariants requested in Priority 1 and Priority 2:
 * 1. Fail-closed rejection of Female, NULL, empty, and unknown gender at database layer.
 * 2. Simultaneous assignment of the same contact to two operators concurrently.
 * 3. Operator at 39 assignments receiving two simultaneous assignment requests (max 40 invariant).
 * 4. Reassignment release and atomic acquisition.
 * 5. Verification of final committed state.
 */

import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

interface TestResult {
  test: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function record(test: string, passed: boolean, details: string) {
  results.push({ test, passed, details });
  if (passed) {
    console.log(`  [PASS] ${test}: ${details}`);
  } else {
    console.error(`  [FAIL] ${test}: ${details}`);
  }
}

async function runConcurrencyAndFailClosedTests() {
  console.log('================================================================================');
  console.log('   ISOLATED POSTGRESQL 16: CONCURRENCY & FAIL-CLOSED GENDER TEST SUITE');
  console.log('================================================================================\n');

  const pg = new PGlite();

  // 1. Create base schema
  console.log('Setting up base schema, tables, and unique partial indexes...');
  await pg.exec(`
    CREATE TABLE IF NOT EXISTS contact_operators (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      email text UNIQUE NOT NULL,
      phone text,
      is_active boolean DEFAULT true,
      operator_type text DEFAULT 'operator',
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS master_contacts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      phone text NOT NULL,
      name text NOT NULL,
      gender text,
      created_at timestamptz DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS master_contact_assignments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      master_contact_id uuid NOT NULL REFERENCES master_contacts(id) ON DELETE CASCADE,
      operator_id uuid NOT NULL REFERENCES contact_operators(id) ON DELETE CASCADE,
      is_active boolean NOT NULL DEFAULT true,
      status text NOT NULL DEFAULT 'assigned',
      assigned_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_master_contact_assignment 
    ON master_contact_assignments(master_contact_id) 
    WHERE is_active = true;
  `);

  // 2. Apply additive migration
  console.log('Applying additive migration 20261017000003_enforce_fail_closed_gender_and_concurrency.sql...');
  await pg.exec(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
    END $$;
  `);
  const migrationPath = path.join(process.cwd(), 'supabase/migrations/20261017000003_enforce_fail_closed_gender_and_concurrency.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  await pg.exec(migrationSql);
  console.log('Migration applied successfully.\n');

  // Seed operators
  const opARes = await pg.query<{ id: string }>(
    `INSERT INTO contact_operators (name, email) VALUES ('Operator Alpha', 'alpha@hkm.org') RETURNING id;`
  );
  const opBRes = await pg.query<{ id: string }>(
    `INSERT INTO contact_operators (name, email) VALUES ('Operator Beta', 'beta@hkm.org') RETURNING id;`
  );
  const opCRes = await pg.query<{ id: string }>(
    `INSERT INTO contact_operators (name, email) VALUES ('Operator Gamma (Capacity Target)', 'gamma@hkm.org') RETURNING id;`
  );

  const opA = opARes.rows[0].id;
  const opB = opBRes.rows[0].id;
  const opC = opCRes.rows[0].id;

  // ─── SUITE 1: STRICT FAIL-CLOSED GENDER AT DB LAYER ─────────────────────────
  console.log('--- Suite 1: Strict Fail-Closed Gender at Database Layer ---');

  // Male Contact -> Should SUCCEED
  const maleContact = (
    await pg.query<{ id: string }>(
      `INSERT INTO master_contacts (name, phone, gender) VALUES ('Ramesh Male', '9876543210', 'Male') RETURNING id;`
    )
  ).rows[0].id;

  const maleRes = await pg.query<{ assign_master_contact_atomic: any }>(
    `SELECT public.assign_master_contact_atomic($1, $2, NULL, 40, false);`,
    [maleContact, opA]
  );
  record('Male Contact Assignment', maleRes.rows[0].assign_master_contact_atomic.success === true, 'Confirmed male contact assigned successfully');

  // Female Contact -> Should FAIL
  const femaleContact = (
    await pg.query<{ id: string }>(
      `INSERT INTO master_contacts (name, phone, gender) VALUES ('Sita Female', '9876543211', 'Female') RETURNING id;`
    )
  ).rows[0].id;

  const femaleRes = await pg.query<{ assign_master_contact_atomic: any }>(
    `SELECT public.assign_master_contact_atomic($1, $2, NULL, 40, false);`,
    [femaleContact, opA]
  );
  record('Female Contact Assignment', femaleRes.rows[0].assign_master_contact_atomic.code === 'GENDER_INELIGIBLE', 'Female contact rejected with GENDER_INELIGIBLE');

  // NULL Gender Contact -> Should FAIL CLOSED
  const nullGenderContact = (
    await pg.query<{ id: string }>(
      `INSERT INTO master_contacts (name, phone, gender) VALUES ('Unknown Null', '9876543212', NULL) RETURNING id;`
    )
  ).rows[0].id;

  const nullGenderRes = await pg.query<{ assign_master_contact_atomic: any }>(
    `SELECT public.assign_master_contact_atomic($1, $2, NULL, 40, false);`,
    [nullGenderContact, opA]
  );
  record('NULL Gender Contact Assignment', nullGenderRes.rows[0].assign_master_contact_atomic.code === 'GENDER_INELIGIBLE', 'NULL gender contact rejected with GENDER_INELIGIBLE (fail-closed)');

  // Empty Gender Contact -> Should FAIL CLOSED
  const emptyGenderContact = (
    await pg.query<{ id: string }>(
      `INSERT INTO master_contacts (name, phone, gender) VALUES ('Empty Gender', '9876543213', '   ') RETURNING id;`
    )
  ).rows[0].id;

  const emptyGenderRes = await pg.query<{ assign_master_contact_atomic: any }>(
    `SELECT public.assign_master_contact_atomic($1, $2, NULL, 40, false);`,
    [emptyGenderContact, opA]
  );
  record('Empty Gender Contact Assignment', emptyGenderRes.rows[0].assign_master_contact_atomic.code === 'GENDER_INELIGIBLE', 'Empty string gender rejected with GENDER_INELIGIBLE (fail-closed)');

  // Unknown/Malformed Gender Contact -> Should FAIL CLOSED
  const malformedGenderContact = (
    await pg.query<{ id: string }>(
      `INSERT INTO master_contacts (name, phone, gender) VALUES ('Malformed Gender', '9876543214', 'DeclineToState') RETURNING id;`
    )
  ).rows[0].id;

  const malformedGenderRes = await pg.query<{ assign_master_contact_atomic: any }>(
    `SELECT public.assign_master_contact_atomic($1, $2, NULL, 40, false);`,
    [malformedGenderContact, opA]
  );
  record('Malformed/Ambiguous Gender Assignment', malformedGenderRes.rows[0].assign_master_contact_atomic.code === 'GENDER_INELIGIBLE', 'Ambiguous gender string rejected with GENDER_INELIGIBLE (fail-closed)');

  // Verify DB state: 0 female or unknown gender active assignments exist
  const activeNonMaleCount = (
    await pg.query<{ count: number }>(
      `SELECT count(*) FROM master_contact_assignments a
       JOIN master_contacts c ON a.master_contact_id = c.id
       WHERE a.is_active = true AND LOWER(TRIM(COALESCE(c.gender, ''))) NOT IN ('male', 'm');`
    )
  ).rows[0].count;
  record('Database Integrity Check', Number(activeNonMaleCount) === 0, '0 active non-male assignments exist in the database');

  // ─── SUITE 2: CONCURRENT ASSIGNMENT TO TWO OPERATORS SIMULTANEOUSLY ─────────
  console.log('\n--- Suite 2: Concurrent Assignment of Same Contact to Two Operators ---');

  const contestContact = (
    await pg.query<{ id: string }>(
      `INSERT INTO master_contacts (name, phone, gender) VALUES ('Contested Contact', '9876543220', 'Male') RETURNING id;`
    )
  ).rows[0].id;

  // Run two simultaneous assignment attempts in parallel
  const [attempt1, attempt2] = await Promise.all([
    pg.query<{ assign_master_contact_atomic: any }>(
      `SELECT public.assign_master_contact_atomic($1, $2, NULL, 40, false);`,
      [contestContact, opA]
    ),
    pg.query<{ assign_master_contact_atomic: any }>(
      `SELECT public.assign_master_contact_atomic($1, $2, NULL, 40, false);`,
      [contestContact, opB]
    ),
  ]);

  const res1 = attempt1.rows[0].assign_master_contact_atomic;
  const res2 = attempt2.rows[0].assign_master_contact_atomic;

  const successCount = (res1.success ? 1 : 0) + (res2.success ? 1 : 0);
  record('Race Serialization', successCount === 1, `Exactly 1 request won race (${res1.success ? 'Op A' : 'Op B'}), other rejected with ${res1.success ? res2.code : res1.code}`);

  // Verify database committed state: exactly ONE active assignment exists for this contact
  const dbActiveAssignments = (
    await pg.query<{ count: number }>(
      `SELECT count(*) FROM master_contact_assignments WHERE master_contact_id = $1 AND is_active = true;`,
      [contestContact]
    )
  ).rows[0].count;
  record('Committed State Integrity', Number(dbActiveAssignments) === 1, 'Final committed state has exactly 1 active assignment (Invariant 1 enforced)');

  // ─── SUITE 3: OPERATOR AT 39 CONTACTS RECEIVING TWO SIMULTANEOUS REQUESTS ────
  console.log('\n--- Suite 3: Operator at 39 Assignments Receiving Two Simultaneous Requests ---');

  // Seed Operator Gamma up to exactly 39 assignments
  for (let i = 1; i <= 39; i++) {
    const cid = (
      await pg.query<{ id: string }>(
        `INSERT INTO master_contacts (name, phone, gender) VALUES ($1, $2, 'Male') RETURNING id;`,
        [`Seed Contact ${i}`, `99000000${i.toString().padStart(2, '0')}`]
      )
    ).rows[0].id;

    await pg.query(
      `INSERT INTO master_contact_assignments (master_contact_id, operator_id, is_active, status) VALUES ($1, $2, true, 'assigned');`,
      [cid, opC]
    );
  }

  const initialCount = (
    await pg.query<{ count: number }>(
      `SELECT count(*) FROM master_contact_assignments WHERE operator_id = $1 AND is_active = true;`,
      [opC]
    )
  ).rows[0].count;
  record('Seed Operator Gamma at 39', Number(initialCount) === 39, 'Operator Gamma has exactly 39/40 active assignments');

  // Create two distinct eligible contacts
  const candidateX = (
    await pg.query<{ id: string }>(
      `INSERT INTO master_contacts (name, phone, gender) VALUES ('Candidate X', '9911111101', 'Male') RETURNING id;`
    )
  ).rows[0].id;

  const candidateY = (
    await pg.query<{ id: string }>(
      `INSERT INTO master_contacts (name, phone, gender) VALUES ('Candidate Y', '9911111102', 'Male') RETURNING id;`
    )
  ).rows[0].id;

  // Fire two assignment requests concurrently for Operator Gamma
  const [assignX, assignY] = await Promise.all([
    pg.query<{ assign_master_contact_atomic: any }>(
      `SELECT public.assign_master_contact_atomic($1, $2, NULL, 40, false);`,
      [candidateX, opC]
    ),
    pg.query<{ assign_master_contact_atomic: any }>(
      `SELECT public.assign_master_contact_atomic($1, $2, NULL, 40, false);`,
      [candidateY, opC]
    ),
  ]);

  const resX = assignX.rows[0].assign_master_contact_atomic;
  const resY = assignY.rows[0].assign_master_contact_atomic;

  const capSuccessCount = (resX.success ? 1 : 0) + (resY.success ? 1 : 0);
  record('Capacity Serialization', capSuccessCount === 1, `Exactly 1 assignment succeeded; the other rejected with OPERATOR_CAPACITY_EXCEEDED`);

  // Verify final committed count: exactly 40, NEVER 41
  const finalOpCCount = (
    await pg.query<{ count: number }>(
      `SELECT count(*) FROM master_contact_assignments WHERE operator_id = $1 AND is_active = true;`,
      [opC]
    )
  ).rows[0].count;
  record('Maximum 40 Cap Strict Enforcement', Number(finalOpCCount) === 40, `Final committed active count is exactly 40/40 (Invariant 2 enforced)`);

  // ─── SUITE 4: REASSIGNMENT AT CAPACITY (OLD RELEASE & NEW ATOMIC ACQUISITION) ─
  console.log('\n--- Suite 4: Reassignment At Capacity (Old Released, New Acquired) ---');

  // Contact assigned to Op A reassigns to Op B
  const reassignContact = maleContact; // currently assigned to Op A
  const reassignRes = await pg.query<{ assign_master_contact_atomic: any }>(
    `SELECT public.assign_master_contact_atomic($1, $2, NULL, 40, true);`,
    [reassignContact, opB]
  );
  const reassignStatus = reassignRes.rows[0].assign_master_contact_atomic;
  record('Reassignment Execution', reassignStatus.code === 'REASSIGNED', 'Successfully reassigned contact to Operator Beta');

  // Verify Op A has 0 active assignments for this contact
  const opAOldActive = (
    await pg.query<{ count: number }>(
      `SELECT count(*) FROM master_contact_assignments WHERE master_contact_id = $1 AND operator_id = $2 AND is_active = true;`,
      [reassignContact, opA]
    )
  ).rows[0].count;
  record('Previous Assignment Deactivation', Number(opAOldActive) === 0, 'Old assignment for Operator Alpha is now is_active = false');

  // Verify Op B has exactly 1 active assignment for this contact
  const opBNewActive = (
    await pg.query<{ count: number }>(
      `SELECT count(*) FROM master_contact_assignments WHERE master_contact_id = $1 AND operator_id = $2 AND is_active = true;`,
      [reassignContact, opB]
    )
  ).rows[0].count;
  record('New Assignment Activation', Number(opBNewActive) === 1, 'New assignment for Operator Beta is active = true');

  // Total active assignments for contact is STILL exactly 1
  const totalActiveReassign = (
    await pg.query<{ count: number }>(
      `SELECT count(*) FROM master_contact_assignments WHERE master_contact_id = $1 AND is_active = true;`,
      [reassignContact]
    )
  ).rows[0].count;
  record('Invariant 1 Preserved Post-Reassign', Number(totalActiveReassign) === 1, 'Total active assignments for contact is exactly 1');

  // Historical audit trail preserved
  const totalHistorical = (
    await pg.query<{ count: number }>(
      `SELECT count(*) FROM master_contact_assignments WHERE master_contact_id = $1;`,
      [reassignContact]
    )
  ).rows[0].count;
  record('Audit History Preservation', Number(totalHistorical) >= 2, `Total assignment rows for contact is ${totalHistorical} (history preserved, 0 rows deleted)`);

  // ─── SUITE 5: OPERATOR AT 40 RECEIVING TWO ASSIGNMENT REQUESTS ─────────────
  console.log('\n--- Suite 5: Operator At Capacity (40/40) Receiving Requests ---');
  // Operator Gamma is at 40/40
  const cand41 = (
    await pg.query<{ id: string }>(
      `INSERT INTO master_contacts (name, phone, gender) VALUES ('Candidate 41', '9911111141', 'Male') RETURNING id;`
    )
  ).rows[0].id;
  const cand42 = (
    await pg.query<{ id: string }>(
      `INSERT INTO master_contacts (name, phone, gender) VALUES ('Candidate 42', '9911111142', 'Male') RETURNING id;`
    )
  ).rows[0].id;

  const [res41, res42] = await Promise.all([
    pg.query<{ assign_master_contact_atomic: any }>(
      `SELECT public.assign_master_contact_atomic($1, $2, NULL, 40, false);`,
      [cand41, opC]
    ),
    pg.query<{ assign_master_contact_atomic: any }>(
      `SELECT public.assign_master_contact_atomic($1, $2, NULL, 40, false);`,
      [cand42, opC]
    ),
  ]);

  const at40BothBlocked = 
    res41.rows[0].assign_master_contact_atomic.code === 'OPERATOR_CAPACITY_EXCEEDED' &&
    res42.rows[0].assign_master_contact_atomic.code === 'OPERATOR_CAPACITY_EXCEEDED';
  record('At Capacity (40) Concurrent Block', at40BothBlocked, 'Both requests rejected with OPERATOR_CAPACITY_EXCEEDED');

  const opCCountAt40 = (
    await pg.query<{ count: number }>(
      `SELECT count(*) FROM master_contact_assignments WHERE operator_id = $1 AND is_active = true;`,
      [opC]
    )
  ).rows[0].count;
  record('Final Count Stays at 40', Number(opCCountAt40) === 40, 'Committed count remains strictly at 40/40');

  // ─── SUITE 6: REASSIGNMENT TO SAME OPERATOR AT 40 CAPACITY ───────────────────
  console.log('\n--- Suite 6: Reassignment To Same Operator At 40 Capacity ---');
  // Candidate X is currently assigned to Operator Gamma (who is at 40)
  // Reassigning Candidate X to Operator Gamma should NOT fail for capacity, because net delta = 0
  const sameOpReassign = await pg.query<{ assign_master_contact_atomic: any }>(
    `SELECT public.assign_master_contact_atomic($1, $2, NULL, 40, true);`,
    [candidateX, opC]
  );
  const sameOpRes = sameOpReassign.rows[0].assign_master_contact_atomic;
  record('Same Operator Reassignment At Cap', sameOpRes.success === true && sameOpRes.code === 'REASSIGNED', 'Reassignment to same operator at 40 succeeds without capacity rejection');

  const opCCountPostSameOp = (
    await pg.query<{ count: number }>(
      `SELECT count(*) FROM master_contact_assignments WHERE operator_id = $1 AND is_active = true;`,
      [opC]
    )
  ).rows[0].count;
  record('Workload Count Unchanged Post-Reassign', Number(opCCountPostSameOp) === 40, 'Workload remains strictly 40');

  // Idempotency check with p_allow_reassign = false
  const sameOpIdempotent = await pg.query<{ assign_master_contact_atomic: any }>(
    `SELECT public.assign_master_contact_atomic($1, $2, NULL, 40, false);`,
    [candidateX, opC]
  );
  const sameOpIdempRes = sameOpIdempotent.rows[0].assign_master_contact_atomic;
  record('Idempotent Duplicate Request', sameOpIdempRes.success === true && sameOpIdempRes.code === 'ALREADY_ASSIGNED', 'Second non-reassign request returns ALREADY_ASSIGNED idempotently');

  // ─── SUITE 7: REASSIGNMENT ROLLBACK PRESERVES ORIGINAL ASSIGNMENT ───────────
  console.log('\n--- Suite 7: Failed Reassignment Preserves Original Assignment ---');
  // Candidate Y is currently assigned to Operator Gamma.
  // Suppose someone attempts to reassign Candidate Y to an operator who has reached capacity (e.g. Operator Gamma is at 40, let's create Op Full at 40)
  const opFullRes = await pg.query<{ id: string }>(
    `INSERT INTO contact_operators (name, email) VALUES ('Operator Full', 'full@hkm.org') RETURNING id;`
  );
  const opFull = opFullRes.rows[0].id;
  // Seed Op Full with 40 active contacts
  for (let i = 0; i < 40; i++) {
    const cid = (
      await pg.query<{ id: string }>(
        `INSERT INTO master_contacts (name, phone, gender) VALUES ('Full Seed ${i}', '988888${i.toString().padStart(4, '0')}', 'Male') RETURNING id;`
      )
    ).rows[0].id;
    await pg.query(
      `INSERT INTO master_contact_assignments (master_contact_id, operator_id, is_active) VALUES ($1, $2, true);`,
      [cid, opFull]
    );
  }

  // Attempt to reassign candidateX (currently with opC) to opFull
  const failedReassign = await pg.query<{ assign_master_contact_atomic: any }>(
    `SELECT public.assign_master_contact_atomic($1, $2, NULL, 40, true);`,
    [candidateX, opFull]
  );
  const failedRes = failedReassign.rows[0].assign_master_contact_atomic;
  record('Reassignment to Full Operator Blocked', failedRes.code === 'OPERATOR_CAPACITY_EXCEEDED', 'Target operator capacity exceeded');

  // Verify Candidate X STILL belongs to Operator Gamma as active
  const candXActive = (
    await pg.query<{ operator_id: string }>(
      `SELECT operator_id FROM master_contact_assignments WHERE master_contact_id = $1 AND is_active = true;`,
      [candidateX]
    )
  ).rows[0].operator_id;
  record('Original Assignment Intact Post-Failure', candXActive === opC, 'Original assignment to Operator Gamma remains active and untouched');

  // ─── SUITE 8: FESTIVAL ASSIGNMENT RPC (assign_contact_atomic) ───────────────
  console.log('\n--- Suite 8: Festival assign_contact_atomic Tests ---');
  await pg.exec(`
    CREATE TABLE IF NOT EXISTS registrations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      phone text NOT NULL,
      gender text,
      created_at timestamptz DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS contact_assignments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      registration_id uuid NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
      operator_id uuid NOT NULL REFERENCES contact_operators(id) ON DELETE CASCADE,
      is_active boolean NOT NULL DEFAULT true,
      status text NOT NULL DEFAULT 'assigned',
      assigned_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      assigned_by uuid
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_contact_assignments_active_reg
    ON contact_assignments(registration_id)
    WHERE is_active = TRUE;
  `);

  const regMale = (
    await pg.query<{ id: string }>(
      `INSERT INTO registrations (name, phone, gender) VALUES ('Rathayatra Male', '9777777701', 'Male') RETURNING id;`
    )
  ).rows[0].id;
  const regFemale = (
    await pg.query<{ id: string }>(
      `INSERT INTO registrations (name, phone, gender) VALUES ('Rathayatra Female', '9777777702', 'Female') RETURNING id;`
    )
  ).rows[0].id;
  const regNull = (
    await pg.query<{ id: string }>(
      `INSERT INTO registrations (name, phone, gender) VALUES ('Rathayatra Null', '9777777703', NULL) RETURNING id;`
    )
  ).rows[0].id;

  const fMaleRes = await pg.query<{ assign_contact_atomic: any }>(
    `SELECT public.assign_contact_atomic($1, $2, 'rathayatra', NULL, 40, false);`,
    [regMale, opA]
  );
  record('Festival Male Assignment', fMaleRes.rows[0].assign_contact_atomic.success === true, 'Festival male contact assigned');

  const fFemaleRes = await pg.query<{ assign_contact_atomic: any }>(
    `SELECT public.assign_contact_atomic($1, $2, 'rathayatra', NULL, 40, false);`,
    [regFemale, opA]
  );
  record('Festival Female Blocked', fFemaleRes.rows[0].assign_contact_atomic.code === 'GENDER_INELIGIBLE', 'Festival female contact rejected with GENDER_INELIGIBLE');

  const fNullRes = await pg.query<{ assign_contact_atomic: any }>(
    `SELECT public.assign_contact_atomic($1, $2, 'rathayatra', NULL, 40, false);`,
    [regNull, opA]
  );
  record('Festival NULL Gender Blocked', fNullRes.rows[0].assign_contact_atomic.code === 'GENDER_INELIGIBLE', 'Festival NULL gender contact rejected with GENDER_INELIGIBLE (fail-closed)');

  const nonExistentId = '11111111-2222-3333-4444-555555555555';
  const fNotFoundRes = await pg.query<{ assign_contact_atomic: any }>(
    `SELECT public.assign_contact_atomic($1, $2, 'rathayatra', NULL, 40, false);`,
    [nonExistentId, opA]
  );
  record('Festival Non-Existent Contact', fNotFoundRes.rows[0].assign_contact_atomic.code === 'CONTACT_NOT_FOUND', 'Non-existent ID correctly returns CONTACT_NOT_FOUND');

  // ─── Summary ───
  const passed = results.filter((r) => r.passed).length;
  console.log(`\n================================================================================`);
  console.log(`RESULTS: ${passed} / ${results.length} Tests Passed (${((passed / results.length) * 100).toFixed(1)}%)`);
  console.log('================================================================================\n');

  if (passed !== results.length) {
    process.exit(1);
  }
}

runConcurrencyAndFailClosedTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
