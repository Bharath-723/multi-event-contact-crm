/**
 * Test Suite: MECM Operator Portal Class Attendance View (Step 1: Attendance Only)
 * File: scripts/test-operator-class-attendance.ts
 *
 * Verifies all requirements:
 * 1. Classes Attended Count & Source of Truth:
 *    - Uses existing Visitor Check-in records (master_contact_checkins) and master_contacts.classes_attended.
 *    - Independent of operator calling status changes (Coming, Not Coming, Not Answered, etc.).
 * 2. Identity Matching:
 *    - Primary: Canonical Master Contact ID (UUID).
 *    - Fallback: Normalized Indian Mobile Number (10 digits).
 *    - Strict guardrail: NEVER matches by name alone (contacts with same name have isolated attendance).
 * 3. Attendance History Modal / Drawer Data Integrity:
 *    - Person's Name and Total Classes Attended.
 *    - Chronologically sorted records (newest first).
 *    - Record fields: Date, Event Name ("Saturday Meetup"), Status ("Attended").
 * 4. Zero Attendance Empty State:
 *    - Contact with 0 attendance returns 0 and empty records array.
 * 5. Deduplication:
 *    - Check-in records matching both ID and phone are never duplicated.
 *
 * Engine: @electric-sql/pglite (PostgreSQL 16 WASM)
 */

import { PGlite } from '@electric-sql/pglite';
import { normalizePhone } from '../src/lib/phone-utils.ts';
import { getSaturdayMeetupDate } from '../src/lib/weekly-period.ts';

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
  console.log('\n======================================================================');
  console.log('🧪 Starting Operator Portal Class Attendance Verification Suite');
  console.log('======================================================================\n');

  const pg = new PGlite();

  // 1. Setup Database Schema
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
      is_active BOOLEAN NOT NULL DEFAULT TRUE
    );

    CREATE TABLE IF NOT EXISTS public.master_contacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      phone TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      company_college TEXT,
      gender TEXT,
      classes_attended INT NOT NULL DEFAULT 0,
      level TEXT DEFAULT 'level-0',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS public.master_contact_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      master_contact_id UUID NOT NULL REFERENCES public.master_contacts(id) ON DELETE CASCADE,
      operator_id UUID NOT NULL REFERENCES public.contact_operators(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'assigned',
      comments TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  `);

  console.log('📦 Database Schema initialized successfully.\n');

  // Insert test data
  const adminRes = await pg.query<{ id: string }>(
    `INSERT INTO public.admins (email) VALUES ('admin@hkm.org') RETURNING id;`
  );
  const adminId = adminRes.rows[0].id;

  const opRes = await pg.query<{ id: string }>(
    `INSERT INTO public.contact_operators (name, email) VALUES ('Operator 1', 'op1@hkm.org') RETURNING id;`
  );
  const opId = opRes.rows[0].id;

  // Insert Contact A: "YASWANTHREDDY GADIYAM" with 3 check-ins
  const cA = (
    await pg.query<{ id: string }>(`
      INSERT INTO public.master_contacts (phone, name, company_college, classes_attended)
      VALUES ('9876543210', 'YASWANTHREDDY GADIYAM', 'Niat', 3)
      RETURNING id;
    `)
  ).rows[0].id;

  // Insert Contact B: "Charan" with 0 check-ins
  const cB = (
    await pg.query<{ id: string }>(`
      INSERT INTO public.master_contacts (phone, name, company_college, classes_attended)
      VALUES ('8885418914', 'Charan', 'VJIT', 0)
      RETURNING id;
    `)
  ).rows[0].id;

  // Insert Contact C1: "Rahul Sharma" (Phone: 9911223344) with 2 check-ins
  const cC1 = (
    await pg.query<{ id: string }>(`
      INSERT INTO public.master_contacts (phone, name, company_college, classes_attended)
      VALUES ('9911223344', 'Rahul Sharma', 'College A', 2)
      RETURNING id;
    `)
  ).rows[0].id;

  // Insert Contact C2: "Rahul Sharma" (Same Name! Phone: 9955667788) with 0 check-ins
  const cC2 = (
    await pg.query<{ id: string }>(`
      INSERT INTO public.master_contacts (phone, name, company_college, classes_attended)
      VALUES ('9955667788', 'Rahul Sharma', 'College B', 0)
      RETURNING id;
    `)
  ).rows[0].id;

  // Assign contacts to Operator
  await pg.exec(`
    INSERT INTO public.master_contact_assignments (master_contact_id, operator_id, status)
    VALUES
      ('${cA}', '${opId}', 'assigned'),
      ('${cB}', '${opId}', 'assigned'),
      ('${cC1}', '${opId}', 'assigned'),
      ('${cC2}', '${opId}', 'assigned');
  `);

  // Insert check-in records for Contact A (3 check-ins across 3 consecutive weeks)
  await pg.exec(`
    INSERT INTO public.master_contact_checkins (master_contact_id, phone, weekly_period, checked_in_at, approved_by, admin_email)
    VALUES
      ('${cA}', '9876543210', '2026-10-30', '2026-10-31 10:30:00+05:30', '${adminId}', 'admin@hkm.org'),
      ('${cA}', '9876543210', '2026-11-06', '2026-11-07 11:15:00+05:30', '${adminId}', 'admin@hkm.org'),
      ('${cA}', '9876543210', '2026-11-13', '2026-11-14 09:45:00+05:30', '${adminId}', 'admin@hkm.org');
  `);

  // Insert check-in records for Contact C1 (2 check-ins)
  await pg.exec(`
    INSERT INTO public.master_contact_checkins (master_contact_id, phone, weekly_period, checked_in_at, approved_by, admin_email)
    VALUES
      ('${cC1}', '9911223344', '2026-11-06', '2026-11-07 10:00:00+05:30', '${adminId}', 'admin@hkm.org'),
      ('${cC1}', '9911223344', '2026-11-13', '2026-11-14 10:15:00+05:30', '${adminId}', 'admin@hkm.org');
  `);

  // Insert a detached check-in record for testing phone fallback (master_contact_id is null, phone is 9123456789)
  const cD = (
    await pg.query<{ id: string }>(`
      INSERT INTO public.master_contacts (phone, name, company_college, classes_attended)
      VALUES ('9123456789', 'Detached Visitor', 'University', 1)
      RETURNING id;
    `)
  ).rows[0].id;

  await pg.exec(`
    INSERT INTO public.master_contact_checkins (master_contact_id, phone, weekly_period, checked_in_at, approved_by, admin_email)
    VALUES (NULL, '9123456789', '2026-11-13', '2026-11-14 12:00:00+05:30', '${adminId}', 'admin@hkm.org');
  `);

  // Helper simulating the attendance-history API lookup logic
  async function getAttendanceHistory(contactId?: string, rawPhone?: string) {
    const validContactId = contactId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(contactId) ? contactId : null;
    const cleanPhone = normalizePhone(rawPhone);

    let contactRow: { id: string; name: string; phone: string; classes_attended: number } | null = null;

    if (validContactId) {
      const res = await pg.query<{ id: string; name: string; phone: string; classes_attended: number }>(
        `SELECT id, name, phone, classes_attended FROM public.master_contacts WHERE id = $1;`,
        [validContactId]
      );
      if (res.rows.length > 0) contactRow = res.rows[0];
    }

    const phoneToSearch = cleanPhone || (contactRow?.phone ? normalizePhone(contactRow.phone) : '');
    if (!contactRow && phoneToSearch && phoneToSearch.length === 10) {
      const res = await pg.query<{ id: string; name: string; phone: string; classes_attended: number }>(
        `SELECT id, name, phone, classes_attended FROM public.master_contacts WHERE phone = $1;`,
        [phoneToSearch]
      );
      if (res.rows.length > 0) contactRow = res.rows[0];
    }

    const targetId = contactRow?.id || validContactId;
    const targetPhone = phoneToSearch || (contactRow?.phone ? normalizePhone(contactRow.phone) : '');

    let checkinRows: Array<{
      id: string;
      master_contact_id: string | null;
      phone: string;
      weekly_period: string;
      checked_in_at: string;
      admin_email: string | null;
    }> = [];

    if (targetId && targetPhone && targetPhone.length === 10) {
      const res = await pg.query<any>(
        `SELECT id, master_contact_id, phone, weekly_period, checked_in_at, admin_email
         FROM public.master_contact_checkins
         WHERE master_contact_id = $1 OR phone = $2
         ORDER BY checked_in_at DESC;`,
        [targetId, targetPhone]
      );
      checkinRows = res.rows;
    } else if (targetId) {
      const res = await pg.query<any>(
        `SELECT id, master_contact_id, phone, weekly_period, checked_in_at, admin_email
         FROM public.master_contact_checkins
         WHERE master_contact_id = $1
         ORDER BY checked_in_at DESC;`,
        [targetId]
      );
      checkinRows = res.rows;
    } else if (targetPhone && targetPhone.length === 10) {
      const res = await pg.query<any>(
        `SELECT id, master_contact_id, phone, weekly_period, checked_in_at, admin_email
         FROM public.master_contact_checkins
         WHERE phone = $1
         ORDER BY checked_in_at DESC;`,
        [targetPhone]
      );
      checkinRows = res.rows;
    }

    // Deduplicate
    const seenIds = new Set<string>();
    const seenPeriods = new Set<string>();
    const uniqueCheckins: typeof checkinRows = [];

    for (const r of checkinRows) {
      if (seenIds.has(r.id)) continue;
      if (r.weekly_period && seenPeriods.has(r.weekly_period)) continue;
      seenIds.add(r.id);
      if (r.weekly_period) seenPeriods.add(r.weekly_period);
      uniqueCheckins.push(r);
    }

    uniqueCheckins.sort((a, b) => new Date(b.checked_in_at).getTime() - new Date(a.checked_in_at).getTime());

    const records = uniqueCheckins.map((item) => {
      const meetup = getSaturdayMeetupDate(item.weekly_period);
      return {
        id: item.id,
        date: item.checked_in_at,
        weekly_period: item.weekly_period,
        meetup_date_str: meetup.dateStr,
        meetup_label: meetup.label,
        event_name: 'Saturday Meetup',
        status: 'Attended',
        admin_email: item.admin_email,
      };
    });

    const totalCount = Math.max(contactRow?.classes_attended ?? 0, records.length);

    return {
      contact: {
        id: contactRow?.id || targetId,
        name: contactRow?.name || 'Contact',
        phone: contactRow?.phone || targetPhone,
        classes_attended: totalCount,
      },
      records,
    };
  }

  // --- TEST 1: Canonical Master Contact ID Lookup ---
  const histA = await getAttendanceHistory(cA, '9876543210');
  const pass1 =
    histA.contact.classes_attended === 3 &&
    histA.records.length === 3 &&
    histA.records[0].weekly_period === '2026-11-13' && // Newest first
    histA.records[2].weekly_period === '2026-10-30';
  record(
    1,
    'Canonical Master Contact ID Lookup (UUID)',
    pass1,
    `Retrieved ${histA.records.length} check-ins for ${histA.contact.name}. Total classes attended: ${histA.contact.classes_attended}. Newest period: ${histA.records[0]?.weekly_period}`
  );

  // --- TEST 2: Fallback Lookup by Normalized Phone ---
  // Contact D checkin has master_contact_id = NULL in checkins table, but phone matches
  const histD = await getAttendanceHistory(cD, '9123456789');
  const pass2 = histD.contact.classes_attended === 1 && histD.records.length === 1;
  record(
    2,
    'Fallback Identity Matching by Normalized Mobile Number',
    pass2,
    `Successfully resolved detached check-in via 10-digit mobile fallback. Classes attended: ${histD.contact.classes_attended}, Records count: ${histD.records.length}`
  );

  // --- TEST 3: Strict Isolation - Never Match by Name Alone ---
  // Contact C1 and C2 both have name 'Rahul Sharma'
  // C1 has 2 check-ins, C2 has 0 check-ins
  const histC1 = await getAttendanceHistory(cC1, '9911223344');
  const histC2 = await getAttendanceHistory(cC2, '9955667788');
  const pass3 =
    histC1.contact.classes_attended === 2 &&
    histC1.records.length === 2 &&
    histC2.contact.classes_attended === 0 &&
    histC2.records.length === 0;
  record(
    3,
    'Strict Name Isolation: Never match by name alone',
    pass3,
    `Contacts sharing identical name "Rahul Sharma" maintained strictly isolated attendance: C1=${histC1.contact.classes_attended} classes vs C2=${histC2.contact.classes_attended} classes.`
  );

  // --- TEST 4: Zero Classes Attended Empty State ---
  // Contact B has 0 check-ins
  const histB = await getAttendanceHistory(cB, '8885418914');
  const pass4 = histB.contact.classes_attended === 0 && histB.records.length === 0;
  record(
    4,
    'Zero Classes Attended Empty State Handling',
    pass4,
    `Contact "${histB.contact.name}" correctly returns classes_attended: 0 and 0 records (triggers "No classes attended yet" view).`
  );

  // --- TEST 5: Operator Calling Status Dispositions Do NOT Affect Attendance ---
  // Operator changes calling status to 'Coming', 'Not Coming', 'Not Answered', 'Next Week'
  await pg.exec(`
    UPDATE public.master_contact_assignments
    SET status = 'Coming'
    WHERE master_contact_id = '${cB}';
  `);
  const histB_afterComing = await getAttendanceHistory(cB, '8885418914');

  await pg.exec(`
    UPDATE public.master_contact_assignments
    SET status = 'Not Coming'
    WHERE master_contact_id = '${cA}';
  `);
  const histA_afterNotComing = await getAttendanceHistory(cA, '9876543210');

  const pass5 =
    histB_afterComing.contact.classes_attended === 0 &&
    histA_afterNotComing.contact.classes_attended === 3 &&
    histA_afterNotComing.records.length === 3;
  record(
    5,
    'Independence from Calling Status (Coming/Not Coming != Attendance)',
    pass5,
    `Operator calling status changes (Coming / Not Coming) did NOT mutate classes_attended or check-ins. B remains 0, A remains 3.`
  );

  // --- TEST 6: Chronological Ordering & Record Metadata ---
  const recordsA = histA.records;
  const pass6 =
    recordsA.length === 3 &&
    recordsA[0].event_name === 'Saturday Meetup' &&
    recordsA[0].status === 'Attended' &&
    recordsA[0].meetup_label.includes('Saturday') &&
    new Date(recordsA[0].date).getTime() > new Date(recordsA[1].date).getTime() &&
    new Date(recordsA[1].date).getTime() > new Date(recordsA[2].date).getTime();
  record(
    6,
    'Chronological Ordering (Newest First) and Event Metadata',
    pass6,
    `Records sorted chronologically descending. Event: "${recordsA[0]?.event_name}", Status: "${recordsA[0]?.status}", Date label: "${recordsA[0]?.meetup_label}".`
  );

  // --- TEST 7: Deduplication Verification ---
  // If a contact's check-in row matches both contact_id and phone, exactly 1 row is returned
  const pass7 = histA.records.filter((r) => r.weekly_period === '2026-11-13').length === 1;
  record(
    7,
    'Deduplication across ID and Phone Matching',
    pass7,
    `No duplicate records returned for weekly period 2026-11-13 despite matching both master_contact_id and normalized phone.`
  );

  console.log('\n======================================================================');
  console.log('📊 TEST SUMMARY');
  console.log('======================================================================');
  const allPassed = results.every((r) => r.passed);
  console.log(`Total Scenarios: ${results.length}`);
  console.log(`Passed: ${results.filter((r) => r.passed).length}`);
  console.log(`Failed: ${results.filter((r) => !r.passed).length}`);
  console.log(`Overall Status: ${allPassed ? '🎉 ALL TESTS PASSED' : '❌ TESTS FAILED'}\n`);

  if (!allPassed) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
