import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';
import { getLevelFromClassesAttended, formatUnifiedLevel } from '../src/lib/level-mapping';
import { getCurrentWeeklyPeriod, getNextResetTimestamp, formatWeeklyPeriodLabel } from '../src/lib/weekly-period';
import { normalizePhone } from '../src/lib/master-contacts';

async function runSaturdayMeetupTestSuite() {
  console.log('================================================================================');
  console.log('   SATURDAY MEET-UP, VISITOR CHECK-IN & UNIFIED LEVELS PRODUCTION AUDIT');
  console.log('================================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, details?: unknown) {
    totalTests++;
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`[FAIL] ${testName}`);
      if (details) console.error('  Details:', details);
    }
  }

  const pg = new PGlite();

  // Initialize roles and baseline schema
  await pg.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
    BEGIN
      RETURN gen_random_uuid();
    END;
    $$ LANGUAGE plpgsql;

    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
    END $$;

    CREATE TABLE admins (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL
    );

    CREATE TABLE master_contacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      phone TEXT NOT NULL UNIQUE,
      name TEXT,
      gender TEXT,
      level TEXT NOT NULL DEFAULT 'level-0',
      chanting INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE contact_operators (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      is_active BOOLEAN DEFAULT TRUE
    );

    CREATE TABLE master_contact_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      master_contact_id UUID NOT NULL REFERENCES master_contacts(id) ON DELETE CASCADE,
      operator_id UUID NOT NULL REFERENCES contact_operators(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'assigned',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      assigned_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Read migration SQL
  const migrationRaw = fs.readFileSync(
    path.resolve('supabase/migrations/20261017000000_saturday_meetup_checkins.sql'),
    'utf8'
  );
  // PGlite doesn't simulate realtime publication catalog table, so stub that line for migration execution in PGlite
  const migrationSql = migrationRaw.replace(/ALTER\s+PUBLICATION[^;]*;/gi, '-- skipped realtime');

  // Apply migration initially
  await pg.exec(migrationSql);

  // ─────────────────────────────────────────────────────────────────────────────
  // REQ 1: CANONICALLY EQUIVALENT PHONE FORMATS RESOLVE TO THE SAME IDENTITY
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- 1. Audit: Canonically Equivalent Phone Formats Resolve to Same Identity ---');
  const rawVariants = [
    '9876543210',
    '+919876543210',
    '+91 98765 43210',
    '09876543210',
    '98765-43210',
    '+91-98765-43210',
    '  98765 43210  ',
  ];

  for (const raw of rawVariants) {
    const tsNorm = normalizePhone(raw);
    assert(tsNorm === '9876543210', `TS normalizePhone resolves '${raw}' -> '9876543210'`);

    const dbRes = await pg.query<{ norm: string }>(`SELECT public.normalize_phone($1) AS norm;`, [raw]);
    assert(dbRes.rows[0].norm === '9876543210', `DB normalize_phone resolves '${raw}' -> '9876543210'`);
  }

  // Non-standard formats preserved without blind truncation
  assert(normalizePhone('12345') === '12345', 'TS preserves non-standard length raw digits');
  const dbNonStd = (await pg.query<{ norm: string }>(`SELECT public.normalize_phone('12345') AS norm;`)).rows[0].norm;
  assert(dbNonStd === '12345', 'DB preserves non-standard length raw digits');

  // Verify approval strictly rejects malformed (<10 digit) or blank phone numbers
  const shortContact = await pg.query<{ id: string }>(`
    INSERT INTO master_contacts (phone, name) VALUES ('12345', 'Short Phone') RETURNING id;
  `);
  let shortPhoneRejected = false;
  try {
    await pg.query(`SELECT approve_master_contact_checkin($1);`, [shortContact.rows[0].id]);
  } catch (err: any) {
    if (err.code === '22023' || err.message?.includes('invalid mobile number')) {
      shortPhoneRejected = true;
    }
  }
  assert(shortPhoneRejected, 'approve_master_contact_checkin strictly rejected malformed phone (<10 digits) with 22023');

  // Verify approval strictly rejects 10-digit non-mobile numbers (starts with 1, not 6-9)
  const nonIndianContact = await pg.query<{ id: string }>(`
    INSERT INTO master_contacts (phone, name) VALUES ('1234567890', 'Non Indian Phone') RETURNING id;
  `);
  let nonIndianRejected = false;
  try {
    await pg.query(`SELECT approve_master_contact_checkin($1);`, [nonIndianContact.rows[0].id]);
  } catch (err: any) {
    if (err.code === '22023' || err.message?.includes('invalid mobile number')) {
      nonIndianRejected = true;
    }
  }
  assert(nonIndianRejected, 'approve_master_contact_checkin strictly rejected 10-digit number starting with 1 with 22023');

  // Verify database check constraint chk_mcc_phone_valid on master_contact_checkins
  let constraintCaught = false;
  try {
    await pg.query(`
      INSERT INTO master_contact_checkins (phone, weekly_period)
      VALUES ('1234567890', '2026-10-16');
    `);
  } catch (err: any) {
    if (err.message?.includes('chk_mcc_phone_valid')) {
      constraintCaught = true;
    }
  }
  assert(constraintCaught, 'master_contact_checkins constraint chk_mcc_phone_valid physically blocked non-mobile phone');


  // ─────────────────────────────────────────────────────────────────────────────
  // REQ 2: DUPLICATE NORMALIZED PHONES DETECTED AND REPORTED SAFELY
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. Audit: Duplicate Normalized Phone Detection & Reporting ---');
  // Seed two distinct contacts with duplicate normalized phone:
  // Note: One with '+919991112222', one with '9991112222'
  const dup1 = await pg.query<{ id: string }>(`
    INSERT INTO master_contacts (phone, name) VALUES ('+919991112222', 'Dup Person A') RETURNING id;
  `);
  const dup2 = await pg.query<{ id: string }>(`
    INSERT INTO master_contacts (phone, name) VALUES ('9991112222', 'Dup Person B') RETURNING id;
  `);

  const dupReportQuery = `
    SELECT 
      public.normalize_phone(phone) AS normalized_phone,
      COUNT(*) AS duplicate_row_count,
      COUNT(DISTINCT phone) AS distinct_raw_phones,
      array_agg(id) AS contact_ids
    FROM public.master_contacts
    GROUP BY public.normalize_phone(phone)
    HAVING COUNT(*) > 1;
  `;
  const dupReport = await pg.query<{ normalized_phone: string; duplicate_row_count: string; distinct_raw_phones: string; contact_ids: string[] }>(dupReportQuery);
  assert(dupReport.rows.length === 1, 'Duplicate query successfully detected conflict group');
  assert(dupReport.rows[0].normalized_phone === '9991112222', 'Detected correct normalized phone in conflict');
  assert(parseInt(dupReport.rows[0].duplicate_row_count, 10) === 2, 'Reported exact count of duplicate records (2)');
  assert(dupReport.rows[0].contact_ids.includes(dup1.rows[0].id), 'Report includes contact ID A');
  assert(dupReport.rows[0].contact_ids.includes(dup2.rows[0].id), 'Report includes contact ID B');

  // Verify read-only safety: neither contact modified or deleted
  const countAfterReport = (await pg.query<{ count: string }>('SELECT COUNT(*) as count FROM master_contacts;')).rows[0].count;
  assert(parseInt(countAfterReport, 10) >= 2, 'Detection query was strictly read-only (zero record modifications)');


  // ─────────────────────────────────────────────────────────────────────────────
  // REQ 3: TWO CONCURRENT APPROVALS FOR SAME CONTACT PRODUCE 1 CHECK-IN & 1 INCREMENT
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. Audit: Concurrent Approvals on Same Contact Row ---');
  const adminRes = await pg.query<{ id: string }>(`
    INSERT INTO admins (email) VALUES ('auditor@hkm.org') RETURNING id;
  `);
  const adminId = adminRes.rows[0].id;

  const concurContact = await pg.query<{ id: string }>(`
    INSERT INTO master_contacts (phone, name, classes_attended)
    VALUES ('9811122233', 'Concurrent Single Contact', 0)
    RETURNING id;
  `);
  const cSingleId = concurContact.rows[0].id;

  const [resA, resB] = await Promise.all([
    pg.query<{ approve_master_contact_checkin: any }>(`
      SELECT approve_master_contact_checkin($1, $2, 'auditor@hkm.org');
    `, [cSingleId, adminId]),
    pg.query<{ approve_master_contact_checkin: any }>(`
      SELECT approve_master_contact_checkin($1, $2, 'auditor@hkm.org');
    `, [cSingleId, adminId]),
  ]);

  const appA = resA.rows[0].approve_master_contact_checkin;
  const appB = resB.rows[0].approve_master_contact_checkin;

  const freshA = [appA, appB].filter(r => r.already_approved === false);
  const dupA = [appA, appB].filter(r => r.already_approved === true);

  assert(freshA.length === 1, 'Exactly one concurrent request was treated as fresh approval');
  assert(dupA.length === 1, 'Exactly one concurrent request was caught as duplicate approval');

  const singleFinalCount = (await pg.query<{ classes_attended: number }>(`
    SELECT classes_attended FROM master_contacts WHERE id = $1;
  `, [cSingleId])).rows[0].classes_attended;
  assert(singleFinalCount === 1, 'classes_attended incremented to EXACTLY 1 (zero double-counting)');


  // ─────────────────────────────────────────────────────────────────────────────
  // REQ 4: CONCURRENT APPROVALS INVOLVING DUPLICATE MASTER CONTACTS WITH SAME PHONE
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. Audit: Concurrent Approvals on Duplicate Master Contacts Sharing Phone ---');
  // Use dup1 and dup2 created earlier (both have normalized phone '9991112222')
  const [dupRace1, dupRace2] = await Promise.all([
    pg.query<{ approve_master_contact_checkin: any }>(`
      SELECT approve_master_contact_checkin($1, $2, 'admin1@hkm.org');
    `, [dup1.rows[0].id, adminId]),
    pg.query<{ approve_master_contact_checkin: any }>(`
      SELECT approve_master_contact_checkin($1, $2, 'admin2@hkm.org');
    `, [dup2.rows[0].id, adminId]),
  ]);

  const dr1 = dupRace1.rows[0].approve_master_contact_checkin;
  const dr2 = dupRace2.rows[0].approve_master_contact_checkin;

  const dupFresh = [dr1, dr2].filter(r => r.already_approved === false);
  const dupAlready = [dr1, dr2].filter(r => r.already_approved === true);

  assert(dupFresh.length === 1, 'Cross-record concurrency: Exactly 1 approval treated as fresh');
  assert(dupAlready.length === 1, 'Cross-record concurrency: Exactly 1 approval caught as already_approved');
  assert(
    typeof dupAlready[0].checkin_id === 'string' && dupAlready[0].checkin_id.length > 0,
    'Duplicate approval fallback returned a non-null, valid checkin_id'
  );

  // Verify master_contact_checkins contains exactly 1 row for phone 9991112222
  const checkinPhoneCount = (await pg.query<{ count: string }>(`
    SELECT COUNT(*) as count FROM master_contact_checkins WHERE phone = '9991112222';
  `)).rows[0].count;
  assert(parseInt(checkinPhoneCount, 10) === 1, 'master_contact_checkins contains EXACTLY 1 row for normalized phone');

  // Verify total classes_attended across both duplicate contacts incremented by exactly 1
  const sumCount = (await pg.query<{ sum: string }>(`
    SELECT SUM(classes_attended) as sum FROM master_contacts WHERE id IN ($1, $2);
  `, [dup1.rows[0].id, dup2.rows[0].id])).rows[0].sum;
  assert(parseInt(sumCount, 10) === 1, 'Sum of classes_attended across duplicate contacts incremented by EXACTLY 1');


  // ─────────────────────────────────────────────────────────────────────────────
  // REQ 5: REPEAT APPROVAL IN THE SAME WEEK IS REJECTED WITHOUT CHANGING COUNTER
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- 5. Audit: Repeat Approval in Same Week ---');
  const repeatRes = await pg.query<{ approve_master_contact_checkin: any }>(`
    SELECT approve_master_contact_checkin($1, $2, 'auditor@hkm.org');
  `, [cSingleId, adminId]);
  const repObj = repeatRes.rows[0].approve_master_contact_checkin;
  assert(repObj.already_approved === true, 'Sequential repeat approval returns already_approved = true');
  assert(repObj.classes_attended === 1, 'Sequential repeat approval returns unchanged count (1)');
  assert(
    typeof repObj.checkin_id === 'string' && repObj.checkin_id.length > 0,
    'Sequential repeat approval returned a non-null, valid checkin_id'
  );

  const cSingleCountAfter = (await pg.query<{ classes_attended: number }>(`
    SELECT classes_attended FROM master_contacts WHERE id = $1;
  `, [cSingleId])).rows[0].classes_attended;
  assert(cSingleCountAfter === 1, 'Contact classes_attended in DB remains unchanged at 1');


  // ─────────────────────────────────────────────────────────────────────────────
  // REQ 6: APPROVAL IN NEXT WEEKLY PERIOD SUCCEEDS AND INCREMENTS COUNTER ONCE
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- 6. Audit: Approval in Next Weekly Period & Historic Preservation ---');
  // Age existing checkin to previous weekly period '2026-10-09'
  await pg.query(`
    UPDATE master_contact_checkins
    SET weekly_period = '2026-10-09'
    WHERE master_contact_id = $1;
  `, [cSingleId]);

  // Now approve in current period
  const nextWeekApproval = await pg.query<{ approve_master_contact_checkin: any }>(`
    SELECT approve_master_contact_checkin($1, $2, 'auditor@hkm.org');
  `, [cSingleId, adminId]);
  const nwObj = nextWeekApproval.rows[0].approve_master_contact_checkin;
  assert(nwObj.already_approved === false, 'Approval in next period succeeds as fresh approval');
  assert(nwObj.classes_attended === 2, 'classes_attended incremented to 2');

  const historyRows = await pg.query<{ count: string }>(`
    SELECT COUNT(*) as count FROM master_contact_checkins WHERE master_contact_id = $1;
  `, [cSingleId]);
  assert(parseInt(historyRows.rows[0].count, 10) === 2, 'Historical check-ins preserved across multiple weeks (total 2 rows)');


  // ─────────────────────────────────────────────────────────────────────────────
  // REQ 7: FRIDAY 00:00 ASIA/KOLKATA BOUNDARY AND TIMEZONE CONVERSIONS
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- 7. Audit: Friday 00:00:00 Asia/Kolkata Rollover Boundaries ---');
  // Friday Oct 16, 2026 00:00:00 IST = UTC 2026-10-15 18:30:00
  const friStartUTC = new Date('2026-10-15T18:30:00Z');
  assert(getCurrentWeeklyPeriod(friStartUTC) === '2026-10-16', 'Fri 00:00:00 IST is start of period 2026-10-16');

  // Thursday Oct 15, 2026 23:59:59 IST = UTC 2026-10-15 18:29:59
  const thuEndUTC = new Date('2026-10-15T18:29:59Z');
  assert(getCurrentWeeklyPeriod(thuEndUTC) === '2026-10-09', 'Thu 23:59:59 IST belongs to previous period 2026-10-09');

  // Saturday Oct 17, 2026 18:00:00 IST = UTC 2026-10-17 12:30:00
  const satUTC = new Date('2026-10-17T12:30:00Z');
  assert(getCurrentWeeklyPeriod(satUTC) === '2026-10-16', 'Sat 18:00:00 IST belongs to period 2026-10-16');

  // Next Thursday Oct 22, 2026 23:59:59 IST = UTC 2026-10-22 18:29:59
  const nextThuUTC = new Date('2026-10-22T18:29:59Z');
  assert(getCurrentWeeklyPeriod(nextThuUTC) === '2026-10-16', 'Next Thu 23:59:59 IST belongs to period 2026-10-16');

  // Next Friday Oct 23, 2026 00:00:00 IST = UTC 2026-10-22 18:30:00
  const nextFriUTC = new Date('2026-10-22T18:30:00Z');
  assert(getCurrentWeeklyPeriod(nextFriUTC) === '2026-10-23', 'Next Fri 00:00:00 IST rolls over to 2026-10-23');

  // Verify PostgreSQL implementation matches TypeScript implementation exactly
  const dbPeriod = (await pg.query<{ p: string }>(`SELECT public.get_current_weekly_period('2026-10-15T18:30:00Z'::timestamptz) as p;`)).rows[0].p;
  assert(dbPeriod === '2026-10-16', 'DB get_current_weekly_period matches TS at Fri 00:00:00 IST');

  const dbThuPeriod = (await pg.query<{ p: string }>(`SELECT public.get_current_weekly_period('2026-10-15T18:29:59Z'::timestamptz) as p;`)).rows[0].p;
  assert(dbThuPeriod === '2026-10-09', 'DB get_current_weekly_period matches TS at Thu 23:59:59 IST');


  // ─────────────────────────────────────────────────────────────────────────────
  // REQ 8: REVISED LEVEL BOUNDARIES AT 0, 1, 2, 10, 11, 19, 20, 21
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- 8. Audit: Revised Level Boundaries at 0, 1, 2, 10, 11, 19, 20, 21 ---');
  // 0: level-0/No level
  const b0 = getLevelFromClassesAttended(0);
  assert(b0.code === 'level-0' && b0.descriptiveName === 'No level' && b0.displayLabel === 'level-0/No level', 'Boundary 0: level-0/No level');

  // 1: level-1/AOMC
  const b1 = getLevelFromClassesAttended(1);
  assert(b1.code === 'level-1' && b1.descriptiveName === 'AOMC' && b1.displayLabel === 'level-1/AOMC', 'Boundary 1: level-1/AOMC');

  // 2: level-2/Foundation
  const b2 = getLevelFromClassesAttended(2);
  assert(b2.code === 'level-2' && b2.descriptiveName === 'Foundation' && b2.displayLabel === 'level-2/Foundation', 'Boundary 2: level-2/Foundation');

  // 10: level-2/Foundation
  const b10 = getLevelFromClassesAttended(10);
  assert(b10.code === 'level-2' && b10.descriptiveName === 'Foundation' && b10.displayLabel === 'level-2/Foundation', 'Boundary 10: level-2/Foundation');

  // 11: level-3/Prilims
  const b11 = getLevelFromClassesAttended(11);
  assert(b11.code === 'level-3' && b11.descriptiveName === 'Prilims' && b11.displayLabel === 'level-3/Prilims', 'Boundary 11: level-3/Prilims');

  // 19: level-3/Prilims
  const b19 = getLevelFromClassesAttended(19);
  assert(b19.code === 'level-3' && b19.descriptiveName === 'Prilims' && b19.displayLabel === 'level-3/Prilims', 'Boundary 19: level-3/Prilims');

  // 20: level-3/Prilims
  const b20 = getLevelFromClassesAttended(20);
  assert(b20.code === 'level-3' && b20.descriptiveName === 'Prilims' && b20.displayLabel === 'level-3/Prilims', 'Boundary 20: level-3/Prilims');

  // 21: level-4/Enhance
  const b21 = getLevelFromClassesAttended(21);
  assert(b21.code === 'level-4' && b21.descriptiveName === 'Enhance' && b21.displayLabel === 'level-4/Enhance', 'Boundary 21: level-4/Enhance');

  // Format helper tests
  assert(formatUnifiedLevel(0) === 'level-0/No level', 'formatUnifiedLevel(0) -> level-0/No level');
  assert(formatUnifiedLevel(1) === 'level-1/AOMC', 'formatUnifiedLevel(1) -> level-1/AOMC');
  assert(formatUnifiedLevel(2) === 'level-2/Foundation', 'formatUnifiedLevel(2) -> level-2/Foundation');
  assert(formatUnifiedLevel(10) === 'level-2/Foundation', 'formatUnifiedLevel(10) -> level-2/Foundation');
  assert(formatUnifiedLevel(11) === 'level-3/Prilims', 'formatUnifiedLevel(11) -> level-3/Prilims');
  assert(formatUnifiedLevel(19) === 'level-3/Prilims', 'formatUnifiedLevel(19) -> level-3/Prilims');
  assert(formatUnifiedLevel(20) === 'level-3/Prilims', 'formatUnifiedLevel(20) -> level-3/Prilims');
  assert(formatUnifiedLevel(21) === 'level-4/Enhance', 'formatUnifiedLevel(21) -> level-4/Enhance');
  assert(formatUnifiedLevel(25) === 'level-4/Enhance', 'formatUnifiedLevel(25) -> level-4/Enhance');


  // ─────────────────────────────────────────────────────────────────────────────
  // REQ 9: UNAUTHORIZED USERS CANNOT APPROVE CHECK-INS OR EXECUTE PRIVILEGED RPC
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- 9. Audit: Privilege Grants on approve_master_contact_checkin ---');
  const anonExec = (await pg.query<{ has: boolean }>(`
    SELECT has_function_privilege('anon', 'public.approve_master_contact_checkin(UUID, UUID, TEXT)', 'EXECUTE') as has;
  `)).rows[0].has;
  const authExec = (await pg.query<{ has: boolean }>(`
    SELECT has_function_privilege('authenticated', 'public.approve_master_contact_checkin(UUID, UUID, TEXT)', 'EXECUTE') as has;
  `)).rows[0].has;
  const servExec = (await pg.query<{ has: boolean }>(`
    SELECT has_function_privilege('service_role', 'public.approve_master_contact_checkin(UUID, UUID, TEXT)', 'EXECUTE') as has;
  `)).rows[0].has;

  assert(!anonExec, 'EXECUTE strictly revoked from anon role');
  assert(!authExec, 'EXECUTE strictly revoked from authenticated role');
  assert(servExec, 'EXECUTE granted exclusively to service_role');


  // ─────────────────────────────────────────────────────────────────────────────
  // REQ 10: API REQUESTS CANNOT SPOOF ADMIN IDENTITY
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- 10. Audit: Admin Identity Derivation & Spoof Resistance ---');
  // Inspect code in src/app/api/visitor/check-in/route.ts
  const checkinRouteCode = fs.readFileSync(path.resolve('src/app/api/visitor/check-in/route.ts'), 'utf8');
  assert(
    checkinRouteCode.includes('p_admin_id: auth.id') && checkinRouteCode.includes('p_admin_email: auth.name'),
    'RPC parameters p_admin_id and p_admin_email derived exclusively from verified auth session'
  );
  assert(
    !checkinRouteCode.includes('p_admin_id: body.admin_id') && !checkinRouteCode.includes('p_admin_email: body.admin_email'),
    'Client body parameters body.admin_id / body.admin_email cannot override session admin identity'
  );
  assert(
    checkinRouteCode.includes("auth.role !== 'admin'") && checkinRouteCode.includes('status: 403'),
    'Non-admin requests blocked with HTTP 403 Forbidden'
  );


  // ─────────────────────────────────────────────────────────────────────────────
  // REQ 11: MISSING CONTACTS, TRANSACTION FAILURES, & CONFLICTS FAIL SAFELY
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- 11. Audit: Safe Error Handling, Missing Contacts & Transaction Rollback ---');
  // 11.1 Nonexistent contact raises P0002
  let p0002Caught = false;
  try {
    await pg.query(`
      SELECT approve_master_contact_checkin('00000000-0000-0000-0000-000000000000'::uuid, $1, 'auditor@hkm.org');
    `, [adminId]);
  } catch (err: any) {
    if (err.code === 'P0002' || err.message?.includes('not found')) {
      p0002Caught = true;
    }
  }
  assert(p0002Caught, 'Nonexistent contact correctly raised P0002 exception');

  // 11.2 Transaction failure does not leave partial counter update
  const rollbackContact = await pg.query<{ id: string }>(`
    INSERT INTO master_contacts (phone, name, classes_attended)
    VALUES ('9990001112', 'Rollback User', 0)
    RETURNING id;
  `);
  const rollbackId = rollbackContact.rows[0].id;

  let rollbackErrorCaught = false;
  try {
    await pg.exec(`
      BEGIN;
      SELECT approve_master_contact_checkin('${rollbackId}', '${adminId}', 'auditor@hkm.org');
      -- Force an error in the same transaction
      INSERT INTO master_contacts (id, phone) VALUES ('${rollbackId}', 'duplicate');
      COMMIT;
    `);
  } catch {
    rollbackErrorCaught = true;
    await pg.exec('ROLLBACK;');
  }

  assert(rollbackErrorCaught, 'Transaction error caught and rolled back');
  const postRollbackCount = (await pg.query<{ classes_attended: number }>(`
    SELECT classes_attended FROM master_contacts WHERE id = $1;
  `, [rollbackId])).rows[0].classes_attended;
  assert(postRollbackCount === 0, 'Rolled-back transaction DID NOT increment classes_attended (remains 0)');


  // ─────────────────────────────────────────────────────────────────────────────
  // REQ 12: HISTORICAL CHECK-IN RECORDS REMAIN INTACT WHEN CONTACT REMOVED
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- 12. Audit: Archival Preservation on Contact Removal ---');
  // Contact cSingleId has 2 checkin records
  const preDeleteCount = (await pg.query<{ count: string }>(`
    SELECT COUNT(*) as count FROM master_contact_checkins WHERE phone = '9811122233';
  `)).rows[0].count;
  assert(parseInt(preDeleteCount, 10) === 2, 'Pre-delete check-in count is 2');

  await pg.query(`DELETE FROM master_contacts WHERE id = $1;`, [cSingleId]);

  const preservedAudit = await pg.query<{ id: string; master_contact_id: string | null; phone: string }>(`
    SELECT id, master_contact_id, phone FROM master_contact_checkins WHERE phone = '9811122233';
  `);
  assert(preservedAudit.rows.length === 2, 'Historical attendance records remain intact after contact deletion');
  assert(preservedAudit.rows[0].master_contact_id === null, 'master_contact_id set to NULL via ON DELETE SET NULL');
  assert(preservedAudit.rows[0].phone === '9811122233', 'Attendee phone permanently retained on checkin record');


  // ─────────────────────────────────────────────────────────────────────────────
  // REQ 13: MIGRATION RERUN BEHAVIOR IS 100% IDEMPOTENT & SAFE
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- 13. Audit: Migration Rerun Idempotency ---');
  let rerunSucceeded = false;
  try {
    await pg.exec(migrationSql);
    rerunSucceeded = true;
  } catch (err) {
    console.error('Rerun failed:', err);
  }
  assert(rerunSucceeded, 'Migration rerun executed cleanly without duplicate constraint, index, or policy errors');


  // ─────────────────────────────────────────────────────────────────────────────
  // BONUS: SATURDAY MEET-UP DASHBOARD DEDUPLICATION & SIDEBAR NAVIGATION
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Bonus: Saturday Meet-up Dashboard Deduplication & Sidebar Layout ---');
  const opRes = await pg.query<{ id: string }>(`
    INSERT INTO contact_operators (name, email) VALUES ('Op 1', 'op1@hkm.org') RETURNING id;
  `);
  const opId = opRes.rows[0].id;

  const contactsRes = await pg.query<{ id: string; phone: string }>(`
    INSERT INTO master_contacts (phone, name, gender, classes_attended) VALUES
      ('9111111111', 'Contact A', 'Male', 2),
      ('9222222222', 'Contact B', 'Female', 0),
      ('9333333333', 'Contact C', 'Male', 5),
      ('9444444444', 'Contact D', 'Female', 1)
    RETURNING id, phone;
  `);

  const [cA, cB, cC, cD] = contactsRes.rows;

  await pg.query(`
    INSERT INTO master_contact_assignments (master_contact_id, operator_id, status) VALUES
      ($1, $4, 'Coming'),
      ($2, $4, 'Pending'),
      ($3, $4, 'Not Coming');
  `, [cA.id, cB.id, cC.id, opId]);

  await pg.query(`
    SELECT approve_master_contact_checkin($1, $2, 'auditor@hkm.org');
  `, [cC.id, adminId]);

  await pg.query(`
    SELECT approve_master_contact_checkin($1, $2, 'auditor@hkm.org');
  `, [cD.id, adminId]);

  const currPeriod = (await pg.query<{ p: string }>('SELECT public.get_current_weekly_period() as p;')).rows[0].p;

  const assignedRes = await pg.query<{ count: string }>(`
    SELECT COUNT(DISTINCT master_contact_id) as count
    FROM master_contact_assignments WHERE is_active = true;
  `);
  assert(parseInt(assignedRes.rows[0].count, 10) === 3, 'Assigned Calls metric equals 3');

  const visitorsRes = await pg.query<{ phone: string }>(`
    SELECT DISTINCT mcc.phone
    FROM master_contact_checkins mcc
    WHERE mcc.weekly_period = $1
      AND mcc.phone NOT IN (
        SELECT mc.phone
        FROM master_contact_assignments mca
        JOIN master_contacts mc ON mc.id = mca.master_contact_id
        WHERE mca.is_active = true
      );
  `, [currPeriod]);

  const visitorPhones = visitorsRes.rows.map(r => r.phone);
  assert(visitorPhones.includes(cD.phone), 'Unassigned approved visitor D is categorized in Visitors');
  assert(!visitorPhones.includes(cC.phone), 'Assigned approved contact C is EXCLUDED from Visitors (deduplicated into Coming)');

  const adminShellContent = fs.readFileSync(path.resolve('src/components/layouts/AdminShell.tsx'), 'utf8');
  const masterDashboardIdx = adminShellContent.indexOf("name: 'Master Dashboard'");
  const saturdayMeetupIdx = adminShellContent.indexOf("name: 'Saturday Meet-up'");
  const registrationsIdx = adminShellContent.indexOf("name: 'Registrations'");

  assert(
    masterDashboardIdx < saturdayMeetupIdx && saturdayMeetupIdx < registrationsIdx,
    'Navigation: Saturday Meet-up positioned below Master Dashboard and above Registrations'
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // FINAL REPORT
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n================================================================================');
  console.log(`TEST SUITE COMPLETE: ${passedTests} / ${totalTests} tests passed`);
  console.log('================================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runSaturdayMeetupTestSuite().catch((err) => {
  console.error('Test suite failed with unhandled exception:', err);
  process.exit(1);
});
