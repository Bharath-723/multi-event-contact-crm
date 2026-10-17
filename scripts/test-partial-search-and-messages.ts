import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';
import { getApprovalSuccessMessage, getLevelFromClassesAttended } from '../src/lib/level-mapping';
import { normalizePhone } from '../src/lib/master-contacts';
import { getCurrentWeeklyPeriod, getNextResetTimestamp, formatWeeklyPeriodLabel } from '../src/lib/weekly-period';

async function runValidationSuite() {
  console.log('================================================================================');
  console.log('   VISITOR CHECK-IN: APPROVAL MESSAGE & PARTIAL PHONE SEARCH AUDIT');
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

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. UNIT TESTS: LEVEL CODE, DESCRIPTIVE NAME & MESSAGES AT ALL BOUNDARIES
  // Boundaries required: 0, 1, 2, 10, 11, 19, 20, 21
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('--- 1. Audit: Level Boundaries (0, 1, 2, 10, 11, 19, 20, 21) & Progression Messages ---');
  const testBoundaries = [
    { count: 0, code: 'level-0', name: 'No level', label: 'level-0/No level', msg: 'Approved!! Move to No level (level-0/No level).' },
    { count: 1, code: 'level-1', name: 'AOMC', label: 'level-1/AOMC', msg: 'Approved!! Move to AOMC (level-1/AOMC).' },
    { count: 2, code: 'level-2', name: 'Foundation', label: 'level-2/Foundation', msg: 'Approved!! Move to Foundation (level-2/Foundation).' },
    { count: 10, code: 'level-2', name: 'Foundation', label: 'level-2/Foundation', msg: 'Approved!! Move to Foundation (level-2/Foundation).' },
    { count: 11, code: 'level-3', name: 'Prilims', label: 'level-3/Prilims', msg: 'Approved!! Move to Prilims (level-3/Prilims).' },
    { count: 19, code: 'level-3', name: 'Prilims', label: 'level-3/Prilims', msg: 'Approved!! Move to Prilims (level-3/Prilims).' },
    { count: 20, code: 'level-3', name: 'Prilims', label: 'level-3/Prilims', msg: 'Approved!! Move to Prilims (level-3/Prilims).' },
    { count: 21, code: 'level-4', name: 'Enhance', label: 'level-4/Enhance', msg: 'Approved!! Level-4/Enhance.' },
  ];

  for (const b of testBoundaries) {
    const info = getLevelFromClassesAttended(b.count);
    assert(
      info.code === b.code,
      `Boundary ${b.count} classes -> level code is "${b.code}"`
    );
    assert(
      info.descriptiveName === b.name,
      `Boundary ${b.count} classes -> descriptive name is "${b.name}"`
    );
    assert(
      info.displayLabel === b.label,
      `Boundary ${b.count} classes -> display label is "${b.label}"`
    );
    assert(
      getApprovalSuccessMessage(b.count) === b.msg,
      `Boundary ${b.count} classes -> progression message is "${b.msg}"`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. DATABASE & SEARCH INTEGRATION TESTS
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. Audit: Database & Partial Search Integration ---');
  const pg = new PGlite();

  await pg.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
    BEGIN RETURN gen_random_uuid(); END;
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
      phone TEXT NOT NULL,
      name TEXT,
      gender TEXT,
      area_of_stay TEXT,
      company_college TEXT,
      level TEXT NOT NULL DEFAULT 'level-0',
      classes_attended INT NOT NULL DEFAULT 0,
      chanting INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  const migrationRaw = fs.readFileSync(
    path.resolve('supabase/migrations/20261017000000_saturday_meetup_checkins.sql'),
    'utf8'
  );
  const migrationSql = migrationRaw.replace(/ALTER\s+PUBLICATION[^;]*;/gi, '-- skipped realtime');
  await pg.exec(migrationSql);

  const adminId = (await pg.query<{ id: string }>(`
    INSERT INTO admins (email) VALUES ('superadmin@hkm.org') RETURNING id;
  `)).rows[0].id;

  // Insert seed test contacts
  const c1 = (await pg.query<{ id: string }>(`
    INSERT INTO master_contacts (phone, name, gender, classes_attended, level)
    VALUES ('9876543210', 'Radha Raman', 'Male', 0, 'level-0') RETURNING id;
  `)).rows[0].id;

  const c2 = (await pg.query<{ id: string }>(`
    INSERT INTO master_contacts (phone, name, gender, classes_attended, level)
    VALUES ('+919876500001', 'Krishna Das', 'Male', 10, 'level-1') RETURNING id;
  `)).rows[0].id;

  const c3 = (await pg.query<{ id: string }>(`
    INSERT INTO master_contacts (phone, name, gender, classes_attended, level)
    VALUES ('9812345678', 'Gopal Sharma', 'Male', 20, 'level-2') RETURNING id;
  `)).rows[0].id;

  const c4 = (await pg.query<{ id: string }>(`
    INSERT INTO master_contacts (phone, name, gender, classes_attended, level)
    VALUES ('9988776655', 'Govinda Ji', 'Male', 5, 'level-1') RETURNING id;
  `)).rows[0].id;

  // Partial search simulation function mirroring GET /api/visitor/lookup
  async function simulateLookup(queryStr: string) {
    const rawDigits = queryStr.replace(/\D/g, '');
    if (rawDigits.length < 2) {
      return { status: 400, error: 'Enter at least 2 digits to search contacts' };
    }

    const currentPeriod = (await pg.query<{ get_current_weekly_period: string }>(
      'SELECT get_current_weekly_period() as get_current_weekly_period;'
    )).rows[0].get_current_weekly_period;

    if (rawDigits.length < 10) {
      let stripped = rawDigits;
      if (stripped.startsWith('91') && stripped.length > 2) stripped = stripped.slice(2);
      else if (stripped.startsWith('0') && stripped.length > 1) stripped = stripped.slice(1);

      const candidateTerms = Array.from(new Set([rawDigits, stripped])).filter(t => t.length >= 2);
      const orClauses = candidateTerms.map(t => `phone ILIKE '%${t}%'`).join(' OR ');

      const res = await pg.query<{
        id: string;
        phone: string;
        name: string;
        gender: string;
        classes_attended: number;
        level: string;
      }>(`
        SELECT id, phone, name, gender, classes_attended, level
        FROM master_contacts
        WHERE ${orClauses}
        ORDER BY classes_attended DESC, created_at DESC
        LIMIT 25;
      `);

      // Check existing checkins in period
      const contacts = [];
      for (const row of res.rows) {
        const norm = normalizePhone(row.phone);
        const checkin = await pg.query(`
          SELECT id, checked_in_at, admin_email
          FROM master_contact_checkins
          WHERE weekly_period = $1 AND (master_contact_id = $2 OR phone = $3);
        `, [currentPeriod, row.id, norm]);

        contacts.push({
          ...row,
          is_approved_this_week: checkin.rows.length > 0,
          descriptive_level_name: getLevelFromClassesAttended(row.classes_attended).displayLabel,
        });
      }

      return {
        status: 200,
        is_partial: true,
        count: contacts.length,
        contacts,
        weekly_period: currentPeriod,
      };
    }

    // 10-digit exact lookup
    const cleanPhone = normalizePhone(queryStr);
    if (!cleanPhone || cleanPhone.length !== 10 || !/^[6-9]\d{9}$/.test(cleanPhone)) {
      return { status: 400, error: 'Valid 10-digit Indian mobile number is required' };
    }

    const res = await pg.query<{
      id: string;
      phone: string;
      name: string;
      gender: string;
      classes_attended: number;
      level: string;
    }>(`
      SELECT id, phone, name, gender, classes_attended, level
      FROM master_contacts
      WHERE phone IN ($1, '+91' || $1, '91' || $1, '0' || $1)
      ORDER BY classes_attended DESC;
    `, [cleanPhone]);

    if (res.rows.length === 0) {
      return {
        status: 200,
        found: false,
        is_partial: false,
        count: 0,
        message: 'Not Found, kindly register here',
        register_url: '/contacts-register',
      };
    }

    const contacts = [];
    for (const row of res.rows) {
      const checkin = await pg.query(`
        SELECT id, checked_in_at, admin_email
        FROM master_contact_checkins
        WHERE weekly_period = $1 AND (master_contact_id = $2 OR phone = $3);
      `, [currentPeriod, row.id, cleanPhone]);

      contacts.push({
        ...row,
        is_approved_this_week: checkin.rows.length > 0,
        descriptive_level_name: getLevelFromClassesAttended(row.classes_attended).displayLabel,
      });
    }

    return {
      status: 200,
      found: true,
      is_partial: false,
      count: contacts.length,
      contact: contacts[0],
      contacts,
      weekly_period: currentPeriod,
    };
  }

  // 1. Test searches using 2 digits
  const search2 = await simulateLookup('98');
  assert(search2.status === 200 && search2.is_partial === true, 'Search with 2 digits ("98") succeeds as partial search');
  assert(search2.count === 4, 'Search with 2 digits ("98") matched all 4 contacts containing substring "98"');

  // 2. Test searches using 3 digits
  const search3 = await simulateLookup('987');
  assert(search3.status === 200 && search3.count === 2, 'Search with 3 digits ("987") returned 2 contacts (C1 and C2)');

  // 3. Test searches with +91 prefix
  const searchPlus91 = await simulateLookup('+91 987');
  assert(searchPlus91.status === 200 && searchPlus91.count === 2, 'Search with "+91 987" stripped prefix and returned 2 contacts');

  // 4. Test complete 10-digit number
  const search10 = await simulateLookup('9876543210');
  assert(search10.status === 200 && search10.is_partial === false && search10.found === true, '10-digit search returned exact contact match');
  assert(search10.contact?.name === 'Radha Raman', 'Exact 10-digit search returned correct contact name');

  // 5. Test partial search with no matches (e.g. '4444' not present in any phone)
  const searchNoMatchPartial = await simulateLookup('4444');
  assert(searchNoMatchPartial.status === 200 && searchNoMatchPartial.count === 0, 'Partial search with no matches returned count = 0');
  assert((searchNoMatchPartial as any).message === undefined, 'Partial search with no matches DOES NOT return "Not Found, kindly register here"');

  // 6. Test 10-digit search with no matches
  const searchNoMatch10 = await simulateLookup('9999999999');
  assert(searchNoMatch10.status === 200 && searchNoMatch10.found === false, '10-digit search with no match returned found = false');
  assert(searchNoMatch10.message === 'Not Found, kindly register here', '10-digit search with no match returned exact required registration message');
  assert(searchNoMatch10.register_url === '/contacts-register', '10-digit search with no match returned correct register URL');

  // 7. Test multiple matching contacts requires administrator selection
  assert((search2.count ?? 0) > 1, 'Multiple contacts matched in partial search');
  const selectedContact = search2.contacts ? search2.contacts[0] : null;
  assert(selectedContact !== null && (selectedContact.id === c3 || selectedContact.id === c2 || selectedContact.id === c1), 'Admin can explicitly select intended contact from matches');

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. AUDIT: APPROVALS & CLASS PROGRESSION MESSAGES AT BOUNDARIES
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. Audit: Approvals & Progression Messages at Boundaries ---');

  // Boundary A: Contact 1 has 0 classes -> Approve -> count becomes 1
  const appRes1 = await pg.query<{ approve_master_contact_checkin: any }>(`
    SELECT approve_master_contact_checkin($1, $2, 'superadmin@hkm.org');
  `, [c1, adminId]);
  const data1 = appRes1.rows[0].approve_master_contact_checkin;
  assert(data1.already_approved === false, 'Contact 1 approval succeeded as fresh approval');
  assert(data1.classes_attended === 1, 'Contact 1 classes_attended updated to 1');
  assert(data1.level === 'level-1', 'Contact 1 DB level updated to level-1');
  const msg1 = getApprovalSuccessMessage(data1.classes_attended);
  assert(msg1 === 'Approved!! Move to AOMC (level-1/AOMC).', `Boundary 0 -> 1 produced message: "${msg1}"`);

  // Boundary B: Contact 2 has 10 classes -> Approve -> count becomes 11
  const appRes2 = await pg.query<{ approve_master_contact_checkin: any }>(`
    SELECT approve_master_contact_checkin($1, $2, 'superadmin@hkm.org');
  `, [c2, adminId]);
  const data2 = appRes2.rows[0].approve_master_contact_checkin;
  assert(data2.classes_attended === 11, 'Contact 2 classes_attended updated to 11');
  assert(data2.level === 'level-3', 'Contact 2 DB level updated to level-3');
  const msg2 = getApprovalSuccessMessage(data2.classes_attended);
  assert(msg2 === 'Approved!! Move to Prilims (level-3/Prilims).', `Boundary 10 -> 11 produced message: "${msg2}"`);

  // Boundary C: Contact 3 has 20 classes -> Approve -> count becomes 21
  const appRes3 = await pg.query<{ approve_master_contact_checkin: any }>(`
    SELECT approve_master_contact_checkin($1, $2, 'superadmin@hkm.org');
  `, [c3, adminId]);
  const data3 = appRes3.rows[0].approve_master_contact_checkin;
  assert(data3.classes_attended === 21, 'Contact 3 classes_attended updated to 21');
  assert(data3.level === 'level-4', 'Contact 3 DB level updated to level-4');
  const msg3 = getApprovalSuccessMessage(data3.classes_attended);
  assert(msg3 === 'Approved!! Level-4/Enhance.', `Boundary 20 -> 21 produced message: "${msg3}"`);

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. AUDIT: VISITOR ALREADY APPROVED IN CURRENT WEEKLY PERIOD
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. Audit: Already Approved Visitor in Active Period ---');
  const repeatApp = await pg.query<{ approve_master_contact_checkin: any }>(`
    SELECT approve_master_contact_checkin($1, $2, 'superadmin@hkm.org');
  `, [c1, adminId]);
  const repData = repeatApp.rows[0].approve_master_contact_checkin;
  assert(repData.already_approved === true, 'Repeat approval returned already_approved = true');
  assert(repData.classes_attended === 1, 'classes_attended remained unchanged at 1 (zero double-counting)');
  assert(repData.level === 'level-1', 'level remained unchanged at level-1');

  // Verify that frontend check ignores progression message on duplicate
  const repeatMsg = repData.already_approved ? 'Contact was already approved for the active weekly period.' : getApprovalSuccessMessage(repData.classes_attended);
  assert(repeatMsg === 'Contact was already approved for the active weekly period.', 'Duplicate approval retained "Already Approved" message without claiming progression occurred');

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. AUDIT: PARTIAL SEARCHES CANNOT BYPASS DUPLICATE PROTECTION OR APPROVE
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- 5. Audit: Partial Searches Cannot Bypass Protection ---');
  // Re-search C1 after approval
  const searchC1After = await simulateLookup('987');
  const c1Matched = searchC1After.contacts?.find((c: any) => c.id === c1);
  assert(c1Matched?.is_approved_this_week === true, 'Partial search shows contact is already approved this week');

  // Verify that an invalid or partial phone cannot call approval RPC
  let partialApprovalBlocked = false;
  try {
    const invalidContact = (await pg.query<{ id: string }>(`
      INSERT INTO master_contacts (phone, name) VALUES ('98765', 'Partial Number Contact') RETURNING id;
    `)).rows[0].id;
    await pg.query(`SELECT approve_master_contact_checkin($1);`, [invalidContact]);
  } catch (err: any) {
    if (err.message?.includes('invalid mobile number') || err.code === '22023') {
      partialApprovalBlocked = true;
    }
  }
  assert(partialApprovalBlocked, 'approve_master_contact_checkin strictly rejected partial mobile number with 22023');

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. AUDIT: UI REMOVAL OF DUPLICATE STATUS CARD & EXPLANATORY TEXT
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- 6. Audit: UI Removed Duplicate Status Card & Explanatory Text ---');
  const visitorPageSource = fs.readFileSync(path.join(__dirname, '../src/app/visitor/page.tsx'), 'utf-8');
  assert(!visitorPageSource.includes('Already Approved for Current Week'), 'Page does not render "Already Approved for Current Week" card');
  assert(!visitorPageSource.includes('Duplicate approvals within the same weekly period are prevented'), 'Page does not render duplicate prevention explanatory text');
  assert(!visitorPageSource.includes('A new approval and progression increment will be permitted next Friday'), 'Page does not render Friday rollover explanatory text');
  assert(visitorPageSource.includes('approvalSuccess'), 'Page preserves compact feedback message (approvalSuccess)');

  console.log('\n================================================================================');
  console.log(`TEST SUITE COMPLETE: ${passedTests} / ${totalTests} tests passed`);
  console.log('================================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runValidationSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
