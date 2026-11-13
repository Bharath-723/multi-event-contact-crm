import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import * as fs from 'node:fs';
import * as path from 'node:path';

async function runGlobalNotInterestedBlockingTests() {
  console.log('========================================================================');
  console.log('STARTING GLOBAL NOT INTERESTED CONTACT BLOCKING VERIFICATION SUITE');
  console.log('========================================================================\n');

  const db = new PGlite();
  (db as any).onNotification?.((msg: any) => console.log('PG NOTIFY:', msg));

  // Load migration
  const migrationPath = path.resolve('supabase/migrations/20261106000000_dynamic_capacity_and_not_interested.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  // Baseline schema setup
  await db.exec(`
    DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
    END $$;

    CREATE OR REPLACE FUNCTION public.normalize_phone(raw_phone TEXT)
    RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
    DECLARE
        cleaned TEXT;
    BEGIN
        cleaned := regexp_replace(COALESCE(raw_phone, ''), '\\D', '', 'g');
        IF length(cleaned) = 12 AND cleaned LIKE '91%' THEN
            cleaned := substring(cleaned from 3);
        END IF;
        RETURN cleaned;
    END;
    $$;

    CREATE TABLE IF NOT EXISTS public.admins (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS public.contact_operators (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT,
        operator_type TEXT NOT NULL DEFAULT 'caller',
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.master_contacts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        phone TEXT UNIQUE NOT NULL,
        name TEXT,
        age INTEGER,
        gender TEXT,
        area_of_stay TEXT,
        company_college TEXT,
        chanting INTEGER DEFAULT 0,
        classes_attended INTEGER DEFAULT 0,
        level TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.master_contact_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        master_contact_id UUID REFERENCES public.master_contacts(id) ON DELETE CASCADE,
        phone TEXT NOT NULL,
        source TEXT NOT NULL,
        event_display_name TEXT NOT NULL,
        event_record_id TEXT NOT NULL,
        event_date TIMESTAMPTZ DEFAULT now(),
        standard TEXT,
        occupation TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        action TEXT NOT NULL,
        details JSONB,
        created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.master_contact_assignments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        master_contact_id UUID NOT NULL REFERENCES public.master_contacts(id) ON DELETE CASCADE,
        operator_id UUID NOT NULL REFERENCES public.contact_operators(id) ON DELETE CASCADE,
        assigned_at TIMESTAMPTZ DEFAULT now(),
        called_at TIMESTAMPTZ,
        status TEXT NOT NULL DEFAULT 'assigned',
        comments TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.registrations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        full_name TEXT,
        phone TEXT NOT NULL,
        gender TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.contact_assignments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        registration_id UUID NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
        operator_id UUID NOT NULL REFERENCES public.contact_operators(id) ON DELETE CASCADE,
        assigned_at TIMESTAMPTZ DEFAULT now(),
        status TEXT NOT NULL DEFAULT 'Pending',
        notes TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.krishnashtami_registrations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        full_name TEXT,
        phone TEXT NOT NULL,
        gender TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.krishnashtami_contact_assignments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        registration_id UUID NOT NULL REFERENCES public.krishnashtami_registrations(id) ON DELETE CASCADE,
        operator_id UUID NOT NULL REFERENCES public.contact_operators(id) ON DELETE CASCADE,
        assigned_at TIMESTAMPTZ DEFAULT now(),
        status TEXT NOT NULL DEFAULT 'Pending',
        notes TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.feedback_contacts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        full_name TEXT,
        phone TEXT NOT NULL,
        gender TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.feedback_contact_assignments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        feedback_contact_id UUID NOT NULL REFERENCES public.feedback_contacts(id) ON DELETE CASCADE,
        operator_id UUID NOT NULL REFERENCES public.contact_operators(id) ON DELETE CASCADE,
        assigned_at TIMESTAMPTZ DEFAULT now(),
        status TEXT NOT NULL DEFAULT 'Assigned',
        notes TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  // Apply migration
  await db.exec(migrationSql);
  console.log('Migration applied cleanly.\n');

  // Seed operator
  const opRes = await db.query<{ id: string }>(`
    INSERT INTO public.contact_operators (name, email, operator_type, capacity, is_active)
    VALUES ('Operator One', 'op1@test.com', 'caller', 40, true)
    RETURNING id;
  `);
  const operatorId = opRes.rows[0].id;

  // 1. GLOBAL BLOCK & MULTI-SOURCE DEACTIVATION
  console.log('--- 1. Testing Multi-Source Global Block & Assignment Deactivation ---');
  // Create contact with records across Rathayatra, Krishnashtami, Feedback, and Master
  const phone = '9876543210';
  const mRes = await db.query<{ id: string }>(`
    INSERT INTO public.master_contacts (phone, name, gender, is_not_interested)
    VALUES ($1, 'Global Block Contact', 'Male', false)
    RETURNING id;
  `, [phone]);
  const masterId = mRes.rows[0].id;

  const regRes = await db.query<{ id: string }>(`
    INSERT INTO public.registrations (full_name, phone, gender)
    VALUES ('Global Block Contact', $1, 'Male')
    RETURNING id;
  `, [phone]);
  const regId = regRes.rows[0].id;

  const kregRes = await db.query<{ id: string }>(`
    INSERT INTO public.krishnashtami_registrations (full_name, phone, gender)
    VALUES ('Global Block Contact', $1, 'Male')
    RETURNING id;
  `, [phone]);
  const kregId = kregRes.rows[0].id;

  const fRes = await db.query<{ id: string }>(`
    INSERT INTO public.feedback_contacts (full_name, phone, gender)
    VALUES ('Global Block Contact', $1, 'Male')
    RETURNING id;
  `, [phone]);
  const feedId = fRes.rows[0].id;

  // Link in master_contact_events
  await db.query(`
    INSERT INTO public.master_contact_events (master_contact_id, phone, source, event_display_name, event_record_id)
    VALUES 
      ($1, $2, 'rathayatra', 'Rathayatra', $3),
      ($1, $2, 'krishnashtami', 'Krishnashtami', $4),
      ($1, $2, 'feedback_contacts', 'Feedback', $5);
  `, [masterId, phone, regId, kregId, feedId]);

  // Create active assignments in ALL 4 tables
  await db.query(`
    INSERT INTO public.master_contact_assignments (master_contact_id, operator_id, is_active, status)
    VALUES ($1, $2, true, 'assigned');
  `, [masterId, operatorId]);
  await db.query(`
    INSERT INTO public.contact_assignments (registration_id, operator_id, is_active, status)
    VALUES ($1, $2, true, 'Pending');
  `, [regId, operatorId]);
  await db.query(`
    INSERT INTO public.krishnashtami_contact_assignments (registration_id, operator_id, is_active, status)
    VALUES ($1, $2, true, 'Pending');
  `, [kregId, operatorId]);
  await db.query(`
    INSERT INTO public.feedback_contact_assignments (feedback_contact_id, operator_id, is_active, status)
    VALUES ($1, $2, true, 'Assigned');
  `, [feedId, operatorId]);

  // Execute mark_contact_not_interested_atomic
  const markRes = await db.query<{ mark_contact_not_interested_atomic: any }>(`
    SELECT public.mark_contact_not_interested_atomic(
      p_master_contact_id => $1,
      p_phone => $2,
      p_operator_id => $3,
      p_reason => 'Devotee requested no calls'
    );
  `, [masterId, phone, operatorId]);

  const markResult = markRes.rows[0].mark_contact_not_interested_atomic;
  assert.equal(markResult.success, true, 'mark_contact_not_interested_atomic succeeded');

  // Verify master_contacts row
  const mcCheck = await db.query<{ is_not_interested: boolean; not_interested_by: string; not_interested_at: string }>(`
    SELECT is_not_interested, not_interested_by, not_interested_at
    FROM public.master_contacts
    WHERE id = $1;
  `, [masterId]);
  assert.equal(mcCheck.rows[0].is_not_interested, true, 'master_contacts.is_not_interested is true');
  assert.equal(mcCheck.rows[0].not_interested_by, operatorId, 'operator recorded in not_interested_by');
  assert.ok(mcCheck.rows[0].not_interested_at, 'timestamp recorded in not_interested_at');
  console.log('  ✓ Global exclusion flag, timestamp, and operator persisted to master_contacts');

  // Verify all 4 assignment tables: is_active = false, status = 'Not Interested', NO ROWS DELETED
  const mAssign = await db.query<{ is_active: boolean; status: string }>(`SELECT is_active, status FROM public.master_contact_assignments WHERE master_contact_id = $1;`, [masterId]);
  const cAssign = await db.query<{ is_active: boolean; status: string }>(`SELECT is_active, status FROM public.contact_assignments WHERE registration_id = $1;`, [regId]);
  const kAssign = await db.query<{ is_active: boolean; status: string }>(`SELECT is_active, status FROM public.krishnashtami_contact_assignments WHERE registration_id = $1;`, [kregId]);
  const fAssign = await db.query<{ is_active: boolean; status: string }>(`SELECT is_active, status FROM public.feedback_contact_assignments WHERE feedback_contact_id = $1;`, [feedId]);

  assert.equal(mAssign.rows.length, 1, 'master assignment row preserved (not deleted)');
  assert.equal(mAssign.rows[0].is_active, false, 'master assignment deactivated');
  assert.equal(mAssign.rows[0].status, 'Not Interested', 'master assignment status set to Not Interested');

  assert.equal(cAssign.rows.length, 1, 'rathayatra assignment row preserved (not deleted)');
  assert.equal(cAssign.rows[0].is_active, false, 'rathayatra assignment deactivated');
  assert.equal(cAssign.rows[0].status, 'Not Interested', 'rathayatra assignment status set to Not Interested');

  assert.equal(kAssign.rows.length, 1, 'krishnashtami assignment row preserved (not deleted)');
  assert.equal(kAssign.rows[0].is_active, false, 'krishnashtami assignment deactivated');
  assert.equal(kAssign.rows[0].status, 'Not Interested', 'krishnashtami assignment status set to Not Interested');

  assert.equal(fAssign.rows.length, 1, 'feedback assignment row preserved (not deleted)');
  assert.equal(fAssign.rows[0].is_active, false, 'feedback assignment deactivated');
  assert.equal(fAssign.rows[0].status, 'Not Interested', 'feedback assignment status set to Not Interested');
  console.log('  ✓ Active assignments deactivated across all 4 tables with historical rows strictly preserved');

  // 2. MANUAL ASSIGNMENT REJECTION
  console.log('\n--- 2. Testing Manual Assignment Rejection (CONTACT_NOT_INTERESTED) ---');
  // Attempt assigning master contact
  const tryMasterAssign = await db.query<{ assign_master_contact_atomic: any }>(`
    SELECT public.assign_master_contact_atomic(
      p_master_contact_id => $1,
      p_operator_id => $2,
      p_assigned_by => NULL,
      p_max_capacity => 40,
      p_allow_reassign => false
    );
  `, [masterId, operatorId]);
  assert.equal(tryMasterAssign.rows[0].assign_master_contact_atomic.success, false, 'Master assignment rejected');
  assert.equal(tryMasterAssign.rows[0].assign_master_contact_atomic.code, 'CONTACT_NOT_INTERESTED', 'Rejected with CONTACT_NOT_INTERESTED');
  console.log('  ✓ Master assignment strictly rejected with CONTACT_NOT_INTERESTED');

  // Attempt assigning source registration
  const trySourceAssign = await db.query<{ assign_contact_atomic: any }>(`
    SELECT public.assign_contact_atomic(
      p_contact_id => $1,
      p_operator_id => $2,
      p_source => 'rathayatra',
      p_assigned_by => NULL,
      p_max_capacity => 40,
      p_allow_reassign => false
    );
  `, [regId, operatorId]);
  console.log('Source assign response:', trySourceAssign.rows[0].assign_contact_atomic);
  assert.equal(trySourceAssign.rows[0].assign_contact_atomic.success, false, 'Source assignment rejected');
  assert.equal(trySourceAssign.rows[0].assign_contact_atomic.code, 'CONTACT_NOT_INTERESTED', 'Source assignment rejected with CONTACT_NOT_INTERESTED');
  console.log('  ✓ Source assignment strictly rejected with CONTACT_NOT_INTERESTED');

  // 3. STATUS SEPARATION (Not in Hyderabad vs Not Interested)
  console.log('\n--- 3. Testing Status Separation (Not in Hyderabad vs Not Interested) ---');
  const nihPhone = '9123456789';
  const nihMaster = await db.query<{ id: string }>(`
    INSERT INTO public.master_contacts (phone, name, gender, is_not_interested)
    VALUES ($1, 'NIH Contact', 'Male', false)
    RETURNING id;
  `, [nihPhone]);
  const nihMasterId = nihMaster.rows[0].id;

  // Assign NIH contact
  const nihAssign = await db.query<{ assign_master_contact_atomic: any }>(`
    SELECT public.assign_master_contact_atomic(
      p_master_contact_id => $1,
      p_operator_id => $2,
      p_assigned_by => NULL,
      p_max_capacity => 40,
      p_allow_reassign => false
    );
  `, [nihMasterId, operatorId]);
  assert.equal(nihAssign.rows[0].assign_master_contact_atomic.success, true, 'NIH contact assigned');

  // Set status to 'Not in Hyderabad'
  await db.query(`
    UPDATE public.master_contact_assignments
    SET status = 'Not in Hyderabad'
    WHERE master_contact_id = $1 AND is_active = true;
  `, [nihMasterId]);

  // Verify assignment remains active and is_not_interested is FALSE
  const nihCheck = await db.query<{ is_active: boolean; status: string }>(`
    SELECT is_active, status FROM public.master_contact_assignments WHERE master_contact_id = $1;
  `, [nihMasterId]);
  const nihMcCheck = await db.query<{ is_not_interested: boolean }>(`
    SELECT is_not_interested FROM public.master_contacts WHERE id = $1;
  `, [nihMasterId]);

  assert.equal(nihCheck.rows[0].is_active, true, 'Not in Hyderabad keeps assignment active');
  assert.equal(nihCheck.rows[0].status, 'Not in Hyderabad', 'Status recorded as Not in Hyderabad');
  assert.equal(nihMcCheck.rows[0].is_not_interested, false, 'Not in Hyderabad does NOT block or exclude contact');
  console.log('  ✓ Not in Hyderabad preserves active assignment and is not blocked or excluded');

  // 4. EXACT REGRESSION SCENARIO: Missing-Master-Contact Identity Scenario & Future Registration Prevention
  console.log('\n--- 4. Required Regression Test: Missing-Master-Contact Identity Scenario ---');
  // Initial data:
  // - Master Contact A: 1111111111.
  // - Linked Rathayatra registration: 2222222222.
  // - No Master Contact exists for 2222222222.
  // - A has an active Master assignment.
  // - The linked registration has an active source assignment.

  const phoneA = '1111111111';
  const phoneB = '2222222222';
  const phoneC = '3333333333'; // Unrelated contact

  // Create a second operator for cross-operator assignment attempts
  const op2Res = await db.query<{ id: string }>(`
    INSERT INTO public.contact_operators (name, email, operator_type, is_active, capacity)
    VALUES ('Operator Two', 'op2@test.com', 'caller', true, 40)
    RETURNING id;
  `);
  const operator2Id = op2Res.rows[0].id;

  // Master Contact A: 1111111111
  const mARes = await db.query<{ id: string }>(`
    INSERT INTO public.master_contacts (phone, name, gender, is_not_interested)
    VALUES ($1, 'Master Contact A', 'Male', false)
    RETURNING id;
  `, [phoneA]);
  const masterAId = mARes.rows[0].id;

  // Unrelated Contact C: 3333333333
  const mCRes = await db.query<{ id: string }>(`
    INSERT INTO public.master_contacts (phone, name, gender, is_not_interested)
    VALUES ($1, 'Master Contact C (Unrelated)', 'Male', false)
    RETURNING id;
  `, [phoneC]);
  const masterCId = mCRes.rows[0].id;

  // Linked Rathayatra registration: 2222222222 (No Master Contact exists for this phone initially!)
  const regBRes = await db.query<{ id: string }>(`
    INSERT INTO public.registrations (full_name, phone, gender)
    VALUES ('Linked Reg Phone B', $1, 'Male')
    RETURNING id;
  `, [phoneB]);
  const regBId = regBRes.rows[0].id;

  // Source registration is linked to Master Contact A in master_contact_events
  await db.query(`
    INSERT INTO public.master_contact_events (master_contact_id, phone, source, event_display_name, event_record_id)
    VALUES ($1, $2, 'rathayatra', 'Rathayatra Festival', $3);
  `, [masterAId, phoneB, regBId]);

  // Verify baseline: No Master Contact exists for 2222222222
  const initialCheckB = await db.query<{ count: number | string }>(`
    SELECT count(*) as count FROM public.master_contacts WHERE normalize_phone(phone) = $1;
  `, [phoneB]);
  assert.equal(Number(initialCheckB.rows[0].count), 0, 'No Master Contact initially exists for 2222222222');

  // A has an active Master assignment
  await db.query(`
    INSERT INTO public.master_contact_assignments (master_contact_id, operator_id, is_active, status)
    VALUES ($1, $2, true, 'assigned');
  `, [masterAId, operatorId]);

  // The linked registration has an active source assignment
  await db.query(`
    INSERT INTO public.contact_assignments (registration_id, operator_id, is_active, status)
    VALUES ($1, $2, true, 'Pending');
  `, [regBId, operatorId]);

  // Verify baseline: Contact A is active and not blocked
  const beforeA = await db.query<{ is_not_interested: boolean }>(`SELECT is_not_interested FROM public.master_contacts WHERE id = $1;`, [masterAId]);
  assert.equal(beforeA.rows[0].is_not_interested, false, 'Contact A initially unblocked');

  // Actions:
  // 1. Mark the linked contact Not Interested (supplying Master Contact A and linked phone 2222222222)
  const markCrossRes = await db.query<{ mark_contact_not_interested_atomic: any }>(`
    SELECT public.mark_contact_not_interested_atomic(
      p_master_contact_id => $1,
      p_phone => $2,
      p_operator_id => $3,
      p_reason => 'Devotee marked Not Interested on linked event'
    );
  `, [masterAId, phoneB, operatorId]);

  const crossResult = markCrossRes.rows[0].mark_contact_not_interested_atomic;
  assert.equal(crossResult.success, true, 'mark_contact_not_interested_atomic succeeded for cross-contact');

  // 2. Verify A is blocked
  const checkA = await db.query<{ is_not_interested: boolean; not_interested_by: string }>(`
    SELECT is_not_interested, not_interested_by FROM public.master_contacts WHERE id = $1;
  `, [masterAId]);
  assert.equal(checkA.rows[0].is_not_interested, true, 'Master Contact A is blocked (is_not_interested=true)');
  console.log('  ✓ Master Contact A (phone 1111111111) is blocked');

  // 3. Verify a persistent blocked Master Contact exists for 2222222222
  const checkB = await db.query<{ id: string; is_not_interested: boolean; not_interested_at: string; not_interested_by: string }>(`
    SELECT id, is_not_interested, not_interested_at, not_interested_by
    FROM public.master_contacts
    WHERE normalize_phone(phone) = $1;
  `, [phoneB]);
  assert.equal(checkB.rows.length, 1, 'Exactly one persistent Master Contact exists for phone 2222222222');
  assert.equal(checkB.rows[0].is_not_interested, true, 'Master Contact for 2222222222 has is_not_interested=true');
  assert.ok(checkB.rows[0].not_interested_at, 'not_interested_at timestamp is recorded');
  assert.equal(checkB.rows[0].not_interested_by, operatorId, 'not_interested_by recorded authentic operatorId');
  const masterBId = checkB.rows[0].id;
  console.log('  ✓ Persistent blocked Master Contact exists for 2222222222');

  // 4. Create a new source registration using 2222222222
  const newRegRes = await db.query<{ id: string }>(`
    INSERT INTO public.registrations (full_name, phone, gender)
    VALUES ('New Reg Phone B Later', $1, 'Male')
    RETURNING id;
  `, [phoneB]);
  const newRegBId = newRegRes.rows[0].id;

  // 5. Attempt source assignment to another operator
  const assignSourceTry = await db.query<{ assign_contact_atomic: any }>(`
    SELECT public.assign_contact_atomic(
      p_contact_id => $1,
      p_operator_id => $2,
      p_source => 'rathayatra',
      p_assigned_by => NULL,
      p_max_capacity => 40,
      p_allow_reassign => false
    );
  `, [newRegBId, operator2Id]);
  const sourceTryResult = assignSourceTry.rows[0].assign_contact_atomic;
  assert.equal(sourceTryResult.success, false, 'Source assignment to new registration rejected');
  assert.equal(sourceTryResult.code, 'CONTACT_NOT_INTERESTED', 'Source assignment rejected with CONTACT_NOT_INTERESTED');
  console.log('  ✓ Source assignment for new registration using 2222222222 rejected with CONTACT_NOT_INTERESTED');

  // 6. Attempt Master Dashboard assignment using the blocked phone identity
  const assignMasterTry = await db.query<{ assign_master_contact_atomic: any }>(`
    SELECT public.assign_master_contact_atomic(
      p_master_contact_id => $1,
      p_operator_id => $2,
      p_assigned_by => NULL,
      p_max_capacity => 40,
      p_allow_reassign => false
    );
  `, [masterBId, operator2Id]);
  const masterTryResult = assignMasterTry.rows[0].assign_master_contact_atomic;
  assert.equal(masterTryResult.success, false, 'Master assignment for blocked identity rejected');
  assert.equal(masterTryResult.code, 'CONTACT_NOT_INTERESTED', 'Master assignment rejected with CONTACT_NOT_INTERESTED');
  console.log('  ✓ Master Dashboard assignment using blocked identity rejected with CONTACT_NOT_INTERESTED');

  // Expected Assertions:
  // - Both phone identities remain globally blocked
  assert.equal(checkA.rows[0].is_not_interested, true, 'Phone A identity remains globally blocked');
  assert.equal(checkB.rows[0].is_not_interested, true, 'Phone B identity remains globally blocked');
  console.log('  ✓ Both phone identities remain globally blocked');

  // - Both Master Contact records remain visible
  const countMasterContacts = await db.query<{ cnt: number | string }>(`
    SELECT count(*) as cnt FROM public.master_contacts WHERE id IN ($1, $2);
  `, [masterAId, masterBId]);
  assert.equal(Number(countMasterContacts.rows[0].cnt), 2, 'Both Master Contacts A and B remain intact in master_contacts');
  console.log('  ✓ Both Master Contact records remain visible');

  // - No new unblocked duplicate is created
  const duplicateCheck = await db.query<{ cnt: number | string }>(`
    SELECT count(*) as cnt FROM public.master_contacts WHERE normalize_phone(phone) = $1;
  `, [phoneB]);
  assert.equal(Number(duplicateCheck.rows[0].cnt), 1, 'Exactly 1 Master Contact exists for phone 2222222222 (no duplicate)');
  const unblockedCheck = await db.query<{ cnt: number | string }>(`
    SELECT count(*) as cnt FROM public.master_contacts WHERE normalize_phone(phone) = $1 AND is_not_interested = false;
  `, [phoneB]);
  assert.equal(Number(unblockedCheck.rows[0].cnt), 0, 'Zero unblocked records exist for phone 2222222222');
  console.log('  ✓ No new unblocked duplicate is created');

  // - No active assignment remains for either identity
  const activeMasterAssigns = await db.query<{ count: number | string }>(`
    SELECT count(*) as count FROM public.master_contact_assignments
    WHERE master_contact_id IN ($1, $2) AND is_active = true;
  `, [masterAId, masterBId]);
  assert.equal(Number(activeMasterAssigns.rows[0].count), 0, 'Zero active Master assignments remain for either identity');

  const activeSourceAssigns = await db.query<{ count: number | string }>(`
    SELECT count(*) as count FROM public.contact_assignments
    WHERE registration_id IN ($1, $2) AND is_active = true;
  `, [regBId, newRegBId]);
  assert.equal(Number(activeSourceAssigns.rows[0].count), 0, 'Zero active source assignments remain for either identity');
  console.log('  ✓ No active assignment remains for either identity');

  // - All historical records remain intact
  const histMasterAssigns = await db.query<{ count: number | string }>(`
    SELECT count(*) as count FROM public.master_contact_assignments
    WHERE master_contact_id IN ($1, $2);
  `, [masterAId, masterBId]);
  assert.equal(Number(histMasterAssigns.rows[0].count), 1, 'Historical assignment record for A strictly preserved');

  const histSourceAssigns = await db.query<{ count: number | string }>(`
    SELECT count(*) as count FROM public.contact_assignments
    WHERE registration_id = $1;
  `, [regBId]);
  assert.equal(Number(histSourceAssigns.rows[0].count), 1, 'Historical source assignment record for regB strictly preserved');
  console.log('  ✓ All historical records remain intact');

  // - An unrelated phone number remains eligible and assignable
  const assignTryC = await db.query<{ assign_master_contact_atomic: any }>(`
    SELECT public.assign_master_contact_atomic(
      p_master_contact_id => $1,
      p_operator_id => $2,
      p_assigned_by => NULL,
      p_max_capacity => 40,
      p_allow_reassign => false
    );
  `, [masterCId, operatorId]);
  assert.equal(assignTryC.rows[0].assign_master_contact_atomic.success, true, 'Unrelated contact C assigned successfully');
  assert.equal(assignTryC.rows[0].assign_master_contact_atomic.code, 'ASSIGNED', 'Contact C status is ASSIGNED');
  console.log('  ✓ An unrelated phone number remains eligible and assignable');

  console.log('\n========================================================================');
  console.log('ALL GLOBAL NOT INTERESTED CONTACT BLOCKING TESTS PASSED (100%)');
  console.log('========================================================================\n');
}

runGlobalNotInterestedBlockingTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
