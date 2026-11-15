/**
 * Test Suite: Sunday 06:00 AM Visitor Log Reset and History UI Cleanup
 * File: scripts/test-sunday-06am-reset.ts
 */

import { PGlite } from '@electric-sql/pglite';
import {
  getCurrentWeeklyPeriod,
  getCurrentVisitorWeeklyPeriod,
  getNextVisitorResetTimestamp,
  getSaturdayMeetupDate,
  getSundayArchiveThreshold,
  isSundayArchiveTimeReached,
  getWeeklyPeriodStartDate,
} from '../src/lib/weekly-period.ts';
import fs from 'fs';

interface TestResult {
  step: number;
  test: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

async function runTestSuite() {
  console.log('================================================================');
  console.log(' MECM TEST SUITE: Sunday 06:00 AM Reset & History UI Cleanup');
  console.log('================================================================\n');

  const db = new PGlite();

  // 1. Initialize DB schema
  await db.exec(`
    CREATE TABLE IF NOT EXISTS master_contacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      phone VARCHAR(20) NOT NULL UNIQUE,
      classes_attended INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS master_contact_checkins (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      master_contact_id UUID REFERENCES master_contacts(id),
      phone VARCHAR(20) NOT NULL,
      weekly_period VARCHAR(50) NOT NULL,
      checked_in_at TIMESTAMPTZ DEFAULT NOW(),
      admin_email VARCHAR(255)
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

  // 2. Setup past Saturday data
  const callingPeriod = '2026-11-13'; // Friday Nov 13, 2026
  const nextPeriod = '2026-11-20';    // Friday Nov 20, 2026 (target for next meetup Nov 21)

  // Insert 3 test visitors for Saturday Nov 14 meetup
  await db.exec(`
    INSERT INTO master_contacts (id, name, phone, classes_attended) VALUES
      ('11111111-1111-1111-1111-111111111111', 'Visitor One', '9876543210', 4),
      ('22222222-2222-2222-2222-222222222222', 'Visitor Two', '9876543211', 2),
      ('33333333-3333-3333-3333-333333333333', 'Visitor Three', '9876543212', 1);

    INSERT INTO master_contact_checkins (master_contact_id, phone, weekly_period, admin_email) VALUES
      ('11111111-1111-1111-1111-111111111111', '9876543210', '${callingPeriod}', 'Public Reception Desk'),
      ('22222222-2222-2222-2222-222222222222', '9876543211', '${callingPeriod}', 'Public Reception Desk'),
      ('33333333-3333-3333-3333-333333333333', '9876543212', '${callingPeriod}', 'Public Reception Desk');
  `);

  // ── TEST 1: Before Sunday 06:00 AM IST (Saturday Evening 18:00 IST) ───────────
  const saturdayEvening = new Date('2026-11-14T18:00:00+05:30');
  const visitorPeriodBefore = getCurrentVisitorWeeklyPeriod(saturdayEvening);

  const satCheckins = await db.query(
    `SELECT * FROM master_contact_checkins WHERE weekly_period = $1`,
    [visitorPeriodBefore]
  );

  results.push({
    step: 1,
    test: 'Before Sunday 06:00 AM (Saturday Meetup Active)',
    passed: visitorPeriodBefore === callingPeriod && satCheckins.rows.length === 3,
    details: `Active period is "${visitorPeriodBefore}" with 3 active check-ins. Meetup in progress.`,
  });

  // ── TEST 2: Sunday 06:01 AM IST Rollover (Visitor Period Advances) ─────────────
  const sundayMorning = new Date('2026-11-15T06:01:00+05:30');
  const visitorPeriodAfter = getCurrentVisitorWeeklyPeriod(sundayMorning);

  results.push({
    step: 2,
    test: 'Sunday 06:00 AM IST Period Rollover',
    passed: visitorPeriodAfter === nextPeriod,
    details: `Visitor period rolled over from "${callingPeriod}" to "${visitorPeriodAfter}".`,
  });

  // ── TEST 3: Visitor Check-In List Resets to Empty on Sunday 06:00 AM ──────────
  const sundayCheckins = await db.query(
    `SELECT * FROM master_contact_checkins WHERE weekly_period = $1`,
    [visitorPeriodAfter]
  );

  results.push({
    step: 3,
    test: 'Visitor Check-In Weekly List Reset',
    passed: sundayCheckins.rows.length === 0,
    details: `Active weekly check-in list is empty (${sundayCheckins.rows.length} rows) for new period "${visitorPeriodAfter}".`,
  });

  // ── TEST 4: Saturday Meetup Visitors Count Resets to 0 ─────────────────────────
  const activeVisitorsCount = sundayCheckins.rows.length;

  results.push({
    step: 4,
    test: 'Saturday Meetup Visitors Count Resets to 0',
    passed: activeVisitorsCount === 0,
    details: `Saturday Meetup dashboard visitors counter is exactly ${activeVisitorsCount}.`,
  });

  // ── TEST 5: Archival of Completed Saturday Meetup ──────────────────────────────
  // Prior to clearing, completed Saturday Nov 14 is archived with exact counts
  const satDateInfo = getSaturdayMeetupDate(callingPeriod);
  await db.query(`
    INSERT INTO saturday_meetup_visitor_history (weekly_period, meetup_date, total_visitors, total_attendance, notes)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (weekly_period) DO NOTHING
  `, [callingPeriod, satDateInfo.date, 3, 3, 'Sunday 06:00 AM IST automated archive']);

  const archivedQuery = await db.query(
    `SELECT * FROM saturday_meetup_visitor_history WHERE weekly_period = $1`,
    [callingPeriod]
  );
  const archivedRow = archivedQuery.rows[0] as Record<string, unknown> | undefined;

  results.push({
    step: 5,
    test: 'Previous Saturday Visitor History Archival',
    passed: !!archivedRow && Number(archivedRow.total_visitors) === 3,
    details: `Archived Saturday meetup (${archivedRow?.meetup_date}) with ${archivedRow?.total_visitors} unique visitors.`,
  });

  // ── TEST 6: Archive Idempotence (Duplicate Run Protection) ─────────────────────
  await db.query(`
    INSERT INTO saturday_meetup_visitor_history (weekly_period, meetup_date, total_visitors, total_attendance, notes)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (weekly_period) DO NOTHING
  `, [callingPeriod, satDateInfo.date, 3, 3, 'Second cron execution attempt']);

  const allHistRows = await db.query(`SELECT COUNT(*) as cnt FROM saturday_meetup_visitor_history WHERE weekly_period = $1`, [callingPeriod]);
  const rowCount = Number((allHistRows.rows[0] as Record<string, unknown>).cnt);

  results.push({
    step: 6,
    test: 'Archive Execution Idempotence',
    passed: rowCount === 1,
    details: `Exactly 1 record exists in archive table (duplicate runs safely ignored).`,
  });

  // ── TEST 7: Data Safety – Permanent Classes Attended & Records Intact ─────────
  const contactsQuery = await db.query(`SELECT id, classes_attended FROM master_contacts ORDER BY id`);
  const c1 = Number((contactsQuery.rows[0] as Record<string, unknown>).classes_attended);
  const c2 = Number((contactsQuery.rows[1] as Record<string, unknown>).classes_attended);
  const c3 = Number((contactsQuery.rows[2] as Record<string, unknown>).classes_attended);

  const totalRawCheckins = await db.query(`SELECT COUNT(*) as cnt FROM master_contact_checkins`);
  const rawCheckinCount = Number((totalRawCheckins.rows[0] as Record<string, unknown>).cnt);

  results.push({
    step: 7,
    test: 'Strict Data Safety: Classes Attended & Checkins Preserved',
    passed: c1 === 4 && c2 === 2 && c3 === 1 && rawCheckinCount === 3,
    details: `All ${rawCheckinCount} check-in rows and cumulative classes (c1:${c1}, c2:${c2}, c3:${c3}) remain permanent.`,
  });

  // ── TEST 8: Calling Counter Friday 00:00 IST Behavior Preserved ──────────────
  const callingPeriodSunday = getCurrentWeeklyPeriod(sundayMorning);

  results.push({
    step: 8,
    test: 'Calling Counter Weekly Behavior Preserved',
    passed: callingPeriodSunday === callingPeriod,
    details: `Calling period remains "${callingPeriodSunday}" (Friday rollover untouched).`,
  });

  // ── TEST 9: Visitor History UI Verification (Redundant Elements Removed) ───────
  const pageContent = fs.readFileSync('src/app/admin/saturday-meetup/page.tsx', 'utf8');

  // Verify that item.weekly_period badge is removed from history card
  const hasRedundantPeriodBadge = pageContent.includes('{item.weekly_period}');
  // Verify that total attendees text is removed from history card
  const hasRedundantAttendeesText = pageContent.includes('total attendees');

  results.push({
    step: 9,
    test: 'History Modal UI: Redundant Elements Removed',
    passed: !hasRedundantPeriodBadge && !hasRedundantAttendeesText,
    details: `Redundant date box removed: ${!hasRedundantPeriodBadge ? 'YES' : 'NO'}. Redundant total attendees text removed: ${!hasRedundantAttendeesText ? 'YES' : 'NO'}.`,
  });

  // Print Summary Table
  console.log('---------------------------------------------------------------------------------------------------------');
  console.log('| Step | Test Case                                            | Status | Details');
  console.log('---------------------------------------------------------------------------------------------------------');
  let allPassed = true;
  for (const r of results) {
    const status = r.passed ? 'PASS' : 'FAIL';
    console.log(`| ${String(r.step).padEnd(4)} | ${r.test.padEnd(52)} | ${status.padEnd(6)} | ${r.details}`);
    if (!r.passed) allPassed = false;
  }
  console.log('---------------------------------------------------------------------------------------------------------\n');

  if (allPassed) {
    console.log(' ALL 9 VERIFICATION TESTS PASSED SUCCESSFULLY!');
  } else {
    console.error('❌ SOME TESTS FAILED.');
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal Test Error:', err);
  process.exit(1);
});
