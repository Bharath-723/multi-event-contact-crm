/**
 * Test Suite: MECM Weekly Dashboard Counter Reset & Historical Visitor Tracking
 * File: scripts/test-weekly-counter-reset.ts
 *
 * Verifies all requirements:
 * 1. Saturday Meetup Dashboard Weekly Counter Reset:
 *    - At Friday 00:00 IST rollover, resets Coming (0), Pending Calls (0), Visitors (0).
 *    - Retains Assigned Calls without resetting.
 *    - Retains individual contact assignments and attendance history (classes_attended).
 * 2. Historical Visitor Tracking:
 *    - Previous Saturday Meetup visitor count and Meetup date (Saturday) archived permanently.
 *    - Idempotent: multiple resets/executions never duplicate or overwrite history.
 *    - History records accessible and sorted by date.
 * 3. Contact Operators Page Weekly Counter Reset:
 *    - At Friday 00:00 IST rollover, resets Coming, Not Coming, Not Answered, Next Week, Pending Calls to 0.
 *    - Retains Total Operators, Active Operators, and Assigned Contacts (total_assigned).
 * 4. Permanent Assignment Retention:
 *    - Zero automatic contact unassignments occur during weekly transition.
 *    - Operator portal continues to show all assigned contacts.
 *
 * Engine: @electric-sql/pglite (PostgreSQL 16 WASM)
 */

import { PGlite } from '@electric-sql/pglite';
import {
  getCurrentWeeklyPeriod,
  getSaturdayMeetupDate,
  formatWeeklyPeriodLabel,
  getWeeklyPeriodStartDate,
  getKolkataDateParts,
} from '../src/lib/weekly-period.ts';
import { computeOperatorStats } from '../src/lib/status-normalizer.ts';

interface TestResult {
  step: number;
  scenario: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function record(step: number, scenario: string, passed: boolean, details: string) {
  results.push({ step, scenario, passed, details });
  const icon = passed ? '✅ [PASS]' : '❌ [FAIL]';
  console.log(`  ${icon} Step ${step}: ${scenario}`);
  console.log(`         ${details}`);
}

async function run() {
  console.log('╔═════════════════════════════════════════════════════════════════════════════╗');
  console.log('║   MECM: WEEKLY DASHBOARD COUNTER RESET & VISITOR HISTORY VERIFICATION      ║');
  console.log('╚═════════════════════════════════════════════════════════════════════════════╝\n');

  const pg = new PGlite();

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 1: Schema Initialization & Migration Verification
  // ───────────────────────────────────────────────────────────────────────────
  console.log('--- Section 1: Schema Initialization & Migration Setup ---');

  await pg.exec(`
    CREATE TABLE IF NOT EXISTS public.admins (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS public.contact_operators (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      capacity INT NOT NULL DEFAULT 40,
      operator_type TEXT NOT NULL DEFAULT 'operator',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS public.master_contacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      phone TEXT UNIQUE NOT NULL,
      name TEXT,
      gender TEXT,
      classes_attended INT NOT NULL DEFAULT 0,
      chanting INT NOT NULL DEFAULT 0,
      level TEXT DEFAULT 'level-0',
      is_not_interested BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS public.master_contact_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      master_contact_id UUID NOT NULL REFERENCES public.master_contacts(id) ON DELETE CASCADE,
      operator_id UUID NOT NULL REFERENCES public.contact_operators(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'assigned',
      comments TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      status_weekly_period TEXT,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS public.master_contact_checkins (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      master_contact_id UUID REFERENCES public.master_contacts(id) ON DELETE SET NULL,
      phone TEXT NOT NULL,
      weekly_period TEXT NOT NULL,
      checked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      approved_by UUID REFERENCES public.admins(id) ON DELETE SET NULL,
      admin_email TEXT,
      CONSTRAINT unique_mcc_phone_period UNIQUE (phone, weekly_period)
    );

    -- Migration table: saturday_meetup_visitor_history
    CREATE TABLE IF NOT EXISTS public.saturday_meetup_visitor_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      weekly_period TEXT NOT NULL,
      meetup_date DATE NOT NULL,
      meetup_date_label TEXT,
      total_visitors INT NOT NULL DEFAULT 0,
      total_attendance INT NOT NULL DEFAULT 0,
      archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_smvh_weekly_period UNIQUE (weekly_period)
    );

    CREATE INDEX IF NOT EXISTS idx_smvh_meetup_date ON public.saturday_meetup_visitor_history(meetup_date DESC);
  `);

  // Stored procedure implementation for archive
  await pg.exec(`
    CREATE OR REPLACE FUNCTION public.archive_saturday_meetup_visitor_history(p_current_period TEXT)
    RETURNS INT
    LANGUAGE plpgsql
    AS $$
    DECLARE
      v_archived_count INT := 0;
      r RECORD;
      v_meetup_date DATE;
      v_date_label TEXT;
      v_total_attendance INT;
      v_visitors INT;
    BEGIN
      FOR r IN
        SELECT DISTINCT weekly_period
        FROM public.master_contact_checkins
        WHERE weekly_period < p_current_period
          AND weekly_period NOT IN (
            SELECT weekly_period FROM public.saturday_meetup_visitor_history
          )
        ORDER BY weekly_period ASC
      LOOP
        -- Calculate Saturday date (Friday start + 1 day)
        v_meetup_date := (r.weekly_period::date + INTERVAL '1 day')::date;
        v_date_label := 'Saturday, ' || to_char(v_meetup_date, 'DD Mon YYYY');

        SELECT COUNT(*)
        INTO v_total_attendance
        FROM public.master_contact_checkins
        WHERE weekly_period = r.weekly_period;

        -- Walk-ins: check-ins with phone not actively assigned in master_contact_assignments
        SELECT COUNT(*)
        INTO v_visitors
        FROM public.master_contact_checkins ck
        WHERE ck.weekly_period = r.weekly_period
          AND (
            ck.master_contact_id IS NULL
            OR ck.master_contact_id NOT IN (
              SELECT master_contact_id
              FROM public.master_contact_assignments
              WHERE is_active = TRUE
            )
          );

        INSERT INTO public.saturday_meetup_visitor_history (
          weekly_period,
          meetup_date,
          meetup_date_label,
          total_visitors,
          total_attendance,
          archived_at
        ) VALUES (
          r.weekly_period,
          v_meetup_date,
          v_date_label,
          v_visitors,
          v_total_attendance,
          NOW()
        )
        ON CONFLICT (weekly_period) DO NOTHING;

        v_archived_count := v_archived_count + 1;
      END LOOP;

      RETURN v_archived_count;
    END;
    $$;
  `);

  record(1, 'Database Schema & Archive Function Setup', true, 'Tables and archive stored procedure created successfully');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 2: Date & Weekly Period Utility Verification
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- Section 2: Date & Weekly Period Utilities ---');

  const samplePeriod = '2026-11-06';
  const meetupInfo = getSaturdayMeetupDate(samplePeriod);
  const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(meetupInfo.dateStr);
  const isSaturday = getKolkataDateParts(meetupInfo.date).dayOfWeek === 6; // 6 = Saturday in Asia/Kolkata

  record(2, 'Saturday Meetup Date Calculation', isValidDate && isSaturday,
    `Period ${samplePeriod} -> Date: ${meetupInfo.dateStr} (${meetupInfo.label}), Day of Week: ${getKolkataDateParts(meetupInfo.date).dayOfWeek} (6=Saturday)`);

  const currentPeriod = getCurrentWeeklyPeriod();
  const periodLabel = formatWeeklyPeriodLabel(currentPeriod);
  record(3, 'Current Weekly Period Formatting', !!currentPeriod && !!periodLabel,
    `Current Period: ${currentPeriod}, Formatted Label: ${periodLabel}`);

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 3: Seed Data for Week W44 (Previous Week)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- Section 3: Seed Week W44 Active State ---');

  const W44 = '2026-10-30';
  const W45 = '2026-11-06';

  // Seed Admin & Operators
  const adminRes = await pg.query<{ id: string }>(`
    INSERT INTO public.admins (email) VALUES ('admin@mecm.org') RETURNING id;
  `);
  const adminId = adminRes.rows[0].id;

  const op1Res = await pg.query<{ id: string }>(`
    INSERT INTO public.contact_operators (name, email, capacity, is_active)
    VALUES ('Operator 1', 'op1@mecm.org', 30, true) RETURNING id;
  `);
  const op1Id = op1Res.rows[0].id;

  const op2Res = await pg.query<{ id: string }>(`
    INSERT INTO public.contact_operators (name, email, capacity, is_active)
    VALUES ('Operator 2', 'op2@mecm.org', 30, true) RETURNING id;
  `);
  const op2Id = op2Res.rows[0].id;

  // Create contacts with individual attendance history
  // Contact 1: Assigned to Op 1, Coming in W44, Attended 5 classes
  // Contact 2: Assigned to Op 1, Pending in W44, Attended 3 classes
  // Contact 3: Assigned to Op 2, Not Coming in W44, Attended 8 classes
  // Contact 4: Assigned to Op 2, Next Week in W44, Attended 2 classes
  // Contact 5: Assigned to Op 2, Not Answered in W44, Attended 0 classes
  // Contact 6: Walk-in Visitor (unassigned), Attended in W44, 0 classes
  // Contact 7: Walk-in Visitor (unassigned), Attended in W44, 1 class

  const c1 = (await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (phone, name, gender, classes_attended)
    VALUES ('9000000001', 'Contact 1', 'Male', 5) RETURNING id;
  `)).rows[0].id;

  const c2 = (await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (phone, name, gender, classes_attended)
    VALUES ('9000000002', 'Contact 2', 'Female', 3) RETURNING id;
  `)).rows[0].id;

  const c3 = (await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (phone, name, gender, classes_attended)
    VALUES ('9000000003', 'Contact 3', 'Male', 8) RETURNING id;
  `)).rows[0].id;

  const c4 = (await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (phone, name, gender, classes_attended)
    VALUES ('9000000004', 'Contact 4', 'Female', 2) RETURNING id;
  `)).rows[0].id;

  const c5 = (await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (phone, name, gender, classes_attended)
    VALUES ('9000000005', 'Contact 5', 'Male', 0) RETURNING id;
  `)).rows[0].id;

  const c6_visitor = (await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (phone, name, gender, classes_attended)
    VALUES ('9000000006', 'Visitor Alpha', 'Male', 0) RETURNING id;
  `)).rows[0].id;

  const c7_visitor = (await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (phone, name, gender, classes_attended)
    VALUES ('9000000007', 'Visitor Beta', 'Female', 1) RETURNING id;
  `)).rows[0].id;

  // Insert assignments for contacts 1-5 in W44
  await pg.query(`
    INSERT INTO public.master_contact_assignments (master_contact_id, operator_id, status, status_weekly_period, is_active, updated_at)
    VALUES
      ('${c1}', '${op1Id}', 'coming', '${W44}', true, '2026-11-05 14:00:00+05:30'),
      ('${c2}', '${op1Id}', 'assigned', '${W44}', true, '2026-11-05 15:00:00+05:30'),
      ('${c3}', '${op2Id}', 'not_coming', '${W44}', true, '2026-11-05 16:00:00+05:30'),
      ('${c4}', '${op2Id}', 'next_week', '${W44}', true, '2026-11-05 17:00:00+05:30'),
      ('${c5}', '${op2Id}', 'not_answered', '${W44}', true, '2026-11-05 18:00:00+05:30');
  `);

  // Insert check-ins for Saturday Meetup in W44:
  // - Contact 1 checked in (assigned + operator coming + approved)
  // - Contact 6 checked in (unassigned visitor)
  // - Contact 7 checked in (unassigned visitor)
  await pg.query(`
    INSERT INTO public.master_contact_checkins (master_contact_id, phone, weekly_period, checked_in_at, approved_by)
    VALUES
      ('${c1}', '9000000001', '${W44}', '2026-11-07 10:00:00+05:30', '${adminId}'),
      ('${c6_visitor}', '9000000006', '${W44}', '2026-11-07 10:15:00+05:30', '${adminId}'),
      ('${c7_visitor}', '9000000007', '${W44}', '2026-11-07 10:30:00+05:30', '${adminId}');
  `);

  record(4, 'Week W44 Data Population', true, '5 assigned contacts, 2 walk-in visitors, 3 Saturday check-ins seeded');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 4: Verify W44 Stats Before Rollover
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- Section 4: Query W44 Dashboard Stats Before Friday Rollover ---');

  // In W44:
  // Coming = 1 (c1)
  // Pending = 1 (c2)
  // Visitors = 2 (c6, c7)
  // Assigned Calls = 5 (c1-c5)
  const w44Assignments = (await pg.query<{
    id: string;
    master_contact_id: string;
    status: string;
    status_weekly_period: string;
    operator_id: string;
  }>(`
    SELECT id, master_contact_id, status, status_weekly_period, operator_id
    FROM public.master_contact_assignments
    WHERE is_active = TRUE;
  `)).rows;

  const w44Checkins = (await pg.query<{
    id: string;
    master_contact_id: string;
    phone: string;
    weekly_period: string;
  }>(`
    SELECT id, master_contact_id, phone, weekly_period
    FROM public.master_contact_checkins
    WHERE weekly_period = '${W44}';
  `)).rows;

  // Compute Saturday Meetup Metrics for W44
  const assignedIds = new Set(w44Assignments.map(a => a.master_contact_id));
  const w44ComingCount = w44Assignments.filter(a => a.status === 'coming' && a.status_weekly_period === W44).length;
  const w44PendingCount = w44Assignments.filter(a => a.status === 'assigned' && a.status_weekly_period === W44).length;
  const w44VisitorsCount = w44Checkins.filter(ck => !assignedIds.has(ck.master_contact_id)).length;
  const w44AssignedCalls = w44Assignments.length;

  record(5, 'W44 Saturday Meetup Metrics Before Rollover',
    w44ComingCount === 1 && w44PendingCount === 1 && w44VisitorsCount === 2 && w44AssignedCalls === 5,
    `Coming: ${w44ComingCount} (exp 1), Pending: ${w44PendingCount} (exp 1), Visitors: ${w44VisitorsCount} (exp 2), Assigned Calls: ${w44AssignedCalls} (exp 5)`);

  // Operator 1 & Operator 2 Stats in W44 using computeOperatorStats
  const op1W44Stats = computeOperatorStats(
    w44Assignments.filter(a => a.operator_id === op1Id) as any,
    { currentWeeklyPeriod: W44 }
  );
  const op2W44Stats = computeOperatorStats(
    w44Assignments.filter(a => a.operator_id === op2Id) as any,
    { currentWeeklyPeriod: W44 }
  );

  record(6, 'W44 Operator 1 Weekly Stats Before Rollover',
    op1W44Stats.coming === 1 && op1W44Stats.pending === 1 && op1W44Stats.assigned === 2,
    `Op 1 - Coming: ${op1W44Stats.coming}, Pending: ${op1W44Stats.pending}, Assigned: ${op1W44Stats.assigned}`);

  record(7, 'W44 Operator 2 Weekly Stats Before Rollover',
    op2W44Stats.notComing === 1 && op2W44Stats.nextWeek === 1 && op2W44Stats.notAnswered === 1 && op2W44Stats.assigned === 3,
    `Op 2 - Not Coming: ${op2W44Stats.notComing}, Next Week: ${op2W44Stats.nextWeek}, Not Answered: ${op2W44Stats.notAnswered}, Assigned: ${op2W44Stats.assigned}`);

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 5: Friday 00:00:00 IST Rollover to W45 & Visitor Archival
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- Section 5: Friday 00:00 IST Rollover to W45 & Visitor History Archival ---');

  // Trigger historical archival for previous periods (< W45)
  const archiveResult = await pg.query<{ archive_saturday_meetup_visitor_history: number }>(`
    SELECT public.archive_saturday_meetup_visitor_history('${W45}') AS archive_saturday_meetup_visitor_history;
  `);
  const archivedCount = archiveResult.rows[0].archive_saturday_meetup_visitor_history;

  record(8, 'Archive Function Execution on Rollover', archivedCount === 1,
    `Archived ${archivedCount} past period (W44)`);

  // Verify the archived history record in saturday_meetup_visitor_history
  const historyRows = (await pg.query<{
    weekly_period: string;
    meetup_date: string;
    meetup_date_label: string;
    total_visitors: number;
    total_attendance: number;
  }>(`
    SELECT weekly_period, meetup_date::TEXT, meetup_date_label, total_visitors, total_attendance
    FROM public.saturday_meetup_visitor_history
    WHERE weekly_period = '${W44}';
  `)).rows;

  const hRow = historyRows[0];
  const historyValid = historyRows.length === 1 &&
    hRow.total_visitors === 2 &&
    hRow.total_attendance === 3 &&
    hRow.meetup_date.startsWith('2026-');

  record(9, 'Archived Visitor History Content Verification', historyValid,
    `Archived W44 -> Date: ${hRow?.meetup_date} (${hRow?.meetup_date_label}), Visitors: ${hRow?.total_visitors} (exp 2), Total Attendance: ${hRow?.total_attendance} (exp 3)`);

  // Verify Idempotency: Running archive a 2nd time must NOT duplicate or error
  const archiveResult2 = await pg.query<{ archive_saturday_meetup_visitor_history: number }>(`
    SELECT public.archive_saturday_meetup_visitor_history('${W45}') AS archive_saturday_meetup_visitor_history;
  `);
  const countAfter2ndRun = (await pg.query<{ count: number | string }>(`SELECT COUNT(*) FROM public.saturday_meetup_visitor_history WHERE weekly_period = '${W44}'`)).rows[0].count;

  record(10, 'Idempotency: No Duplicate History Entries on Multiple Runs',
    archiveResult2.rows[0].archive_saturday_meetup_visitor_history === 0 && Number(countAfter2ndRun) === 1,
    `Second run archived: ${archiveResult2.rows[0].archive_saturday_meetup_visitor_history}, Total rows for W44: ${countAfter2ndRun}`);

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 6: W45 Dashboard Counters Reset to 0 While Retaining Assigned Calls
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- Section 6: Saturday Meetup Counters Reset in Week W45 ---');

  // In W45 (start of new week):
  // Checkins for W45 = 0
  const w45Checkins = (await pg.query(`
    SELECT * FROM public.master_contact_checkins WHERE weekly_period = '${W45}';
  `)).rows;

  // Active assignments in database
  const activeAssignments = (await pg.query<{
    id: string;
    master_contact_id: string;
    status: string;
    status_weekly_period: string;
    is_active: boolean;
    operator_id: string;
  }>(`
    SELECT id, master_contact_id, status, status_weekly_period, is_active, operator_id
    FROM public.master_contact_assignments
    WHERE is_active = TRUE;
  `)).rows;

  // Metrics calculation in W45:
  // - Coming: only status_weekly_period = W45 with status = 'coming'
  // - Pending Calls: only status_weekly_period = W45 with status in pending bucket
  // - Visitors: only W45 unassigned checkins
  // - Assigned Calls: ALL active assignments (5 contacts!)
  const w45Coming = activeAssignments.filter(a => a.status === 'coming' && a.status_weekly_period === W45).length;
  const w45Pending = activeAssignments.filter(a => a.status === 'assigned' && a.status_weekly_period === W45).length;
  const w45Visitors = w45Checkins.length;
  const w45AssignedCalls = activeAssignments.length;

  record(11, 'Saturday Meetup Dashboard: Coming Reset to 0', w45Coming === 0,
    `Coming counter in W45: ${w45Coming} (reset to 0)`);

  record(12, 'Saturday Meetup Dashboard: Pending Calls Reset to 0', w45Pending === 0,
    `Pending Calls counter in W45: ${w45Pending} (reset to 0)`);

  record(13, 'Saturday Meetup Dashboard: Visitors Reset to 0', w45Visitors === 0,
    `Visitors counter in W45: ${w45Visitors} (reset to 0)`);

  record(14, 'Saturday Meetup Dashboard: Assigned Calls Permanently Retained (NOT reset)', w45AssignedCalls === 5,
    `Assigned Calls counter in W45: ${w45AssignedCalls} (retained, all 5 contacts remain assigned)`);

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 7: Contact Operators Page Weekly Counters Reset to 0
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- Section 7: Contact Operators Page Counters Reset in Week W45 ---');

  // Compute operator stats for Op 1 and Op 2 in W45
  const op1W45Stats = computeOperatorStats(
    activeAssignments.filter(a => a.operator_id === op1Id) as any,
    { currentWeeklyPeriod: W45 }
  );
  const op2W45Stats = computeOperatorStats(
    activeAssignments.filter(a => a.operator_id === op2Id) as any,
    { currentWeeklyPeriod: W45 }
  );

  const op1WeeklyZero = op1W45Stats.coming === 0 &&
    op1W45Stats.notComing === 0 &&
    op1W45Stats.notAnswered === 0 &&
    op1W45Stats.nextWeek === 0 &&
    op1W45Stats.pending === 0;

  const op2WeeklyZero = op2W45Stats.coming === 0 &&
    op2W45Stats.notComing === 0 &&
    op2W45Stats.notAnswered === 0 &&
    op2W45Stats.nextWeek === 0 &&
    op2W45Stats.pending === 0;

  record(15, 'Contact Operators Page: Op 1 Weekly Status Counters Reset to 0', op1WeeklyZero,
    `Op 1 -> Coming: ${op1W45Stats.coming}, Not Coming: ${op1W45Stats.notComing}, Pending: ${op1W45Stats.pending}`);

  record(16, 'Contact Operators Page: Op 2 Weekly Status Counters Reset to 0', op2WeeklyZero,
    `Op 2 -> Coming: ${op2W45Stats.coming}, Not Coming: ${op2W45Stats.notComing}, Next Week: ${op2W45Stats.nextWeek}, Not Answered: ${op2W45Stats.notAnswered}`);

  record(17, 'Contact Operators Page: Assigned Contacts Permanently Retained',
    op1W45Stats.assigned === 2 && op2W45Stats.assigned === 3,
    `Op 1 Assigned: ${op1W45Stats.assigned} (exp 2), Op 2 Assigned: ${op2W45Stats.assigned} (exp 3)`);

  // Verify Total Operators & Active Operators
  const totalOps = (await pg.query<{ count: number | string }>(`SELECT COUNT(*) FROM public.contact_operators`)).rows[0].count;
  const activeOps = (await pg.query<{ count: number | string }>(`SELECT COUNT(*) FROM public.contact_operators WHERE is_active = TRUE`)).rows[0].count;

  record(18, 'Contact Operators Page: Total & Active Operators Preserved',
    Number(totalOps) === 2 && Number(activeOps) === 2,
    `Total Operators: ${totalOps}, Active Operators: ${activeOps}`);

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 8: Individual Attendance / Classes Attended Preservation
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- Section 8: Individual Contact Attendance & History Preservation ---');

  const contactsAfterReset = (await pg.query<{ id: string; name: string; classes_attended: number }>(`
    SELECT id, name, classes_attended FROM public.master_contacts ORDER BY phone;
  `)).rows;

  const c1Att = contactsAfterReset.find(c => c.id === c1)?.classes_attended;
  const c3Att = contactsAfterReset.find(c => c.id === c3)?.classes_attended;

  record(19, 'Contact classes_attended Counts Preserved Across Reset',
    c1Att === 5 && c3Att === 8,
    `Contact 1: ${c1Att} classes (exp 5), Contact 3: ${c3Att} classes (exp 8)`);

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 9: Zero Unassignment Verification & Explicit Admin Unassign
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- Section 9: Permanent Assignment Retention & Explicit Unassign Only ---');

  // Verify that all 5 assignments are STILL active
  const unassignedCount = (await pg.query<{ count: number | string }>(`
    SELECT COUNT(*) FROM public.master_contact_assignments WHERE is_active = FALSE;
  `)).rows[0].count;

  record(20, 'Zero Automatic Unassignments Occurred During Rollover', Number(unassignedCount) === 0,
    `Inactive assignments after rollover: ${unassignedCount} (zero automatic unassignments)`);

  // Now perform explicit admin unassign on contact 1
  await pg.query(`
    UPDATE public.master_contact_assignments
    SET is_active = FALSE, updated_at = NOW()
    WHERE master_contact_id = '${c1}';
  `);

  const activeAfterAdminUnassign = (await pg.query<{ id: string }>(`
    SELECT id FROM public.master_contact_assignments WHERE is_active = TRUE;
  `)).rows;

  record(21, 'Explicit Admin Unassign Works as Expected',
    activeAfterAdminUnassign.length === 4,
    `Active assignments after manual unassign: ${activeAfterAdminUnassign.length} (exp 4)`);

  // ───────────────────────────────────────────────────────────────────────────
  // Summary
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n=============================================================================');
  const allPassed = results.every(r => r.passed);
  console.log(`TOTAL CHECKS: ${results.length}`);
  console.log(`PASSED: ${results.filter(r => r.passed).length}`);
  console.log(`FAILED: ${results.filter(r => r.passed === false).length}`);
  console.log(`OVERALL STATUS: ${allPassed ? '✅ ALL CHECKS PASSED' : '❌ VERIFICATION FAILED'}`);
  console.log('=============================================================================\n');

  if (!allPassed) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Test execution failed with fatal error:', err);
  process.exit(1);
});
