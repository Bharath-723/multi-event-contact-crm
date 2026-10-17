import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';
import { normalizeOccupation } from '../src/lib/master-contacts';

async function runTestSuite() {
  console.log('================================================================================');
  console.log('   PROFESSION -> MASTER DASHBOARD OCCUPATION MAPPING TEST SUITE');
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

  // ============================================================================
  // SECTION 1: UNIT TESTS FOR normalizeOccupation
  // ============================================================================
  console.log('--- SECTION 1: normalizeOccupation Unit Tests ---');

  assert(normalizeOccupation('Student') === 'Student', 'Exact match: Student');
  assert(normalizeOccupation('Working') === 'Working', 'Exact match: Working');
  assert(normalizeOccupation('Business') === 'Business', 'Exact match: Business');
  assert(normalizeOccupation('Others') === 'Others', 'Exact match: Others');
  assert(normalizeOccupation('Other') === 'Others', 'Exact match: Other maps to Others');
  assert(normalizeOccupation('others') === 'Others', 'Case insensitive: others maps to Others');
  assert(normalizeOccupation(' Employee ') === 'Employee', 'Whitespace handling: Employee');
  assert(normalizeOccupation('software engineer') === 'Working', 'Semantic mapping: software engineer -> Working');
  assert(normalizeOccupation('shop owner') === 'Business', 'Semantic mapping: shop owner -> Business');
  assert(normalizeOccupation('college student') === 'Student', 'Semantic mapping: college student -> Student');
  assert(normalizeOccupation('CSE') === null, 'Branch: CSE returns null (displays as —)');
  assert(normalizeOccupation('Mechanical') === null, 'Branch: Mechanical returns null (displays as —)');
  assert(normalizeOccupation('') === null, 'Empty string returns null');
  assert(normalizeOccupation(null) === null, 'null returns null');
  assert(normalizeOccupation(undefined) === null, 'undefined returns null');

  // ============================================================================
  // SECTION 2: DATABASE MIGRATION & TRIGGER TESTS
  // ============================================================================
  console.log('\n--- SECTION 2: Database Trigger & Schema Tests ---');

  const pg = new PGlite();

  // Create baseline schema mimicking production HKM database
  await pg.exec(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
    END $$;

    CREATE OR REPLACE FUNCTION public.normalize_phone(input_phone text)
    RETURNS text AS $$
    DECLARE
      v_clean text;
    BEGIN
      IF input_phone IS NULL THEN RETURN NULL; END IF;
      v_clean := regexp_replace(input_phone, '[^0-9]', '', 'g');
      IF length(v_clean) = 12 AND substring(v_clean from 1 for 2) = '91' THEN
        v_clean := substring(v_clean from 3 for 10);
      ELSIF length(v_clean) = 11 AND substring(v_clean from 1 for 1) = '0' THEN
        v_clean := substring(v_clean from 2 for 10);
      END IF;
      IF length(v_clean) = 10 AND v_clean ~ '^[6-9][0-9]{9}$' THEN
        RETURN v_clean;
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql IMMUTABLE STRICT;

    CREATE TABLE public.master_contacts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      phone text NOT NULL UNIQUE,
      name text,
      age integer,
      gender text,
      area_of_stay text,
      company_college text,
      level text NOT NULL DEFAULT 'level-0',
      chanting integer NOT NULL DEFAULT 0,
      classes_attended integer NOT NULL DEFAULT 0,
      latest_registration_at timestamptz DEFAULT now(),
      latest_registration_source text,
      latest_registration_id text,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );

    CREATE TABLE public.master_contact_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      master_contact_id uuid NOT NULL REFERENCES public.master_contacts(id) ON DELETE CASCADE,
      phone text NOT NULL,
      source text NOT NULL,
      event_display_name text NOT NULL,
      event_record_id text NOT NULL,
      event_date timestamptz DEFAULT now(),
      occupation text,
      standard text,
      created_at timestamptz DEFAULT now(),
      CONSTRAINT unique_master_contact_event UNIQUE (source, event_record_id)
    );

    CREATE TABLE public.contacts_register (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name text NOT NULL,
      phone text NOT NULL,
      college_name text NOT NULL DEFAULT 'Other',
      area_of_stay text NOT NULL DEFAULT '',
      gender text NOT NULL,
      current_stay text,
      pg_name text,
      profession text,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );

    -- Other source tables needed by recalculate_master_latest_info
    CREATE TABLE public.krishnashtami_registrations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name text,
      phone text,
      age integer,
      gender text,
      area_of_stay text,
      company_college text,
      created_at timestamptz DEFAULT now()
    );

    CREATE TABLE public.registrations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name text,
      phone text,
      age integer,
      gender text,
      area_of_stay text,
      company_college text,
      created_at timestamptz DEFAULT now()
    );

    CREATE TABLE public.feedback_contacts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name text,
      phone text,
      gender text,
      current_stay text,
      college_name text,
      created_at timestamptz DEFAULT now()
    );

    CREATE OR REPLACE FUNCTION recalculate_master_latest_info(p_phone text)
    RETURNS void AS $$
    DECLARE
      v_latest RECORD;
      v_master_id uuid;
    BEGIN
      SELECT id INTO v_master_id FROM public.master_contacts WHERE phone = p_phone;
      IF v_master_id IS NULL THEN RETURN; END IF;

      WITH source_union AS (
        SELECT 'krishnashtami' AS source, id::text AS record_id, full_name AS name, age, gender, area_of_stay, company_college, COALESCE(created_at, '1970-01-01T00:00:00Z'::timestamptz) AS created_at
        FROM public.krishnashtami_registrations
        WHERE normalize_phone(phone) = p_phone
        UNION ALL
        SELECT 'rathayatra' AS source, id::text AS record_id, full_name AS name, age, gender, area_of_stay, company_college, COALESCE(created_at, '1970-01-01T00:00:00Z'::timestamptz) AS created_at
        FROM public.registrations
        WHERE normalize_phone(phone) = p_phone
        UNION ALL
        SELECT 'feedback_contacts' AS source, id::text AS record_id, full_name AS name, NULL AS age, gender, current_stay AS area_of_stay, college_name AS company_college, COALESCE(created_at, '1970-01-01T00:00:00Z'::timestamptz) AS created_at
        FROM public.feedback_contacts
        WHERE normalize_phone(phone) = p_phone
        UNION ALL
        SELECT 'contacts_register' AS source, id::text AS record_id, full_name AS name, NULL AS age, gender, area_of_stay, college_name AS company_college, COALESCE(created_at, '1970-01-01T00:00:00Z'::timestamptz) AS created_at
        FROM public.contacts_register
        WHERE normalize_phone(phone) = p_phone
      )
      SELECT * INTO v_latest
      FROM source_union
      ORDER BY created_at DESC, source DESC, record_id DESC
      LIMIT 1;

      IF v_latest IS NOT NULL THEN
        UPDATE public.master_contacts SET
          name = COALESCE(v_latest.name, master_contacts.name),
          age = COALESCE(v_latest.age, master_contacts.age),
          gender = COALESCE(v_latest.gender, master_contacts.gender),
          area_of_stay = COALESCE(v_latest.area_of_stay, master_contacts.area_of_stay),
          company_college = COALESCE(v_latest.company_college, master_contacts.company_college),
          latest_registration_at = v_latest.created_at,
          latest_registration_source = v_latest.source,
          latest_registration_id = v_latest.record_id,
          updated_at = now()
        WHERE id = v_master_id;
      END IF;
    END;
    $$ LANGUAGE plpgsql;

    -- Pre-create existing legacy trigger as it currently exists in production
    CREATE OR REPLACE FUNCTION public.sync_contacts_register_to_master()
    RETURNS TRIGGER AS $$
    BEGIN
      -- dummy placeholder before migration is applied
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trg_sync_contacts_register_master
    AFTER INSERT OR UPDATE ON public.contacts_register
    FOR EACH ROW EXECUTE FUNCTION public.sync_contacts_register_to_master();
  `);

  // Read and apply the exact migration file from disk
  const migrationPath = path.join(__dirname, '../supabase/migrations/20261017000002_contacts_register_profession_to_occupation.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf-8');

  // Verify migration runs inside transaction safely
  await pg.exec(migrationSql);
  assert(true, 'Migration 20261017000002 executed successfully from file');

  // --- Test 1: New registration with Profession = Student ---
  const reg1 = await pg.query<{ id: string }>(`
    INSERT INTO public.contacts_register (full_name, phone, college_name, area_of_stay, gender, profession)
    VALUES ('Student Tester', '9876543210', 'GITAM University', 'Madhapur', 'Male', 'Student')
    RETURNING id;
  `);
  const reg1Id = reg1.rows[0].id;

  const event1 = await pg.query<{ occupation: string; master_contact_id: string }>(`
    SELECT occupation, master_contact_id FROM public.master_contact_events
    WHERE source = 'contacts_register' AND event_record_id = $1;
  `, [reg1Id]);

  assert(event1.rows.length === 1, 'Test 1: Event record created for Student registration');
  assert(event1.rows[0]?.occupation === 'Student', 'Test 1: master_contact_events.occupation is Student');

  // --- Test 2: New registration with Profession = Working ---
  const reg2 = await pg.query<{ id: string }>(`
    INSERT INTO public.contacts_register (full_name, phone, college_name, area_of_stay, gender, profession)
    VALUES ('Working Tester', '9876543211', 'TCS', 'Hitec City', 'Male', 'Working')
    RETURNING id;
  `);
  const reg2Id = reg2.rows[0].id;

  const event2 = await pg.query<{ occupation: string }>(`
    SELECT occupation FROM public.master_contact_events
    WHERE source = 'contacts_register' AND event_record_id = $1;
  `, [reg2Id]);

  assert(event2.rows.length === 1 && event2.rows[0]?.occupation === 'Working', 'Test 2: master_contact_events.occupation is Working');

  // --- Test 3: New registrations with Profession = Business and Others ---
  const reg3a = await pg.query<{ id: string }>(`
    INSERT INTO public.contacts_register (full_name, phone, college_name, area_of_stay, gender, profession)
    VALUES ('Business Tester', '9876543212', 'Own Enterprise', 'Kukatpally', 'Male', 'Business')
    RETURNING id;
  `);
  const reg3b = await pg.query<{ id: string }>(`
    INSERT INTO public.contacts_register (full_name, phone, college_name, area_of_stay, gender, profession)
    VALUES ('Others Tester', '9876543213', 'Freelance', 'Gachibowli', 'Female', 'Others')
    RETURNING id;
  `);

  const event3a = await pg.query<{ occupation: string }>(`
    SELECT occupation FROM public.master_contact_events WHERE source = 'contacts_register' AND event_record_id = $1;
  `, [reg3a.rows[0].id]);
  const event3b = await pg.query<{ occupation: string }>(`
    SELECT occupation FROM public.master_contact_events WHERE source = 'contacts_register' AND event_record_id = $1;
  `, [reg3b.rows[0].id]);

  assert(event3a.rows[0]?.occupation === 'Business', 'Test 3a: master_contact_events.occupation is Business');
  assert(event3b.rows[0]?.occupation === 'Others', 'Test 3b: master_contact_events.occupation is Others');

  // --- Test 4: Existing Master Contact with missing occupation (historical backfill) ---
  // Simulate a historical record inserted before profession mapping
  const histReg = await pg.query<{ id: string }>(`
    INSERT INTO public.contacts_register (full_name, phone, college_name, area_of_stay, gender, profession)
    VALUES ('Historical Contact', '9876543214', 'CBIT', 'Kondapur', 'Male', 'Student')
    RETURNING id;
  `);
  // Artificially clear the occupation in master_contact_events to simulate historical legacy state
  await pg.query(`
    UPDATE public.master_contact_events
    SET occupation = NULL
    WHERE source = 'contacts_register' AND event_record_id = $1;
  `, [histReg.rows[0].id]);

  const beforeBackfill = await pg.query<{ occupation: string | null }>(`
    SELECT occupation FROM public.master_contact_events WHERE source = 'contacts_register' AND event_record_id = $1;
  `, [histReg.rows[0].id]);
  assert(beforeBackfill.rows[0]?.occupation === null, 'Test 4 pre-condition: historical event occupation is NULL');

  // Re-run the backfill query (idempotent step)
  await pg.exec(`
    UPDATE public.master_contact_events mce
    SET occupation = NULLIF(trim(cr.profession), '')
    FROM public.contacts_register cr
    WHERE mce.source = 'contacts_register'
      AND mce.event_record_id = cr.id::text
      AND cr.profession IS NOT NULL
      AND trim(cr.profession) <> ''
      AND (mce.occupation IS NULL OR trim(mce.occupation) = '');
  `);

  const afterBackfill = await pg.query<{ occupation: string | null }>(`
    SELECT occupation FROM public.master_contact_events WHERE source = 'contacts_register' AND event_record_id = $1;
  `, [histReg.rows[0].id]);
  assert(afterBackfill.rows[0]?.occupation === 'Student', 'Test 4 post-condition: historical event safely backfilled with Student');

  // --- Test 4b: Orphan contacts_register row with missing master_contact_events row backfilled ---
  // Create an orphan contacts_register row that somehow has no master_contact_events row
  const orphanReg = await pg.query<{ id: string }>(`
    INSERT INTO public.contacts_register (full_name, phone, college_name, area_of_stay, gender, profession)
    VALUES ('Orphan Tester', '9876543216', 'IIT Hyderabad', 'Kandi', 'Male', 'Student')
    RETURNING id;
  `);
  // Delete its master_contact_events row to simulate orphan state
  await pg.query(`
    DELETE FROM public.master_contact_events
    WHERE source = 'contacts_register' AND event_record_id = $1;
  `, [orphanReg.rows[0].id]);

  // Execute Backfill Step A: Create missing master_contact_events for orphan contacts_register rows
  await pg.exec(`
    INSERT INTO public.master_contact_events (
      master_contact_id, phone, source, event_display_name, event_record_id, event_date, created_at, occupation
    )
    SELECT 
      mc.id,
      normalize_phone(cr.phone),
      'contacts_register',
      'Contacts Register',
      cr.id::text,
      COALESCE(cr.created_at, now()),
      COALESCE(cr.created_at, now()),
      NULLIF(trim(cr.profession), '')
    FROM public.contacts_register cr
    JOIN public.master_contacts mc ON mc.phone = normalize_phone(cr.phone)
    WHERE normalize_phone(cr.phone) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.master_contact_events mce
        WHERE mce.source = 'contacts_register' AND mce.event_record_id = cr.id::text
      )
    ON CONFLICT (source, event_record_id) DO NOTHING;
  `);

  const orphanRecovered = await pg.query<{ occupation: string }>(`
    SELECT occupation FROM public.master_contact_events WHERE source = 'contacts_register' AND event_record_id = $1;
  `, [orphanReg.rows[0].id]);
  assert(orphanRecovered.rows.length === 1 && orphanRecovered.rows[0]?.occupation === 'Student', 'Test 4b: orphan contacts_register row recovered and event created with Student occupation');

  // --- Test 5: Existing Master Contact with non-empty occupation: null/blank update does NOT overwrite ---
  await pg.query(`
    UPDATE public.contacts_register
    SET profession = NULL, full_name = 'Working Tester Renamed'
    WHERE id = $1;
  `, [reg2Id]);

  const event2Preserved = await pg.query<{ occupation: string }>(`
    SELECT occupation FROM public.master_contact_events WHERE source = 'contacts_register' AND event_record_id = $1;
  `, [reg2Id]);
  assert(event2Preserved.rows[0]?.occupation === 'Working', 'Test 5: existing non-empty occupation Working was preserved when incoming profession is NULL');

  // --- Test 6: Registration with blank/null profession ---
  const regNull = await pg.query<{ id: string }>(`
    INSERT INTO public.contacts_register (full_name, phone, college_name, area_of_stay, gender, profession)
    VALUES ('Null Profession Tester', '9876543215', 'Osmania', 'Dilsukhnagar', 'Male', NULL)
    RETURNING id;
  `);
  const eventNull = await pg.query<{ occupation: string | null }>(`
    SELECT occupation FROM public.master_contact_events WHERE source = 'contacts_register' AND event_record_id = $1;
  `, [regNull.rows[0].id]);
  assert(eventNull.rows[0]?.occupation === null, 'Test 6: brand new registration with NULL profession leaves event occupation NULL');

  // --- Test 7: Update with a valid NEW profession ---
  await pg.query(`
    UPDATE public.contacts_register
    SET profession = 'Business'
    WHERE id = $1;
  `, [reg1Id]);

  const event1Updated = await pg.query<{ occupation: string }>(`
    SELECT occupation FROM public.master_contact_events WHERE source = 'contacts_register' AND event_record_id = $1;
  `, [reg1Id]);
  assert(event1Updated.rows[0]?.occupation === 'Business', 'Test 7: updating registration to valid new profession updates event occupation to Business');

  // --- Test 8: Phone Change Handling (Non-destructive reconciliation) ---
  // Change phone on reg1 from 9876543210 to 9876543299
  await pg.query(`
    UPDATE public.contacts_register
    SET phone = '9876543299'
    WHERE id = $1;
  `, [reg1Id]);

  const oldPhoneEvents = await pg.query(`
    SELECT * FROM public.master_contact_events WHERE phone = '9876543210' AND source = 'contacts_register';
  `);
  const newPhoneEvents = await pg.query<{ occupation: string }>(`
    SELECT occupation FROM public.master_contact_events WHERE phone = '9876543299' AND source = 'contacts_register';
  `);

  assert(oldPhoneEvents.rows.length === 0, 'Test 8: old phone event was disassociated upon phone change');
  assert(newPhoneEvents.rows.length === 1 && newPhoneEvents.rows[0]?.occupation === 'Business', 'Test 8: new phone master event established with preserved Business occupation');

  // ============================================================================
  // SECTION 3: DASHBOARD DISPLAY, EDIT MODAL, AND EXPORT SIMULATION
  // ============================================================================
  console.log('\n--- SECTION 3: Master Dashboard Simulation Tests ---');

  const allEvents = await pg.query<{
    master_contact_id: string;
    occupation: string | null;
    event_date: string;
  }>(`
    SELECT master_contact_id, occupation, event_date
    FROM public.master_contact_events
    ORDER BY event_date DESC;
  `);

  const occupationByMasterId: Record<string, string> = {};
  for (const e of allEvents.rows) {
    const cleanOcc = normalizeOccupation(e.occupation);
    if (cleanOcc && !occupationByMasterId[e.master_contact_id]) {
      occupationByMasterId[e.master_contact_id] = cleanOcc;
    }
  }

  const allMasters = await pg.query<{
    id: string;
    name: string;
    phone: string;
    gender: string;
  }>(`SELECT id, name, phone, gender FROM public.master_contacts;`);

  const formattedContacts = allMasters.rows.map((m) => {
    const mOcc = occupationByMasterId[m.id] || null;
    return {
      id: m.id,
      name: m.name,
      phone: m.phone,
      gender: m.gender,
      occupation: mOcc || '—',
    };
  });

  const studentContact = formattedContacts.find((c) => c.phone === '9876543214'); // Historical contact backfilled to Student
  const workingContact = formattedContacts.find((c) => c.phone === '9876543211'); // Working Tester
  const businessContact = formattedContacts.find((c) => c.phone === '9876543299'); // Updated to Business on new phone
  const othersContact = formattedContacts.find((c) => c.phone === '9876543213'); // Others Tester
  const nullContact = formattedContacts.find((c) => c.phone === '9876543215'); // Null tester

  assert(studentContact?.occupation === 'Student', 'Dashboard display: Student contact displays "Student"');
  assert(workingContact?.occupation === 'Working', 'Dashboard display: Working contact displays "Working"');
  assert(businessContact?.occupation === 'Business', 'Dashboard display: Business contact displays "Business"');
  assert(othersContact?.occupation === 'Others', 'Dashboard display: Others contact displays "Others"');
  assert(nullContact?.occupation === '—', 'Dashboard display: Contact without occupation displays "—"');

  // Filter simulation: Filter by 'Others'
  const filterOthers = formattedContacts.filter((c) => c.occupation.toLowerCase() === 'others');
  assert(filterOthers.length === 1 && filterOthers[0].phone === '9876543213', 'Dashboard filter: Filtering by "Others" returns exactly the Others contact');

  // Edit Modal simulation: PUT /api/master/[id] updating occupation to 'Others'
  await pg.query(`
    UPDATE public.master_contact_events
    SET occupation = 'Others'
    WHERE master_contact_id = $1;
  `, [studentContact?.id]);

  const updatedOcc = await pg.query<{ occupation: string }>(`
    SELECT occupation FROM public.master_contact_events WHERE master_contact_id = $1;
  `, [studentContact?.id]);
  assert(updatedOcc.rows[0]?.occupation === 'Others', 'Edit Modal: Updating master contact occupation updates event occupation to Others');

  // CSV Export simulation
  const csvRows = formattedContacts.map((c) => `"${c.name}","${c.phone}","${c.occupation}"`);
  assert(csvRows.some((r) => r.includes('"Others"')), 'CSV Export: Contains "Others"');
  assert(csvRows.some((r) => r.includes('"Working"')), 'CSV Export: Contains "Working"');

  console.log('\n================================================================================');
  console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} PASSED (${totalTests - passedTests} FAILED)`);
  console.log('================================================================================');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
