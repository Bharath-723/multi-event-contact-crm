/**
 * Mandatory Regression Test Suite: Malformed event_record_id in master_contact_events
 * Across All Three Source Types (Rathayatra, Krishnashtami, Feedback)
 *
 * Verifies:
 * 1. Migration executes cleanly without errors when master_contact_events contains:
 *    - Valid UUID represented as text
 *    - Invalid string such as 'not-a-uuid'
 *    - Empty string ''
 *    - NULL event_record_id
 *    - Valid UUID-shaped value that does not match any source record
 * 2. mark_contact_not_interested_atomic executes cleanly without errors with malformed event_record_id
 * 3. Valid event IDs resolve to the correct source records and deactivate active assignments
 * 4. Malformed and unmatched event IDs are safely ignored
 * 5. No unrelated contact is marked Not Interested or unassigned
 * 6. Migration is idempotent and runs twice without errors
 *
 * Engine: @electric-sql/pglite (Real PostgreSQL 16 WASM engine)
 */

import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

interface CheckResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: CheckResult[] = [];

function check(name: string, passed: boolean, details: string) {
  results.push({ name, passed, details });
  const icon = passed ? '✅ [PASS]' : '❌ [FAIL]';
  console.log(`  ${icon} ${name}: ${details}`);
}

async function run() {
  console.log('╔═════════════════════════════════════════════════════════════════════════╗');
  console.log('║   MANDATORY REGRESSION TEST: MALFORMED EVENT_RECORD_ID IN PG16          ║');
  console.log('╚═════════════════════════════════════════════════════════════════════════╝\n');

  const pg = new PGlite();

  // 1. Initialize Baseline Schema
  console.log('Step 1: Initializing production baseline schema...');
  await pg.exec(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
    END $$;

    CREATE OR REPLACE FUNCTION public.normalize_phone(p_phone text)
    RETURNS text AS $$
    DECLARE
      cleaned text;
    BEGIN
      IF p_phone IS NULL THEN RETURN NULL; END IF;
      cleaned := regexp_replace(p_phone, '\\D', '', 'g');
      IF length(cleaned) = 12 AND cleaned LIKE '91%' THEN
        cleaned := substring(cleaned from 3);
      ELSIF length(cleaned) = 11 AND cleaned LIKE '0%' THEN
        cleaned := substring(cleaned from 2);
      END IF;
      IF length(cleaned) = 10 AND cleaned ~ '^[6-9]\\d{9}$' THEN
        RETURN cleaned;
      ELSE
        RETURN cleaned;
      END IF;
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;

    CREATE TABLE public.contact_operators (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      is_active BOOLEAN NOT NULL DEFAULT true,
      operator_type TEXT NOT NULL DEFAULT 'operator',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE public.master_contacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      phone TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      gender TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE public.master_contact_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      master_contact_id UUID NOT NULL REFERENCES public.master_contacts(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      event_record_id TEXT, -- nullable to test NULL event_record_id
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE public.master_contact_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      master_contact_id UUID NOT NULL REFERENCES public.master_contacts(id) ON DELETE CASCADE,
      operator_id UUID NOT NULL REFERENCES public.contact_operators(id),
      status TEXT NOT NULL DEFAULT 'assigned',
      is_active BOOLEAN NOT NULL DEFAULT true,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE public.registrations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name TEXT NOT NULL,
      phone TEXT,
      gender TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE public.contact_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      registration_id UUID NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
      operator_id UUID NOT NULL REFERENCES public.contact_operators(id),
      is_active BOOLEAN NOT NULL DEFAULT true,
      status TEXT NOT NULL DEFAULT 'Pending',
      remarks TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE public.krishnashtami_registrations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name TEXT NOT NULL,
      phone TEXT,
      gender TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE public.krishnashtami_contact_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      registration_id UUID NOT NULL REFERENCES public.krishnashtami_registrations(id) ON DELETE CASCADE,
      operator_id UUID NOT NULL REFERENCES public.contact_operators(id),
      is_active BOOLEAN NOT NULL DEFAULT true,
      status TEXT NOT NULL DEFAULT 'Pending',
      comments TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE public.feedback_contacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name TEXT NOT NULL,
      phone TEXT,
      gender TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE public.feedback_contact_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      feedback_contact_id UUID NOT NULL REFERENCES public.feedback_contacts(id) ON DELETE CASCADE,
      operator_id UUID NOT NULL REFERENCES public.contact_operators(id),
      is_active BOOLEAN NOT NULL DEFAULT true,
      status TEXT NOT NULL DEFAULT 'Assigned',
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE public.audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      action TEXT NOT NULL,
      details JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  console.log('Step 2: Seeding test data with malformed event_record_ids across all 3 source types...');
  const op = (await pg.query<{ id: string }>(`
    INSERT INTO public.contact_operators (name, email)
    VALUES ('Audit Operator', 'audit.op@example.com') RETURNING id;
  `)).rows[0].id;

  // Source 1: Rathayatra
  const rValid = (await pg.query<{ id: string }>(`
    INSERT INTO public.registrations (full_name, phone, gender)
    VALUES ('Rathayatra Valid', '9000000001', 'Male') RETURNING id;
  `)).rows[0].id;
  const caValid = (await pg.query<{ id: string }>(`
    INSERT INTO public.contact_assignments (registration_id, operator_id, is_active, status)
    VALUES ('${rValid}', '${op}', true, 'Pending') RETURNING id;
  `)).rows[0].id;

  const rUnrelated = (await pg.query<{ id: string }>(`
    INSERT INTO public.registrations (full_name, phone, gender)
    VALUES ('Rathayatra Unrelated', '9000000002', 'Male') RETURNING id;
  `)).rows[0].id;
  const caUnrelated = (await pg.query<{ id: string }>(`
    INSERT INTO public.contact_assignments (registration_id, operator_id, is_active, status)
    VALUES ('${rUnrelated}', '${op}', true, 'Pending') RETURNING id;
  `)).rows[0].id;

  const mcRatha = (await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (name, phone, gender)
    VALUES ('MC Rathayatra NI', '9000000003', 'Male') RETURNING id;
  `)).rows[0].id;
  await pg.query(`
    INSERT INTO public.master_contact_assignments (master_contact_id, operator_id, status, is_active)
    VALUES ('${mcRatha}', '${op}', 'Not Interested', true);
  `);

  // Master contact events for Rathayatra: Valid, Malformed ('not-a-uuid'), Empty (''), Null, Unmatched UUID
  await pg.query(`
    INSERT INTO public.master_contact_events (master_contact_id, source, event_record_id)
    VALUES 
      ('${mcRatha}', 'rathayatra', '${rValid}'),
      ('${mcRatha}', 'rathayatra', 'not-a-uuid'),
      ('${mcRatha}', 'rathayatra', ''),
      ('${mcRatha}', 'rathayatra', NULL),
      ('${mcRatha}', 'rathayatra', '00000000-0000-0000-0000-999999999999');
  `);

  // Source 2: Krishnashtami
  const kValid = (await pg.query<{ id: string }>(`
    INSERT INTO public.krishnashtami_registrations (full_name, phone, gender)
    VALUES ('Krishnashtami Valid', '9000000004', 'Male') RETURNING id;
  `)).rows[0].id;
  const kcaValid = (await pg.query<{ id: string }>(`
    INSERT INTO public.krishnashtami_contact_assignments (registration_id, operator_id, is_active, status)
    VALUES ('${kValid}', '${op}', true, 'Pending') RETURNING id;
  `)).rows[0].id;

  const kUnrelated = (await pg.query<{ id: string }>(`
    INSERT INTO public.krishnashtami_registrations (full_name, phone, gender)
    VALUES ('Krishnashtami Unrelated', '9000000005', 'Male') RETURNING id;
  `)).rows[0].id;
  const kcaUnrelated = (await pg.query<{ id: string }>(`
    INSERT INTO public.krishnashtami_contact_assignments (registration_id, operator_id, is_active, status)
    VALUES ('${kUnrelated}', '${op}', true, 'Pending') RETURNING id;
  `)).rows[0].id;

  const mcKrishna = (await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (name, phone, gender)
    VALUES ('MC Krishna NI', '9000000006', 'Male') RETURNING id;
  `)).rows[0].id;
  await pg.query(`
    INSERT INTO public.master_contact_assignments (master_contact_id, operator_id, status, is_active)
    VALUES ('${mcKrishna}', '${op}', 'Not Interested', true);
  `);

  // Master contact events for Krishnashtami: Valid, Malformed, Empty, Null, Unmatched UUID
  await pg.query(`
    INSERT INTO public.master_contact_events (master_contact_id, source, event_record_id)
    VALUES 
      ('${mcKrishna}', 'krishnashtami', '${kValid}'),
      ('${mcKrishna}', 'krishnashtami', 'not-a-uuid-krishna'),
      ('${mcKrishna}', 'krishnashtami', ''),
      ('${mcKrishna}', 'krishnashtami', NULL),
      ('${mcKrishna}', 'krishnashtami', '00000000-0000-0000-0000-888888888888');
  `);

  // Source 3: Feedback
  const fValid = (await pg.query<{ id: string }>(`
    INSERT INTO public.feedback_contacts (full_name, phone, gender)
    VALUES ('Feedback Valid', '9000000007', 'Male') RETURNING id;
  `)).rows[0].id;
  const fcaValid = (await pg.query<{ id: string }>(`
    INSERT INTO public.feedback_contact_assignments (feedback_contact_id, operator_id, is_active, status)
    VALUES ('${fValid}', '${op}', true, 'Assigned') RETURNING id;
  `)).rows[0].id;

  const fUnrelated = (await pg.query<{ id: string }>(`
    INSERT INTO public.feedback_contacts (full_name, phone, gender)
    VALUES ('Feedback Unrelated', '9000000008', 'Male') RETURNING id;
  `)).rows[0].id;
  const fcaUnrelated = (await pg.query<{ id: string }>(`
    INSERT INTO public.feedback_contact_assignments (feedback_contact_id, operator_id, is_active, status)
    VALUES ('${fUnrelated}', '${op}', true, 'Assigned') RETURNING id;
  `)).rows[0].id;

  const mcFeed = (await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (name, phone, gender)
    VALUES ('MC Feedback NI', '9000000009', 'Male') RETURNING id;
  `)).rows[0].id;
  await pg.query(`
    INSERT INTO public.master_contact_assignments (master_contact_id, operator_id, status, is_active)
    VALUES ('${mcFeed}', '${op}', 'Not Interested', true);
  `);

  // Master contact events for Feedback: Valid, Malformed, Empty, Null, Unmatched UUID
  await pg.query(`
    INSERT INTO public.master_contact_events (master_contact_id, source, event_record_id)
    VALUES 
      ('${mcFeed}', 'feedback_contacts', '${fValid}'),
      ('${mcFeed}', 'feedback_contacts', 'malformed-feedback-id'),
      ('${mcFeed}', 'feedback_contacts', ''),
      ('${mcFeed}', 'feedback_contacts', NULL),
      ('${mcFeed}', 'feedback_contacts', '00000000-0000-0000-0000-777777777777');
  `);

  console.log('Step 3: Applying migration 20261106000000_dynamic_capacity_and_not_interested.sql...');
  const migrationPath = path.join(process.cwd(), 'supabase/migrations/20261106000000_dynamic_capacity_and_not_interested.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  try {
    await pg.exec(migrationSql);
    check('Migration Execution with Malformed event_record_ids', true, 'Executed without errors');
  } catch (err: any) {
    check('Migration Execution with Malformed event_record_ids', false, `Failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  }

  console.log('Step 4: Verifying Section 5 Historical Backfill with Malformed event_record_ids...');

  // 1. Rathayatra: Valid assignment must be deactivated; unrelated assignment must stay active
  const caValidRes = (await pg.query<{ is_active: boolean; status: string }>(`
    SELECT is_active, status FROM public.contact_assignments WHERE id = '${caValid}';
  `)).rows[0];
  check(
    'Rathayatra valid event ID assignment deactivated',
    caValidRes.is_active === false && caValidRes.status === 'Not Interested',
    `is_active=${caValidRes.is_active}, status=${caValidRes.status}`
  );

  const caUnrelatedRes = (await pg.query<{ is_active: boolean; status: string }>(`
    SELECT is_active, status FROM public.contact_assignments WHERE id = '${caUnrelated}';
  `)).rows[0];
  check(
    'Rathayatra unrelated assignment strictly preserved active',
    caUnrelatedRes.is_active === true && caUnrelatedRes.status === 'Pending',
    `is_active=${caUnrelatedRes.is_active}, status=${caUnrelatedRes.status}`
  );

  // 2. Krishnashtami: Valid assignment must be deactivated; unrelated assignment must stay active
  const kcaValidRes = (await pg.query<{ is_active: boolean; status: string }>(`
    SELECT is_active, status FROM public.krishnashtami_contact_assignments WHERE id = '${kcaValid}';
  `)).rows[0];
  check(
    'Krishnashtami valid event ID assignment deactivated',
    kcaValidRes.is_active === false && kcaValidRes.status === 'Not Interested',
    `is_active=${kcaValidRes.is_active}, status=${kcaValidRes.status}`
  );

  const kcaUnrelatedRes = (await pg.query<{ is_active: boolean; status: string }>(`
    SELECT is_active, status FROM public.krishnashtami_contact_assignments WHERE id = '${kcaUnrelated}';
  `)).rows[0];
  check(
    'Krishnashtami unrelated assignment strictly preserved active',
    kcaUnrelatedRes.is_active === true && kcaUnrelatedRes.status === 'Pending',
    `is_active=${kcaUnrelatedRes.is_active}, status=${kcaUnrelatedRes.status}`
  );

  // 3. Feedback: Valid assignment must be deactivated; unrelated assignment must stay active
  const fcaValidRes = (await pg.query<{ is_active: boolean; status: string }>(`
    SELECT is_active, status FROM public.feedback_contact_assignments WHERE id = '${fcaValid}';
  `)).rows[0];
  check(
    'Feedback valid event ID assignment deactivated',
    fcaValidRes.is_active === false && fcaValidRes.status === 'Not Interested',
    `is_active=${fcaValidRes.is_active}, status=${fcaValidRes.status}`
  );

  const fcaUnrelatedRes = (await pg.query<{ is_active: boolean; status: string }>(`
    SELECT is_active, status FROM public.feedback_contact_assignments WHERE id = '${fcaUnrelated}';
  `)).rows[0];
  check(
    'Feedback unrelated assignment strictly preserved active',
    fcaUnrelatedRes.is_active === true && fcaUnrelatedRes.status === 'Assigned',
    `is_active=${fcaUnrelatedRes.is_active}, status=${fcaUnrelatedRes.status}`
  );

  console.log('Step 5: Verifying mark_contact_not_interested_atomic with Malformed event_record_ids...');

  // Setup runtime test for mark_contact_not_interested_atomic
  // Create fresh registrations & assignments for runtime testing
  const rRuntime = (await pg.query<{ id: string }>(`
    INSERT INTO public.registrations (full_name, phone, gender)
    VALUES ('Runtime Ratha Valid', '9111111101', 'Male') RETURNING id;
  `)).rows[0].id;
  const caRuntime = (await pg.query<{ id: string }>(`
    INSERT INTO public.contact_assignments (registration_id, operator_id, is_active, status)
    VALUES ('${rRuntime}', '${op}', true, 'Pending') RETURNING id;
  `)).rows[0].id;

  const rRuntimeUnrelated = (await pg.query<{ id: string }>(`
    INSERT INTO public.registrations (full_name, phone, gender)
    VALUES ('Runtime Ratha Unrelated', '9111111102', 'Male') RETURNING id;
  `)).rows[0].id;
  const caRuntimeUnrelated = (await pg.query<{ id: string }>(`
    INSERT INTO public.contact_assignments (registration_id, operator_id, is_active, status)
    VALUES ('${rRuntimeUnrelated}', '${op}', true, 'Pending') RETURNING id;
  `)).rows[0].id;

  const mcRuntimeRatha = (await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (name, phone, gender)
    VALUES ('MC Runtime Ratha', '9111111103', 'Male') RETURNING id;
  `)).rows[0].id;

  // Link events with: Valid UUID, 'not-a-uuid', '', NULL, unmatched UUID
  await pg.query(`
    INSERT INTO public.master_contact_events (master_contact_id, source, event_record_id)
    VALUES 
      ('${mcRuntimeRatha}', 'rathayatra', '${rRuntime}'),
      ('${mcRuntimeRatha}', 'rathayatra', 'runtime-malformed-not-uuid'),
      ('${mcRuntimeRatha}', 'rathayatra', ''),
      ('${mcRuntimeRatha}', 'rathayatra', NULL),
      ('${mcRuntimeRatha}', 'rathayatra', '00000000-0000-0000-0000-111111111111');
  `);

  // Call mark_contact_not_interested_atomic for Rathayatra
  const rathaRpcRes = (await pg.query<{ res: any }>(`
    SELECT public.mark_contact_not_interested_atomic(
      p_master_contact_id := '${mcRuntimeRatha}'::uuid,
      p_operator_id := '${op}'::uuid
    ) AS res;
  `)).rows[0].res;

  check(
    'mark_contact_not_interested_atomic executed cleanly with malformed events (Rathayatra)',
    rathaRpcRes.success === true && rathaRpcRes.code === 'MARKED_NOT_INTERESTED',
    `success=${rathaRpcRes.success}, code=${rathaRpcRes.code}`
  );

  const caRuntimeRes = (await pg.query<{ is_active: boolean; status: string }>(`
    SELECT is_active, status FROM public.contact_assignments WHERE id = '${caRuntime}';
  `)).rows[0];
  check(
    'Runtime valid Rathayatra assignment deactivated by mark_contact_not_interested_atomic',
    caRuntimeRes.is_active === false && caRuntimeRes.status === 'Not Interested',
    `is_active=${caRuntimeRes.is_active}, status=${caRuntimeRes.status}`
  );

  const caRuntimeUnrelatedRes = (await pg.query<{ is_active: boolean; status: string }>(`
    SELECT is_active, status FROM public.contact_assignments WHERE id = '${caRuntimeUnrelated}';
  `)).rows[0];
  check(
    'Runtime unrelated Rathayatra assignment strictly preserved active',
    caRuntimeUnrelatedRes.is_active === true && caRuntimeUnrelatedRes.status === 'Pending',
    `is_active=${caRuntimeUnrelatedRes.is_active}, status=${caRuntimeUnrelatedRes.status}`
  );

  // Runtime test for Krishnashtami
  const kRuntime = (await pg.query<{ id: string }>(`
    INSERT INTO public.krishnashtami_registrations (full_name, phone, gender)
    VALUES ('Runtime Krishna Valid', '9111111104', 'Male') RETURNING id;
  `)).rows[0].id;
  const kcaRuntime = (await pg.query<{ id: string }>(`
    INSERT INTO public.krishnashtami_contact_assignments (registration_id, operator_id, is_active, status)
    VALUES ('${kRuntime}', '${op}', true, 'Pending') RETURNING id;
  `)).rows[0].id;

  const mcRuntimeKrishna = (await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (name, phone, gender)
    VALUES ('MC Runtime Krishna', '9111111105', 'Male') RETURNING id;
  `)).rows[0].id;

  await pg.query(`
    INSERT INTO public.master_contact_events (master_contact_id, source, event_record_id)
    VALUES 
      ('${mcRuntimeKrishna}', 'krishnashtami', '${kRuntime}'),
      ('${mcRuntimeKrishna}', 'krishnashtami', 'runtime-malformed-krishna'),
      ('${mcRuntimeKrishna}', 'krishnashtami', ''),
      ('${mcRuntimeKrishna}', 'krishnashtami', NULL),
      ('${mcRuntimeKrishna}', 'krishnashtami', '00000000-0000-0000-0000-222222222222');
  `);

  const krishnaRpcRes = (await pg.query<{ res: any }>(`
    SELECT public.mark_contact_not_interested_atomic(
      p_master_contact_id := '${mcRuntimeKrishna}'::uuid,
      p_operator_id := '${op}'::uuid
    ) AS res;
  `)).rows[0].res;

  check(
    'mark_contact_not_interested_atomic executed cleanly with malformed events (Krishnashtami)',
    krishnaRpcRes.success === true && krishnaRpcRes.code === 'MARKED_NOT_INTERESTED',
    `success=${krishnaRpcRes.success}, code=${krishnaRpcRes.code}`
  );

  const kcaRuntimeRes = (await pg.query<{ is_active: boolean; status: string }>(`
    SELECT is_active, status FROM public.krishnashtami_contact_assignments WHERE id = '${kcaRuntime}';
  `)).rows[0];
  check(
    'Runtime valid Krishnashtami assignment deactivated by mark_contact_not_interested_atomic',
    kcaRuntimeRes.is_active === false && kcaRuntimeRes.status === 'Not Interested',
    `is_active=${kcaRuntimeRes.is_active}, status=${kcaRuntimeRes.status}`
  );

  // Runtime test for Feedback
  const fRuntime = (await pg.query<{ id: string }>(`
    INSERT INTO public.feedback_contacts (full_name, phone, gender)
    VALUES ('Runtime Feedback Valid', '9111111106', 'Male') RETURNING id;
  `)).rows[0].id;
  const fcaRuntime = (await pg.query<{ id: string }>(`
    INSERT INTO public.feedback_contact_assignments (feedback_contact_id, operator_id, is_active, status)
    VALUES ('${fRuntime}', '${op}', true, 'Assigned') RETURNING id;
  `)).rows[0].id;

  const mcRuntimeFeed = (await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (name, phone, gender)
    VALUES ('MC Runtime Feedback', '9111111107', 'Male') RETURNING id;
  `)).rows[0].id;

  await pg.query(`
    INSERT INTO public.master_contact_events (master_contact_id, source, event_record_id)
    VALUES 
      ('${mcRuntimeFeed}', 'feedback_contacts', '${fRuntime}'),
      ('${mcRuntimeFeed}', 'feedback_contacts', 'runtime-malformed-feedback'),
      ('${mcRuntimeFeed}', 'feedback_contacts', ''),
      ('${mcRuntimeFeed}', 'feedback_contacts', NULL),
      ('${mcRuntimeFeed}', 'feedback_contacts', '00000000-0000-0000-0000-333333333333');
  `);

  const feedRpcRes = (await pg.query<{ res: any }>(`
    SELECT public.mark_contact_not_interested_atomic(
      p_master_contact_id := '${mcRuntimeFeed}'::uuid,
      p_operator_id := '${op}'::uuid
    ) AS res;
  `)).rows[0].res;

  check(
    'mark_contact_not_interested_atomic executed cleanly with malformed events (Feedback)',
    feedRpcRes.success === true && feedRpcRes.code === 'MARKED_NOT_INTERESTED',
    `success=${feedRpcRes.success}, code=${feedRpcRes.code}`
  );

  const fcaRuntimeRes = (await pg.query<{ is_active: boolean; status: string }>(`
    SELECT is_active, status FROM public.feedback_contact_assignments WHERE id = '${fcaRuntime}';
  `)).rows[0];
  check(
    'Runtime valid Feedback assignment deactivated by mark_contact_not_interested_atomic',
    fcaRuntimeRes.is_active === false && fcaRuntimeRes.status === 'Not Interested',
    `is_active=${fcaRuntimeRes.is_active}, status=${fcaRuntimeRes.status}`
  );

  console.log('Step 6: Testing migration idempotency (re-running on populated DB with malformed event_records)...');
  try {
    await pg.exec(migrationSql);
    check('Migration re-run (idempotency) on populated database', true, 'Executed second time with 0 errors');
  } catch (err: any) {
    check('Migration re-run (idempotency) on populated database', false, `Failed: ${err.message}`);
  }

  // Summary
  console.log('\n╔═════════════════════════════════════════════════════════════════════════╗');
  console.log('║   TEST SUMMARY                                                          ║');
  console.log('╚═════════════════════════════════════════════════════════════════════════╝');
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`Total Checks: ${total}`);
  console.log(`Passed:       ${passed}`);
  console.log(`Failed:       ${failed}`);

  if (failed > 0) {
    console.error('\n❌ SOME REGRESSION CHECKS FAILED!');
    process.exit(1);
  } else {
    console.log('\n✅ ALL MALFORMED EVENT_RECORD_ID REGRESSION CHECKS PASSED PERFECTLY!\n');
  }
}

run().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});

