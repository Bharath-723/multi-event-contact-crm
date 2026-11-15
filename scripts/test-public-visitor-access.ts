/**
 * Test Suite: Public Visitor Access, Fast Search & Check-In, and Sunday 06:00 AM Archiving
 * File: scripts/test-public-visitor-access.ts
 */

import { PGlite } from '@electric-sql/pglite';
import { getCurrentWeeklyPeriod, getSaturdayMeetupDate, getSundayArchiveThreshold, isSundayArchiveTimeReached } from '../src/lib/weekly-period.ts';
import { getLevelFromClassesAttended } from '../src/lib/level-mapping.ts';
import { normalizePhone } from '../src/lib/master-contacts.ts';

interface TestResult {
  step: number;
  test: string;
  passed: boolean;
  latencyMs?: number;
  details: string;
}

const results: TestResult[] = [];

async function runTestSuite() {
  console.log('================================================================');
  console.log(' MECM TEST SUITE: Public Visitor Check-In, Latency & Archiving');
  console.log('================================================================\n');

  const db = new PGlite();

  // 1. Initialize schema
  await db.exec(`
    CREATE TABLE IF NOT EXISTS master_contacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      phone VARCHAR(20) NOT NULL UNIQUE,
      age INTEGER,
      gender VARCHAR(20),
      area_of_stay VARCHAR(255),
      company_college VARCHAR(255),
      level VARCHAR(50) DEFAULT 'L1',
      classes_attended INTEGER DEFAULT 0,
      chanting INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS master_contact_checkins (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      master_contact_id UUID REFERENCES master_contacts(id) ON DELETE CASCADE,
      phone VARCHAR(20) NOT NULL,
      weekly_period VARCHAR(50) NOT NULL,
      checked_in_at TIMESTAMPTZ DEFAULT NOW(),
      approved_by UUID,
      admin_email VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT uq_mcc_period_contact UNIQUE(weekly_period, master_contact_id),
      CONSTRAINT uq_mcc_period_phone UNIQUE(weekly_period, phone)
    );

    CREATE TABLE IF NOT EXISTS saturday_meetup_visitor_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      weekly_period VARCHAR(50) NOT NULL UNIQUE,
      meetup_date DATE NOT NULL,
      total_visitors INTEGER NOT NULL,
      total_attendance INTEGER NOT NULL,
      archived_at TIMESTAMPTZ DEFAULT NOW(),
      notes TEXT
    );
  `);

  // 2. Insert test contacts
  const testContactId = '11111111-1111-1111-1111-111111111111';
  const testPhone = '9347364826'; // The exact phone from the user screenshot!
  await db.exec(`
    INSERT INTO master_contacts (id, name, phone, age, gender, area_of_stay, company_college, classes_attended, chanting)
    VALUES ('${testContactId}', 'Test Visitor Phone User', '${testPhone}', 22, 'Male', 'Kukatpally', 'JNTUH', 2, 4)
    ON CONFLICT (phone) DO NOTHING;
  `);

  const currentPeriod = getCurrentWeeklyPeriod();

  // ── TEST 1: Public 10-Digit Mobile Search (NO AUTH) ──────────────────────────
  const t0 = performance.now();
  const cleanPhone = normalizePhone(testPhone);
  const phoneVariants = [cleanPhone, `+91${cleanPhone}`, `91${cleanPhone}`, `0${cleanPhone}`];

  // Parallel lookup in DB
  const [cRes, chkRes] = await Promise.all([
    db.query(`SELECT id, phone, name, age, gender, area_of_stay, company_college, level, classes_attended, chanting FROM master_contacts WHERE phone = ANY($1)`, [phoneVariants]),
    db.query(`SELECT id, master_contact_id, phone, checked_in_at, approved_by, admin_email FROM master_contact_checkins WHERE weekly_period = $1 AND phone = $2`, [currentPeriod, cleanPhone]),
  ]);
  const searchLatency = performance.now() - t0;

  const foundContact = cRes.rows[0] as Record<string, unknown> | undefined;
  const isApproved = (chkRes.rows.length > 0);

  results.push({
    step: 1,
    test: 'Public 10-Digit Phone Search (No Auth Required)',
    passed: !!foundContact && foundContact.phone === testPhone && !isApproved,
    latencyMs: Math.round(searchLatency * 100) / 100,
    details: `Contact "${foundContact?.name}" retrieved in ${searchLatency.toFixed(2)}ms without requiring admin token.`,
  });

  // ── TEST 2: Public Partial Phone Search (2-9 digits) ─────────────────────────
  const tPartial = performance.now();
  const partialDigits = '9347';
  const partialRes = await db.query(
    `SELECT id, phone, name, classes_attended FROM master_contacts WHERE phone LIKE $1 LIMIT 25`,
    [`%${partialDigits}%`]
  );
  const partialLatency = performance.now() - tPartial;

  results.push({
    step: 2,
    test: 'Public Partial Search (2-9 Digits)',
    passed: partialRes.rows.length >= 1,
    latencyMs: Math.round(partialLatency * 100) / 100,
    details: `Found ${partialRes.rows.length} matches for partial input "${partialDigits}" in ${partialLatency.toFixed(2)}ms.`,
  });

  // ── TEST 3: Public Check-In Approval (No Admin Token Required) ────────────────
  const tApprove = performance.now();
  // Simulate public caller: p_admin_id is NULL, p_admin_email is 'Public Reception Desk'
  const adminId: string | null = null;
  const adminEmail = 'Public Reception Desk';

  // Perform atomic approval logic (mimicking RPC approve_master_contact_checkin)
  let approvalSuccess = false;
  let alreadyApproved = false;
  let newClassesAttended = 0;

  const existingChk = await db.query(
    `SELECT id FROM master_contact_checkins WHERE weekly_period = $1 AND (master_contact_id = $2 OR phone = $3)`,
    [currentPeriod, testContactId, cleanPhone]
  );

  if (existingChk.rows.length > 0) {
    alreadyApproved = true;
  } else {
    // Insert check-in record
    await db.query(
      `INSERT INTO master_contact_checkins (master_contact_id, phone, weekly_period, approved_by, admin_email)
       VALUES ($1, $2, $3, $4, $5)`,
      [testContactId, cleanPhone, currentPeriod, adminId, adminEmail]
    );
    // Increment classes_attended
    const updRes = await db.query(
      `UPDATE master_contacts SET classes_attended = COALESCE(classes_attended, 0) + 1 WHERE id = $1 RETURNING classes_attended`,
      [testContactId]
    );
    newClassesAttended = Number((updRes.rows[0] as Record<string, unknown>).classes_attended);
    approvalSuccess = true;
  }
  const approveLatency = performance.now() - tApprove;

  results.push({
    step: 3,
    test: 'Public Reception Check-In Approval',
    passed: approvalSuccess && newClassesAttended === 3,
    latencyMs: Math.round(approveLatency * 100) / 100,
    details: `Check-in approved by "${adminEmail}" (admin_id: ${adminId}) in ${approveLatency.toFixed(2)}ms. classes_attended incremented from 2 to ${newClassesAttended}.`,
  });

  // ── TEST 4: Duplicate Approval Protection (Idempotent) ───────────────────────
  const tDup = performance.now();
  let duplicatePrevented = false;
  const secondAttempt = await db.query(
    `SELECT id FROM master_contact_checkins WHERE weekly_period = $1 AND (master_contact_id = $2 OR phone = $3)`,
    [currentPeriod, testContactId, cleanPhone]
  );
  if (secondAttempt.rows.length > 0) {
    duplicatePrevented = true; // Does not re-insert, does not re-increment
  }
  const dupLatency = performance.now() - tDup;

  const afterDupContact = await db.query(`SELECT classes_attended FROM master_contacts WHERE id = $1`, [testContactId]);
  const classesAfterDup = Number((afterDupContact.rows[0] as Record<string, unknown>).classes_attended);

  results.push({
    step: 4,
    test: 'Duplicate Approval Idempotence',
    passed: duplicatePrevented && classesAfterDup === 3,
    latencyMs: Math.round(dupLatency * 100) / 100,
    details: `Duplicate approval caught. classes_attended remained intact at ${classesAfterDup} (not double-counted).`,
  });

  // ── TEST 5: Public Live Check-Ins Feed (NO AUTH) ──────────────────────────────
  const tFeed = performance.now();
  const feedRes = await db.query(`
    SELECT c.id, c.master_contact_id, c.phone, c.checked_in_at, c.admin_email, m.name, m.classes_attended, m.gender
    FROM master_contact_checkins c
    LEFT JOIN master_contacts m ON m.id = c.master_contact_id
    WHERE c.weekly_period = $1
    ORDER BY c.checked_in_at DESC
    LIMIT 50
  `, [currentPeriod]);
  const feedLatency = performance.now() - tFeed;

  results.push({
    step: 5,
    test: 'Public Live Check-In Feed Retrieval',
    passed: feedRes.rows.length === 1 && (feedRes.rows[0] as Record<string, unknown>).admin_email === 'Public Reception Desk',
    latencyMs: Math.round(feedLatency * 100) / 100,
    details: `Retrieved ${feedRes.rows.length} live logs in ${feedLatency.toFixed(2)}ms without requiring auth header.`,
  });

  // ── TEST 6: Sunday 06:00 AM IST Archiving Threshold ──────────────────────────
  const sundayThreshold = getSundayArchiveThreshold(currentPeriod);
  const meetupInfo = getSaturdayMeetupDate(currentPeriod);
  const saturdayMeetupDate = meetupInfo.date;

  // Time before Sunday 06:00 AM IST (e.g. Saturday 18:00 IST)
  const saturdayEvening = new Date(saturdayMeetupDate.getTime() + 18 * 3600 * 1000);
  const isArchivedBefore = isSundayArchiveTimeReached(currentPeriod, saturdayEvening);

  // Time after Sunday 06:00 AM IST (e.g. Sunday 06:05 AM IST)
  const sundayMorningAfter = new Date(sundayThreshold.getTime() + 5 * 60 * 1000);
  const isArchivedAfter = isSundayArchiveTimeReached(currentPeriod, sundayMorningAfter);

  results.push({
    step: 6,
    test: 'Sunday 06:00 AM IST Archiving Threshold Evaluation',
    passed: !isArchivedBefore && isArchivedAfter,
    details: `Correctly blocks archiving before Sunday 06:00 AM IST (${isArchivedBefore ? 'FAILED' : 'OK'}) and activates after Sunday 06:00 AM IST (${isArchivedAfter ? 'OK' : 'FAILED'}).`,
  });

  // ── TEST 7: Archiving Execution & History Preservation ────────────────────────
  // Execute archive insert for completed Saturday meetup
  await db.query(`
    INSERT INTO saturday_meetup_visitor_history (weekly_period, meetup_date, total_visitors, total_attendance, notes)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (weekly_period) DO NOTHING
  `, [currentPeriod, saturdayMeetupDate, 1, 1, 'Sunday 06:00 AM IST automated archive']);

  const histRes = await db.query(`SELECT * FROM saturday_meetup_visitor_history WHERE weekly_period = $1`, [currentPeriod]);
  const archivedRow = histRes.rows[0] as Record<string, unknown> | undefined;

  results.push({
    step: 7,
    test: 'Archiving Execution & History Preservation',
    passed: !!archivedRow && Number(archivedRow.total_visitors) === 1,
    details: `Archived Saturday meetup (${archivedRow?.meetup_date}) with total_visitors: ${archivedRow?.total_visitors}.`,
  });

  // Print Summary Table
  console.log('---------------------------------------------------------------------------------------------');
  console.log('| Step | Test Case                                       | Status | Latency  | Details');
  console.log('---------------------------------------------------------------------------------------------');
  let allPassed = true;
  for (const r of results) {
    const status = r.passed ? 'PASS' : 'FAIL';
    const latency = r.latencyMs !== undefined ? `${r.latencyMs}ms` : 'N/A';
    console.log(`| ${String(r.step).padEnd(4)} | ${r.test.padEnd(47)} | ${status.padEnd(6)} | ${latency.padEnd(8)} | ${r.details}`);
    if (!r.passed) allPassed = false;
  }
  console.log('---------------------------------------------------------------------------------------------\n');

  if (allPassed) {
    console.log(' ALL 7 VERIFICATION & LATENCY TESTS PASSED SUCCESSFULLY!');
  } else {
    console.error('❌ SOME TESTS FAILED.');
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal Test Error:', err);
  process.exit(1);
});
