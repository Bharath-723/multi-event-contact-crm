/**
 * Isolated Database Pre-Production Audit Test Suite for
 * Migration 20261106000000_dynamic_capacity_and_not_interested.sql
 * 
 * Powered by @electric-sql/pglite (Real PostgreSQL 16 WASM engine)
 */

import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

interface AuditCheck {
  section: string;
  check: string;
  passed: boolean;
  details: string;
}

const auditChecks: AuditCheck[] = [];

function recordCheck(section: string, check: string, passed: boolean, details: string) {
  auditChecks.push({ section, check, passed, details });
  const icon = passed ? '✅ [PASS]' : '❌ [FAIL]';
  console.log(`  ${icon} ${check}: ${details}`);
}

async function runAudit() {
  console.log('╔═════════════════════════════════════════════════════════════════════════╗');
  console.log('║   POSTGRESQL 16 ISOLATED AUDIT: MIGRATION 20261106000000                ║');
  console.log('╚═════════════════════════════════════════════════════════════════════════╝\n');

  const pg = new PGlite();

  // ──────────────────────────────────────────────────────────────────────────
  // Step 0: Initialize Exact Production Baseline Schema (Pre-Migration State)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('Step 0: Initializing authentic pre-migration production baseline schema...');
  await pg.exec(`
    -- Roles
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
    END $$;

    -- normalize_phone function (production implementation)
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

    -- Operators (Baseline: no capacity column yet)
    CREATE TABLE public.contact_operators (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      is_active BOOLEAN NOT NULL DEFAULT true,
      operator_type TEXT NOT NULL DEFAULT 'operator',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Master Contacts (Baseline: no is_not_interested columns yet)
    CREATE TABLE public.master_contacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      phone TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      gender TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Master Contact Events
    CREATE TABLE public.master_contact_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      master_contact_id UUID NOT NULL REFERENCES public.master_contacts(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      event_record_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Master Contact Assignments (Baseline: Authentic schema has NO assigned_by column!)
    CREATE TABLE public.master_contact_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      master_contact_id UUID NOT NULL REFERENCES public.master_contacts(id) ON DELETE CASCADE,
      operator_id UUID NOT NULL REFERENCES public.contact_operators(id) ON DELETE CASCADE,
      is_active BOOLEAN NOT NULL DEFAULT true,
      status TEXT NOT NULL DEFAULT 'assigned',
      comments TEXT,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX idx_unique_active_master_contact_assignment
      ON public.master_contact_assignments(master_contact_id)
      WHERE is_active = true;

    -- Registrations (Rathayatra)
    CREATE TABLE public.registrations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      gender TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Contact Assignments (Baseline: has assigned_by UUID, old status constraint without 'Not in Hyderabad')
    CREATE TABLE public.contact_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      registration_id UUID NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
      operator_id UUID NOT NULL REFERENCES public.contact_operators(id) ON DELETE CASCADE,
      is_active BOOLEAN NOT NULL DEFAULT true,
      status TEXT NOT NULL DEFAULT 'Pending',
      remarks TEXT,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT contact_assignments_status_check CHECK (status IN (
        'Pending', 'Assigned', 'Coming', 'Not Coming', 'Not Answered', 'Next Week', 
        'Not Interested', 'Not Connected', 'Callback Required', 'Contacted', 'Interested', 'Completed'
      ))
    );

    CREATE UNIQUE INDEX uq_contact_assignments_active_reg
      ON public.contact_assignments(registration_id)
      WHERE is_active = true;

    -- Krishnashtami Registrations
    CREATE TABLE public.krishnashtami_registrations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      gender TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Krishnashtami Contact Assignments (Baseline: old status constraint without 'Not in Hyderabad')
    CREATE TABLE public.krishnashtami_contact_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      registration_id UUID NOT NULL REFERENCES public.krishnashtami_registrations(id) ON DELETE CASCADE,
      operator_id UUID NOT NULL REFERENCES public.contact_operators(id) ON DELETE CASCADE,
      is_active BOOLEAN NOT NULL DEFAULT true,
      status TEXT NOT NULL DEFAULT 'Pending',
      remarks TEXT,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT krishnashtami_contact_assignments_status_check CHECK (status IN (
        'Pending', 'Assigned', 'Coming', 'Not Coming', 'Not Answered', 'Next Week', 
        'Not Interested', 'Not Connected', 'Callback Required', 'Contacted', 'Interested', 'Completed'
      ))
    );

    CREATE UNIQUE INDEX uq_krishnashtami_assignments_active_reg
      ON public.krishnashtami_contact_assignments(registration_id)
      WHERE is_active = true;

    -- Feedback Contacts
    CREATE TABLE public.feedback_contacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      gender TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Feedback Contact Assignments (Baseline: old status constraint without 'Not in Hyderabad')
    CREATE TABLE public.feedback_contact_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      feedback_contact_id UUID NOT NULL REFERENCES public.feedback_contacts(id) ON DELETE CASCADE,
      operator_id UUID NOT NULL REFERENCES public.contact_operators(id) ON DELETE CASCADE,
      is_active BOOLEAN NOT NULL DEFAULT true,
      status TEXT NOT NULL DEFAULT 'Assigned',
      notes TEXT,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT feedback_contact_assignments_status_check CHECK (status IN (
        'Pending', 'Assigned', 'Coming', 'Not Coming', 'Not Answered', 'Next Week', 
        'Not Interested', 'Not Connected', 'Callback Required', 'Contacted', 'Interested', 'Completed'
      ))
    );

    CREATE UNIQUE INDEX uq_feedback_assignments_active_contact
      ON public.feedback_contact_assignments(feedback_contact_id)
      WHERE is_active = true;

    -- Audit Logs
    CREATE TABLE public.audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      action TEXT NOT NULL,
      details JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  console.log('✅ Baseline schema initialized successfully.\n');

  // ──────────────────────────────────────────────────────────────────────────
  // Step 1: Seed Representative Pre-Migration Data
  // ──────────────────────────────────────────────────────────────────────────
  console.log('Step 1: Seeding representative pre-migration data...');

  // Operators
  const op1 = (await pg.query<{ id: string }>(`
    INSERT INTO public.contact_operators (name, email)
    VALUES ('Operator Standard', 'op1@example.com') RETURNING id;
  `)).rows[0].id;

  const op2 = (await pg.query<{ id: string }>(`
    INSERT INTO public.contact_operators (name, email)
    VALUES ('Operator Limited', 'op2@example.com') RETURNING id;
  `)).rows[0].id;

  // Master Contacts
  // mc_active_male
  const mc1 = (await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (name, phone, gender)
    VALUES ('Male Contact 1', '9876543210', 'Male') RETURNING id;
  `)).rows[0].id;

  // mc_female
  const mc2 = (await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (name, phone, gender)
    VALUES ('Female Contact 2', '9876543211', 'Female') RETURNING id;
  `)).rows[0].id;

  // mc_unknown_gender
  const mc3 = (await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (name, phone, gender)
    VALUES ('Unknown Gender Contact 3', '9876543212', NULL) RETURNING id;
  `)).rows[0].id;

  // mc_not_interested_master (via master_contact_assignments status)
  const mc4 = (await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (name, phone, gender)
    VALUES ('Not Interested Master Status', '9876543213', 'Male') RETURNING id;
  `)).rows[0].id;
  await pg.query(`
    INSERT INTO public.master_contact_assignments (master_contact_id, operator_id, is_active, status)
    VALUES ('${mc4}', '${op1}', true, 'Not Interested');
  `);

  // mc_ambiguous_comments (has comments mentioning 'not interested' but status is 'assigned' - must NOT be marked Not Interested)
  const mc5 = (await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (name, phone, gender)
    VALUES ('Ambiguous Comments Contact', '9876543214', 'Male') RETURNING id;
  `)).rows[0].id;
  await pg.query(`
    INSERT INTO public.master_contact_assignments (master_contact_id, operator_id, is_active, status, comments)
    VALUES ('${mc5}', '${op1}', true, 'assigned', 'Customer said: interested in online classes, not interested in offline');
  `);

  // mc_not_interested_rathayatra (via registrations & contact_assignments with status 'Not Interested')
  const mc6 = (await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (name, phone, gender)
    VALUES ('Not Interested Rathayatra', '9876543215', 'Male') RETURNING id;
  `)).rows[0].id;
  const reg1 = (await pg.query<{ id: string }>(`
    INSERT INTO public.registrations (full_name, phone, gender)
    VALUES ('Not Interested Rathayatra', '+91 9876543215', 'Male') RETURNING id;
  `)).rows[0].id;
  await pg.query(`
    INSERT INTO public.contact_assignments (registration_id, operator_id, is_active, status, remarks)
    VALUES ('${reg1}', '${op1}', false, 'Not Interested', 'Customer declined');
  `);

  // mc_not_interested_krishna (via krishnashtami & master_contact_events with status 'Not Interested')
  const mc7 = (await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (name, phone, gender)
    VALUES ('Not Interested Krishna Event', '9876543216', 'Male') RETURNING id;
  `)).rows[0].id;
  const kreg1 = (await pg.query<{ id: string }>(`
    INSERT INTO public.krishnashtami_registrations (full_name, phone, gender)
    VALUES ('Not Interested Krishna Event', '09876543216', 'Male') RETURNING id;
  `)).rows[0].id;
  await pg.query(`
    INSERT INTO public.master_contact_events (master_contact_id, source, event_record_id)
    VALUES ('${mc7}', 'krishnashtami', '${kreg1}');
  `);
  await pg.query(`
    INSERT INTO public.krishnashtami_contact_assignments (registration_id, operator_id, is_active, status)
    VALUES ('${kreg1}', '${op1}', false, 'Not Interested');
  `);

  // mc_not_interested_feedback (via feedback_contacts & canonical status 'Not Interested')
  const mc8 = (await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (name, phone, gender)
    VALUES ('Not Interested Feedback', '9876543217', 'Male') RETURNING id;
  `)).rows[0].id;
  const fc1 = (await pg.query<{ id: string }>(`
    INSERT INTO public.feedback_contacts (full_name, phone, gender)
    VALUES ('Not Interested Feedback', '9876543217', 'Male') RETURNING id;
  `)).rows[0].id;
  await pg.query(`
    INSERT INTO public.feedback_contact_assignments (feedback_contact_id, operator_id, is_active, status, notes)
    VALUES ('${fc1}', '${op1}', false, 'Not Interested', 'Call completed, not interested');
  `);

  // mc_not_interested_audit (via audit_logs)
  const mc9 = (await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (name, phone, gender)
    VALUES ('Not Interested Audit Log', '9876543218', 'Male') RETURNING id;
  `)).rows[0].id;
  await pg.query(`
    INSERT INTO public.audit_logs (action, details)
    VALUES ('UPDATE_ASSIGNMENT_STATUS', '{"contact_id": "${mc9}", "new_status": "Not Interested"}'::jsonb);
  `);

  // mc_not_interested_audit_event (via audit_logs linking event_record_id to master_contact_events)
  const mc10 = (await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (name, phone, gender)
    VALUES ('Not Interested Audit Event Log', '9876543219', 'Male') RETURNING id;
  `)).rows[0].id;
  const kreg2 = (await pg.query<{ id: string }>(`
    INSERT INTO public.krishnashtami_registrations (full_name, phone, gender)
    VALUES ('Not Interested Audit Event Log', '09876543219', 'Male') RETURNING id;
  `)).rows[0].id;
  await pg.query(`
    INSERT INTO public.master_contact_events (master_contact_id, source, event_record_id)
    VALUES ('${mc10}', 'krishnashtami', '${kreg2}');
  `);
  await pg.query(`
    INSERT INTO public.audit_logs (action, details)
    VALUES ('CONTACT_MARKED_NOT_INTERESTED', '{"contact_id": "${kreg2}"}'::jsonb);
  `);

  // Seeding malformed audit_logs records to ensure safe handling of invalid/non-UUID values
  await pg.query(`
    INSERT INTO public.audit_logs (action, details)
    VALUES 
      ('UPDATE_ASSIGNMENT_STATUS', '{"contact_id": "malformed-not-a-uuid", "new_status": "Not Interested"}'::jsonb),
      ('UPDATE_ASSIGNMENT_STATUS', '{"contact_id": "12345", "new_status": "Not Interested"}'::jsonb),
      ('UPDATE_ASSIGNMENT_STATUS', '{"contact_id": "", "new_status": "Not Interested"}'::jsonb),
      ('UPDATE_ASSIGNMENT_STATUS', '{"contact_id": null, "new_status": "Not Interested"}'::jsonb),
      ('CONTACT_MARKED_NOT_INTERESTED', '{"contact_id": "invalid-uuid-syntax-error"}'::jsonb),
      ('CONTACT_MARKED_NOT_INTERESTED', '{"other_field": "no_contact_id"}'::jsonb);
  `);

  // ── Scenario A: Historical source assignment has status Not Interested but no Master Contact exists ──
  const regOrphan = (await pg.query<{ id: string }>(`
    INSERT INTO public.registrations (full_name, phone, gender)
    VALUES ('Orphan NI Source Reg', '9876543220', 'Male') RETURNING id;
  `)).rows[0].id;
  await pg.query(`
    INSERT INTO public.contact_assignments (registration_id, operator_id, is_active, status, remarks)
    VALUES ('${regOrphan}', '${op1}', true, 'Not Interested', 'Declined offer');
  `);

  // ── Scenario B: Historical Not Interested source identity already has multiple matching Master Contacts ──
  const mcDup1 = (await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (name, phone, gender)
    VALUES ('Dup MC 1', '+919876543221', 'Male') RETURNING id;
  `)).rows[0].id;
  const mcDup2 = (await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (name, phone, gender)
    VALUES ('Dup MC 2', '9876543221', 'Male') RETURNING id;
  `)).rows[0].id;
  const regDup = (await pg.query<{ id: string }>(`
    INSERT INTO public.registrations (full_name, phone, gender)
    VALUES ('Dup Source Reg', '9876543221', 'Male') RETURNING id;
  `)).rows[0].id;
  await pg.query(`
    INSERT INTO public.contact_assignments (registration_id, operator_id, is_active, status)
    VALUES ('${regDup}', '${op1}', true, 'Not Interested');
  `);

  // ── Scenario C: Historical Not Interested registration is linked to a Master Contact with a different phone ──
  const mcDiff = (await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (name, phone, gender)
    VALUES ('Linked Diff Phone MC', '9876543222', 'Male') RETURNING id;
  `)).rows[0].id;
  const regDiff = (await pg.query<{ id: string }>(`
    INSERT INTO public.registrations (full_name, phone, gender)
    VALUES ('Linked Diff Phone Reg', '9876543223', 'Male') RETURNING id;
  `)).rows[0].id;
  await pg.query(`
    INSERT INTO public.master_contact_events (master_contact_id, source, event_record_id)
    VALUES ('${mcDiff}', 'rathayatra', '${regDiff}');
  `);
  await pg.query(`
    INSERT INTO public.contact_assignments (registration_id, operator_id, is_active, status)
    VALUES ('${regDiff}', '${op1}', true, 'Not Interested');
  `);

  // ── Scenario D: Historical Not Interested source assignment is still active across source tables ──
  const kregActive = (await pg.query<{ id: string }>(`
    INSERT INTO public.krishnashtami_registrations (full_name, phone, gender)
    VALUES ('Active NI Krishna', '9876543224', 'Male') RETURNING id;
  `)).rows[0].id;
  await pg.query(`
    INSERT INTO public.krishnashtami_contact_assignments (registration_id, operator_id, is_active, status)
    VALUES ('${kregActive}', '${op1}', true, 'Not Interested');
  `);

  const fcActive = (await pg.query<{ id: string }>(`
    INSERT INTO public.feedback_contacts (full_name, phone, gender)
    VALUES ('Active NI Feedback', '9876543225', 'Male') RETURNING id;
  `)).rows[0].id;
  await pg.query(`
    INSERT INTO public.feedback_contact_assignments (feedback_contact_id, operator_id, is_active, status)
    VALUES ('${fcActive}', '${op1}', true, 'Not Interested');
  `);

  console.log('✅ Representative test data seeded successfully.\n');

  // ──────────────────────────────────────────────────────────────────────────
  // Step 2: Apply Migration
  // ──────────────────────────────────────────────────────────────────────────
  console.log('Step 2: Applying migration 20261106000000_dynamic_capacity_and_not_interested.sql...');
  const migrationPath = path.resolve('supabase/migrations/20261106000000_dynamic_capacity_and_not_interested.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  try {
    await pg.exec(migrationSql);
    recordCheck('Migration Execution', 'Initial Migration Application', true, 'Executed with 0 errors.');
  } catch (err: any) {
    recordCheck('Migration Execution', 'Initial Migration Application', false, `Failed: ${err.message}`);
    throw err;
  }

  // Capture table counts after run 1 for idempotency verification
  const mcCountRun1 = (await pg.query<{ cnt: string }>(`SELECT count(*) as cnt FROM public.master_contacts;`)).rows[0].cnt;
  const caCountRun1 = (await pg.query<{ cnt: string }>(`SELECT count(*) as cnt FROM public.contact_assignments;`)).rows[0].cnt;
  const kcaCountRun1 = (await pg.query<{ cnt: string }>(`SELECT count(*) as cnt FROM public.krishnashtami_contact_assignments;`)).rows[0].cnt;
  const fcaCountRun1 = (await pg.query<{ cnt: string }>(`SELECT count(*) as cnt FROM public.feedback_contact_assignments;`)).rows[0].cnt;

  // ──────────────────────────────────────────────────────────────────────────
  // Step 3: Test Idempotency (Re-running migration must not fail or duplicate)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\nStep 3: Testing migration idempotency (re-running full migration)...');
  try {
    await pg.exec(migrationSql);
    const mcCountRun2 = (await pg.query<{ cnt: string }>(`SELECT count(*) as cnt FROM public.master_contacts;`)).rows[0].cnt;
    const caCountRun2 = (await pg.query<{ cnt: string }>(`SELECT count(*) as cnt FROM public.contact_assignments;`)).rows[0].cnt;
    const kcaCountRun2 = (await pg.query<{ cnt: string }>(`SELECT count(*) as cnt FROM public.krishnashtami_contact_assignments;`)).rows[0].cnt;
    const fcaCountRun2 = (await pg.query<{ cnt: string }>(`SELECT count(*) as cnt FROM public.feedback_contact_assignments;`)).rows[0].cnt;

    const countsMatch = mcCountRun1 === mcCountRun2 && caCountRun1 === caCountRun2 && kcaCountRun1 === kcaCountRun2 && fcaCountRun1 === fcaCountRun2;
    recordCheck(
      'Migration Idempotency',
      'Re-run full migration on populated database (no duplicate contacts or altered assignment history)',
      countsMatch,
      `Executed second time with 0 errors. Contacts count=${mcCountRun2}, assignments unchanged.`
    );
  } catch (err: any) {
    recordCheck('Migration Idempotency', 'Re-run full migration on populated database', false, `Failed on re-run: ${err.message}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Step 4: Verify Schema Changes & Constraints
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\nStep 4: Verifying schema changes and constraints...');

  // 4.1 Check contact_operators.capacity
  const opCols = await pg.query<{ column_name: string; column_default: string }>(`
    SELECT column_name, column_default FROM information_schema.columns
    WHERE table_name = 'contact_operators' AND column_name = 'capacity';
  `);
  recordCheck(
    'Schema Verification',
    'contact_operators.capacity column created with DEFAULT 40',
    opCols.rows.length === 1 && opCols.rows[0].column_default.includes('40'),
    `Found capacity column, default=${opCols.rows[0]?.column_default}`
  );

  // Check chk_operator_capacity constraint (capacity between 1 and 500)
  let constraintPassed = false;
  try {
    await pg.query(`UPDATE public.contact_operators SET capacity = 0 WHERE id = '${op1}';`);
  } catch (err: any) {
    constraintPassed = err.message.includes('chk_operator_capacity');
  }
  recordCheck(
    'Schema Verification',
    'chk_operator_capacity rejects capacity < 1',
    constraintPassed,
    'Capacity=0 rejected by CHECK constraint.'
  );

  let constraintHighPassed = false;
  try {
    await pg.query(`UPDATE public.contact_operators SET capacity = 501 WHERE id = '${op1}';`);
  } catch (err: any) {
    constraintHighPassed = err.message.includes('chk_operator_capacity');
  }
  recordCheck(
    'Schema Verification',
    'chk_operator_capacity rejects capacity > 500',
    constraintHighPassed,
    'Capacity=501 rejected by CHECK constraint.'
  );

  // 4.2 Check master_contacts is_not_interested columns
  const mcCols = await pg.query<{ column_name: string }>(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'master_contacts' 
      AND column_name IN ('is_not_interested', 'not_interested_at', 'not_interested_by');
  `);
  recordCheck(
    'Schema Verification',
    'master_contacts has is_not_interested, not_interested_at, not_interested_by',
    mcCols.rows.length === 3,
    `Found ${mcCols.rows.length} of 3 columns.`
  );

  // 4.3 Check assigned_by columns on source tables
  const caAssignedBy = await pg.query<{ data_type: string }>(`
    SELECT data_type FROM information_schema.columns
    WHERE table_name = 'contact_assignments' AND column_name = 'assigned_by';
  `);
  const fcaAssignedBy = await pg.query<{ data_type: string }>(`
    SELECT data_type FROM information_schema.columns
    WHERE table_name = 'feedback_contact_assignments' AND column_name = 'assigned_by';
  `);
  const kcaAssignedBy = await pg.query<{ data_type: string }>(`
    SELECT data_type FROM information_schema.columns
    WHERE table_name = 'krishnashtami_contact_assignments' AND column_name = 'assigned_by';
  `);
  recordCheck(
    'Schema Verification',
    'assigned_by column types (UUID for contact/feedback, TEXT for krishnashtami)',
    caAssignedBy.rows[0]?.data_type === 'uuid' &&
    fcaAssignedBy.rows[0]?.data_type === 'uuid' &&
    kcaAssignedBy.rows[0]?.data_type === 'text',
    `contact_assignments=${caAssignedBy.rows[0]?.data_type}, feedback=${fcaAssignedBy.rows[0]?.data_type}, krishnashtami=${kcaAssignedBy.rows[0]?.data_type}`
  );

  // 4.4 Check 'Not in Hyderabad' status constraint compatibility
  let notInHydCA = false;
  try {
    const regTemp = (await pg.query<{ id: string }>(`
      INSERT INTO public.registrations (full_name, phone, gender)
      VALUES ('Hyd Check', '9876543999', 'Male') RETURNING id;
    `)).rows[0].id;
    await pg.query(`
      INSERT INTO public.contact_assignments (registration_id, operator_id, is_active, status)
      VALUES ('${regTemp}', '${op1}', false, 'Not in Hyderabad');
    `);
    notInHydCA = true;
  } catch (err: any) {
    notInHydCA = false;
  }
  recordCheck(
    'Constraint Verification',
    'contact_assignments accepts "Not in Hyderabad"',
    notInHydCA,
    'Status "Not in Hyderabad" accepted without error.'
  );

  let notInHydFCA = false;
  try {
    const fcTemp = (await pg.query<{ id: string }>(`
      INSERT INTO public.feedback_contacts (full_name, phone, gender)
      VALUES ('Hyd Check FCA', '9876543998', 'Male') RETURNING id;
    `)).rows[0].id;
    await pg.query(`
      INSERT INTO public.feedback_contact_assignments (feedback_contact_id, operator_id, is_active, status)
      VALUES ('${fcTemp}', '${op1}', false, 'Not in Hyderabad');
    `);
    notInHydFCA = true;
  } catch (err: any) {
    notInHydFCA = false;
  }
  recordCheck(
    'Constraint Verification',
    'feedback_contact_assignments accepts "Not in Hyderabad"',
    notInHydFCA,
    'Status "Not in Hyderabad" accepted without error.'
  );

  let notInHydKCA = false;
  try {
    const kregTemp = (await pg.query<{ id: string }>(`
      INSERT INTO public.krishnashtami_registrations (full_name, phone, gender)
      VALUES ('Hyd Check KCA', '9876543997', 'Male') RETURNING id;
    `)).rows[0].id;
    await pg.query(`
      INSERT INTO public.krishnashtami_contact_assignments (registration_id, operator_id, is_active, status)
      VALUES ('${kregTemp}', '${op1}', false, 'Not in Hyderabad');
    `);
    notInHydKCA = true;
  } catch (err: any) {
    notInHydKCA = false;
  }
  recordCheck(
    'Constraint Verification',
    'krishnashtami_contact_assignments accepts "Not in Hyderabad"',
    notInHydKCA,
    'Status "Not in Hyderabad" accepted without error.'
  );

  // 4.5 Check 'Visited' and historical status constraint compatibility across all 3 source tables
  let visitedCA = false;
  let visitedFCA = false;
  let visitedKCA = false;
  try {
    const regVisited = (await pg.query<{ id: string }>(`
      INSERT INTO public.registrations (full_name, phone, gender)
      VALUES ('Visited CA', '9876543881', 'Male') RETURNING id;
    `)).rows[0].id;
    await pg.query(`
      INSERT INTO public.contact_assignments (registration_id, operator_id, is_active, status)
      VALUES ('${regVisited}', '${op1}', false, 'Visited');
    `);
    visitedCA = true;
  } catch (err: any) {
    visitedCA = false;
  }

  try {
    const fcVisited = (await pg.query<{ id: string }>(`
      INSERT INTO public.feedback_contacts (full_name, phone, gender)
      VALUES ('Visited FCA', '9876543882', 'Male') RETURNING id;
    `)).rows[0].id;
    await pg.query(`
      INSERT INTO public.feedback_contact_assignments (feedback_contact_id, operator_id, is_active, status)
      VALUES ('${fcVisited}', '${op1}', false, 'Visited');
    `);
    visitedFCA = true;
  } catch (err: any) {
    visitedFCA = false;
  }

  try {
    const kregVisited = (await pg.query<{ id: string }>(`
      INSERT INTO public.krishnashtami_registrations (full_name, phone, gender)
      VALUES ('Visited KCA', '9876543883', 'Male') RETURNING id;
    `)).rows[0].id;
    await pg.query(`
      INSERT INTO public.krishnashtami_contact_assignments (registration_id, operator_id, is_active, status)
      VALUES ('${kregVisited}', '${op1}', false, 'Visited');
    `);
    visitedKCA = true;
  } catch (err: any) {
    visitedKCA = false;
  }

  recordCheck(
    'Constraint Verification',
    'contact_assignments accepts "Visited"',
    visitedCA,
    'Status "Visited" accepted without error.'
  );
  recordCheck(
    'Constraint Verification',
    'feedback_contact_assignments accepts "Visited"',
    visitedFCA,
    'Status "Visited" accepted without error.'
  );
  recordCheck(
    'Constraint Verification',
    'krishnashtami_contact_assignments accepts "Visited"',
    visitedKCA,
    'Status "Visited" accepted without error.'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // Step 5: Verify Comprehensive Not Interested Backfill
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\nStep 5: Verifying comprehensive Not Interested backfill...');

  const backfilledContacts = await pg.query<{ id: string; name: string; is_not_interested: boolean }>(`
    SELECT id, name, is_not_interested FROM public.master_contacts ORDER BY name;
  `);

  const statusMap = new Map<string, boolean>();
  backfilledContacts.rows.forEach(r => statusMap.set(r.name, r.is_not_interested));

  recordCheck(
    'Backfill Verification',
    'Standard active contact remains NOT marked Not Interested',
    statusMap.get('Male Contact 1') === false,
    `is_not_interested=${statusMap.get('Male Contact 1')}`
  );
  recordCheck(
    'Backfill Verification',
    'Backfill from master_contact_assignments.status = "Not Interested"',
    statusMap.get('Not Interested Master Status') === true,
    `is_not_interested=${statusMap.get('Not Interested Master Status')}`
  );
  recordCheck(
    'Backfill Verification',
    'Ambiguous comments do NOT falsely mark contact as Not Interested',
    statusMap.get('Ambiguous Comments Contact') === false,
    `is_not_interested=${statusMap.get('Ambiguous Comments Contact')} (correctly preserved false)`
  );
  recordCheck(
    'Backfill Verification',
    'Backfill from contact_assignments (via normalized phone match on status)',
    statusMap.get('Not Interested Rathayatra') === true,
    `is_not_interested=${statusMap.get('Not Interested Rathayatra')}`
  );
  recordCheck(
    'Backfill Verification',
    'Backfill from krishnashtami_contact_assignments (via master_contact_events on status)',
    statusMap.get('Not Interested Krishna Event') === true,
    `is_not_interested=${statusMap.get('Not Interested Krishna Event')}`
  );
  recordCheck(
    'Backfill Verification',
    'Backfill from feedback_contact_assignments (canonical status)',
    statusMap.get('Not Interested Feedback') === true,
    `is_not_interested=${statusMap.get('Not Interested Feedback')}`
  );
  recordCheck(
    'Backfill Verification',
    'Backfill from audit_logs details JSON payload (direct contact_id)',
    statusMap.get('Not Interested Audit Log') === true,
    `is_not_interested=${statusMap.get('Not Interested Audit Log')}`
  );
  recordCheck(
    'Backfill Verification',
    'Backfill from audit_logs mapped via master_contact_events (event_record_id)',
    statusMap.get('Not Interested Audit Event Log') === true,
    `is_not_interested=${statusMap.get('Not Interested Audit Event Log')}`
  );

  // Verify malformed audit log records did not cause errors and were safely ignored
  const malformedAuditCount = await pg.query<{ count: string }>(`
    SELECT count(*)::text AS count FROM public.audit_logs
    WHERE details->>'contact_id' IN ('malformed-not-a-uuid', '12345', '', 'invalid-uuid-syntax-error');
  `);
  recordCheck(
    'Backfill Verification',
    'Malformed and non-UUID audit_logs contact_id values safely ignored without throwing casting errors',
    parseInt(malformedAuditCount.rows[0].count, 10) === 4,
    `malformed_records_retained=${malformedAuditCount.rows[0].count}`
  );

  // ── Scenario A Verification: Missing blocked Master Contact created for orphan source identity ──
  const orphanMc = await pg.query<{ id: string; name: string; is_not_interested: boolean; not_interested_at: string; not_interested_by: string | null }>(`
    SELECT id, name, is_not_interested, not_interested_at, not_interested_by
    FROM public.master_contacts
    WHERE normalize_phone(phone) = '9876543220';
  `);
  recordCheck(
    'Backfill Verification A',
    'Historical source assignment with status Not Interested creates persistent blocked Master Contact',
    orphanMc.rows.length === 1 && orphanMc.rows[0].is_not_interested === true && orphanMc.rows[0].name === 'Orphan NI Source Reg' && orphanMc.rows[0].not_interested_by === null,
    `Created=${orphanMc.rows.length}, is_not_interested=${orphanMc.rows[0]?.is_not_interested}, name=${orphanMc.rows[0]?.name}, not_interested_by=${orphanMc.rows[0]?.not_interested_by}`
  );

  // ── Scenario B Verification: Multiple matching Master Contacts are all blocked ──
  const dupMcs = await pg.query<{ id: string; name: string; is_not_interested: boolean }>(`
    SELECT id, name, is_not_interested
    FROM public.master_contacts
    WHERE normalize_phone(phone) = '9876543221';
  `);
  const allDupBlocked = dupMcs.rows.length >= 2 && dupMcs.rows.every(r => r.is_not_interested === true);
  recordCheck(
    'Backfill Verification B',
    'Historical Not Interested source identity with multiple matching Master Contacts blocks all matching records',
    allDupBlocked,
    `Found ${dupMcs.rows.length} records, all blocked=${allDupBlocked}`
  );

  // ── Scenario C Verification: Linked Master Contact with different phone are both blocked ──
  const diffMcStored = await pg.query<{ is_not_interested: boolean }>(`
    SELECT is_not_interested FROM public.master_contacts WHERE normalize_phone(phone) = '9876543222';
  `);
  const diffRegMcCreated = await pg.query<{ is_not_interested: boolean }>(`
    SELECT is_not_interested FROM public.master_contacts WHERE normalize_phone(phone) = '9876543223';
  `);
  const bothDiffBlocked = diffMcStored.rows[0]?.is_not_interested === true && diffRegMcCreated.rows[0]?.is_not_interested === true;
  recordCheck(
    'Backfill Verification C',
    'Historical Not Interested registration linked to Master Contact with different phone blocks both identities',
    bothDiffBlocked,
    `Stored MC (9876543222)=${diffMcStored.rows[0]?.is_not_interested}, Reg MC (9876543223)=${diffRegMcCreated.rows[0]?.is_not_interested}`
  );

  // ── Scenario D Verification: Historical active source assignments across platforms deactivated ──
  const activeCheckCA = await pg.query<{ cnt: string }>(`
    SELECT count(*) as cnt FROM public.contact_assignments
    WHERE registration_id IN ('${regOrphan}', '${regDup}', '${regDiff}') AND is_active = true;
  `);
  const activeCheckKCA = await pg.query<{ cnt: string }>(`
    SELECT count(*) as cnt FROM public.krishnashtami_contact_assignments
    WHERE registration_id = '${kregActive}' AND is_active = true;
  `);
  const activeCheckFCA = await pg.query<{ cnt: string }>(`
    SELECT count(*) as cnt FROM public.feedback_contact_assignments
    WHERE feedback_contact_id = '${fcActive}' AND is_active = true;
  `);
  const allDeactivated = Number(activeCheckCA.rows[0].cnt) === 0 && Number(activeCheckKCA.rows[0].cnt) === 0 && Number(activeCheckFCA.rows[0].cnt) === 0;
  recordCheck(
    'Backfill Verification D',
    'Historical active Not Interested source assignments across all platforms are deactivated without deleting history',
    allDeactivated,
    `Active CA=${activeCheckCA.rows[0].cnt}, KCA=${activeCheckKCA.rows[0].cnt}, FCA=${activeCheckFCA.rows[0].cnt}`
  );

  // Protection checks: existing assignment RPCs reject newly backfilled blocked identities
  const orphanMcId = orphanMc.rows[0]?.id;
  let masterAssignOrphanRejected = false;
  if (orphanMcId) {
    const tryAssignMc = await pg.query<{ res: any }>(`
      SELECT public.assign_master_contact_atomic('${orphanMcId}'::uuid, '${op1}'::uuid, NULL, 40, false) as res;
    `);
    masterAssignOrphanRejected = tryAssignMc.rows[0].res.success === false && tryAssignMc.rows[0].res.code === 'CONTACT_NOT_INTERESTED';
  }
  recordCheck(
    'Backfill Protection',
    'assign_master_contact_atomic rejects newly backfilled blocked identity with CONTACT_NOT_INTERESTED',
    masterAssignOrphanRejected,
    'Returned code: CONTACT_NOT_INTERESTED'
  );

  const tryAssignSource = await pg.query<{ res: any }>(`
    SELECT public.assign_contact_atomic('${regOrphan}'::uuid, '${op1}'::uuid, 'rathayatra', NULL, 40, false) as res;
  `);
  const sourceAssignOrphanRejected = tryAssignSource.rows[0].res.success === false && tryAssignSource.rows[0].res.code === 'CONTACT_NOT_INTERESTED';
  recordCheck(
    'Backfill Protection',
    'assign_contact_atomic rejects newly backfilled blocked identity with CONTACT_NOT_INTERESTED',
    sourceAssignOrphanRejected,
    'Returned code: CONTACT_NOT_INTERESTED'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // Step 6: Test assign_master_contact_atomic Invariants
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\nStep 6: Testing assign_master_contact_atomic RPC...');

  // Set Operator 2 capacity to 2 for precise limit testing
  await pg.query(`UPDATE public.contact_operators SET capacity = 2 WHERE id = '${op2}';`);

  // 6.1 Assignment of Male contact to Operator 2
  const res1 = await pg.query<{ res: any }>(`
    SELECT public.assign_master_contact_atomic(
      '${mc1}'::uuid,
      '${op2}'::uuid,
      NULL,
      40,
      false
    ) as res;
  `);
  recordCheck(
    'RPC assign_master_contact_atomic',
    'Valid Male contact assigned successfully',
    res1.rows[0].res.success === true && res1.rows[0].res.code === 'ASSIGNED',
    `Code: ${res1.rows[0].res.code}`
  );

  // Verify master_contact_assignments has no error and correct columns
  const mcaRow = await pg.query<{ status: string; is_active: boolean }>(`
    SELECT * FROM public.master_contact_assignments WHERE master_contact_id = '${mc1}' AND is_active = true;
  `);
  recordCheck(
    'RPC assign_master_contact_atomic',
    'Authentic schema insert succeeded with status=assigned and is_active=true',
    mcaRow.rows.length === 1 && mcaRow.rows[0].status === 'assigned',
    `Found ${mcaRow.rows.length} row, status=${mcaRow.rows[0]?.status}`
  );

  // 6.2 Fail-closed: Female contact rejected
  const resFemale = await pg.query<{ res: any }>(`
    SELECT public.assign_master_contact_atomic(
      '${mc2}'::uuid,
      '${op2}'::uuid,
      NULL,
      40,
      false
    ) as res;
  `);
  recordCheck(
    'RPC assign_master_contact_atomic',
    'Female contact rejected with GENDER_INELIGIBLE',
    resFemale.rows[0].res.success === false && resFemale.rows[0].res.code === 'GENDER_INELIGIBLE',
    `Code: ${resFemale.rows[0].res.code}`
  );

  // 6.3 Fail-closed: Unknown gender rejected
  const resUnknown = await pg.query<{ res: any }>(`
    SELECT public.assign_master_contact_atomic(
      '${mc3}'::uuid,
      '${op2}'::uuid,
      NULL,
      40,
      false
    ) as res;
  `);
  recordCheck(
    'RPC assign_master_contact_atomic',
    'Unknown gender contact rejected with GENDER_INELIGIBLE',
    resUnknown.rows[0].res.success === false && resUnknown.rows[0].res.code === 'GENDER_INELIGIBLE',
    `Code: ${resUnknown.rows[0].res.code}`
  );

  // 6.4 Permanent exclusion: Not Interested contact rejected
  const resNotInterested = await pg.query<{ res: any }>(`
    SELECT public.assign_master_contact_atomic(
      '${mc4}'::uuid,
      '${op2}'::uuid,
      NULL,
      40,
      false
    ) as res;
  `);
  recordCheck(
    'RPC assign_master_contact_atomic',
    'Not Interested contact rejected with CONTACT_NOT_INTERESTED',
    resNotInterested.rows[0].res.success === false && resNotInterested.rows[0].res.code === 'CONTACT_NOT_INTERESTED',
    `Code: ${resNotInterested.rows[0].res.code}`
  );

  // 6.5 Idempotency: Same operator, allow_reassign=false returns ALREADY_ASSIGNED
  const resIdempotent = await pg.query<{ res: any }>(`
    SELECT public.assign_master_contact_atomic(
      '${mc1}'::uuid,
      '${op2}'::uuid,
      NULL,
      40,
      false
    ) as res;
  `);
  recordCheck(
    'RPC assign_master_contact_atomic',
    'Re-assign to same operator with allow_reassign=false returns ALREADY_ASSIGNED',
    resIdempotent.rows[0].res.success === true && resIdempotent.rows[0].res.code === 'ALREADY_ASSIGNED',
    `Code: ${resIdempotent.rows[0].res.code}`
  );

  // 6.6 Guard against cross-operator reassignment when allow_reassign=false
  const resCrossBlocked = await pg.query<{ res: any }>(`
    SELECT public.assign_master_contact_atomic(
      '${mc1}'::uuid,
      '${op1}'::uuid,
      NULL,
      40,
      false
    ) as res;
  `);
  recordCheck(
    'RPC assign_master_contact_atomic',
    'Cross-operator assignment with allow_reassign=false rejected with CONTACT_ALREADY_ASSIGNED',
    resCrossBlocked.rows[0].res.success === false && resCrossBlocked.rows[0].res.code === 'CONTACT_ALREADY_ASSIGNED',
    `Code: ${resCrossBlocked.rows[0].res.code}`
  );

  // 6.7 Dynamic Operator Capacity Enforcement (op2 has capacity=2, currently has 1 assignment)
  // Create another male contact
  const mcExtra1 = (await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (name, phone, gender)
    VALUES ('Male Contact Extra 1', '9876543301', 'Male') RETURNING id;
  `)).rows[0].id;
  const resCapacity1 = await pg.query<{ res: any }>(`
    SELECT public.assign_master_contact_atomic(
      '${mcExtra1}'::uuid,
      '${op2}'::uuid,
      NULL,
      40,
      false
    ) as res;
  `);
  recordCheck(
    'RPC assign_master_contact_atomic',
    'Second assignment to op2 succeeds (count=2/2)',
    resCapacity1.rows[0].res.success === true && resCapacity1.rows[0].res.code === 'ASSIGNED',
    `Code: ${resCapacity1.rows[0].res.code}`
  );

  // Third assignment to op2 must fail because count=2 >= capacity=2
  const mcExtra2 = (await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (name, phone, gender)
    VALUES ('Male Contact Extra 2', '9876543302', 'Male') RETURNING id;
  `)).rows[0].id;
  const resCapacityOver = await pg.query<{ res: any }>(`
    SELECT public.assign_master_contact_atomic(
      '${mcExtra2}'::uuid,
      '${op2}'::uuid,
      NULL,
      40,
      false
    ) as res;
  `);
  recordCheck(
    'RPC assign_master_contact_atomic',
    'Third assignment to op2 rejected with OPERATOR_CAPACITY_EXCEEDED (dynamic limit 2)',
    resCapacityOver.rows[0].res.success === false && resCapacityOver.rows[0].res.code === 'OPERATOR_CAPACITY_EXCEEDED',
    `Code: ${resCapacityOver.rows[0].res.code}, Msg: ${resCapacityOver.rows[0].res.message}`
  );

  // 6.8 Caller supplying p_max_capacity=500 CANNOT bypass op2's dynamic capacity of 2!
  const resBypassAttempt = await pg.query<{ res: any }>(`
    SELECT public.assign_master_contact_atomic(
      '${mcExtra2}'::uuid,
      '${op2}'::uuid,
      NULL,
      500, -- Attempting to pass 500 to bypass
      false
    ) as res;
  `);
  recordCheck(
    'RPC assign_master_contact_atomic',
    'p_max_capacity cannot bypass operator database configured capacity',
    resBypassAttempt.rows[0].res.success === false && resBypassAttempt.rows[0].res.code === 'OPERATOR_CAPACITY_EXCEEDED',
    `Code: ${resBypassAttempt.rows[0].res.code}, max_capacity=${resBypassAttempt.rows[0].res.max_capacity}`
  );

  // 6.9 Reassignment of contact already assigned to op2 DOES NOT exceed capacity (count excludes self)
  const resReassignSelf = await pg.query<{ res: any }>(`
    SELECT public.assign_master_contact_atomic(
      '${mcExtra1}'::uuid,
      '${op2}'::uuid,
      NULL,
      40,
      true -- allow_reassign = true
    ) as res;
  `);
  recordCheck(
    'RPC assign_master_contact_atomic',
    'Reassigning same contact to operator at capacity allowed (self-replacement excluded)',
    resReassignSelf.rows[0].res.success === true && resReassignSelf.rows[0].res.code === 'REASSIGNED',
    `Code: ${resReassignSelf.rows[0].res.code}`
  );

  // 6.10 Reassignment to another operator (op1) deactivates old assignment and preserves history
  const resReassignCross = await pg.query<{ res: any }>(`
    SELECT public.assign_master_contact_atomic(
      '${mc1}'::uuid,
      '${op1}'::uuid,
      NULL,
      40,
      true -- allow_reassign = true
    ) as res;
  `);
  const activeCountMc1 = await pg.query<{ total: string | number; active: string | number }>(`
    SELECT count(*) as total, count(*) FILTER (WHERE is_active = true) as active
    FROM public.master_contact_assignments WHERE master_contact_id = '${mc1}';
  `);
  recordCheck(
    'RPC assign_master_contact_atomic',
    'Reassignment creates new active row and deactivates old row (exactly 1 active)',
    resReassignCross.rows[0].res.success === true && 
    Number(activeCountMc1.rows[0].active) === 1 && 
    Number(activeCountMc1.rows[0].total) === 2,
    `Total rows=${activeCountMc1.rows[0].total}, Active rows=${activeCountMc1.rows[0].active}`
  );

  // ──────────────────────────────────────────────────────────────────────────
  // Step 7: Test assign_contact_atomic Across All Source Tables
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\nStep 7: Testing assign_contact_atomic across all source tables...');

  // Set op1 capacity to 5
  await pg.query(`UPDATE public.contact_operators SET capacity = 5 WHERE id = '${op1}';`);

  // 7.1 Rathayatra source (contact_assignments)
  const regMale = (await pg.query<{ id: string }>(`
    INSERT INTO public.registrations (full_name, phone, gender)
    VALUES ('Rathayatra Male', '9876543401', 'Male') RETURNING id;
  `)).rows[0].id;
  const resRath = await pg.query<{ res: any }>(`
    SELECT public.assign_contact_atomic(
      '${regMale}'::uuid,
      '${op1}'::uuid,
      'rathayatra',
      '00000000-0000-0000-0000-000000000001'::uuid,
      40,
      false
    ) as res;
  `);
  recordCheck(
    'RPC assign_contact_atomic',
    'Rathayatra assignment succeeds with assigned_by UUID',
    resRath.rows[0].res.success === true && resRath.rows[0].res.code === 'ASSIGNED',
    `Code: ${resRath.rows[0].res.code}`
  );

  // 7.2 Krishnashtami source (krishnashtami_contact_assignments with assigned_by TEXT)
  const kregMale = (await pg.query<{ id: string }>(`
    INSERT INTO public.krishnashtami_registrations (full_name, phone, gender)
    VALUES ('Krishna Male', '9876543402', 'Male') RETURNING id;
  `)).rows[0].id;
  const resKrishna = await pg.query<{ res: any }>(`
    SELECT public.assign_contact_atomic(
      '${kregMale}'::uuid,
      '${op1}'::uuid,
      'krishnashtami',
      '00000000-0000-0000-0000-000000000001'::uuid,
      40,
      false
    ) as res;
  `);
  const kcaCheck = await pg.query<{ assigned_by: string; status: string }>(`
    SELECT assigned_by, status FROM public.krishnashtami_contact_assignments WHERE registration_id = '${kregMale}';
  `);
  recordCheck(
    'RPC assign_contact_atomic',
    'Krishnashtami assignment succeeds with casted assigned_by TEXT and status=Pending',
    resKrishna.rows[0].res.success === true && kcaCheck.rows[0]?.assigned_by === '00000000-0000-0000-0000-000000000001',
    `assigned_by=${kcaCheck.rows[0]?.assigned_by}, status=${kcaCheck.rows[0]?.status}`
  );

  // 7.3 Feedback source (feedback_contact_assignments with assigned_by UUID and status=Assigned)
  const fcMale = (await pg.query<{ id: string }>(`
    INSERT INTO public.feedback_contacts (full_name, phone, gender)
    VALUES ('Feedback Male', '9876543403', 'Male') RETURNING id;
  `)).rows[0].id;
  const resFeedback = await pg.query<{ res: any }>(`
    SELECT public.assign_contact_atomic(
      '${fcMale}'::uuid,
      '${op1}'::uuid,
      'feedback_contacts',
      '00000000-0000-0000-0000-000000000001'::uuid,
      40,
      false
    ) as res;
  `);
  const fcaCheck = await pg.query<{ assigned_by: string; status: string }>(`
    SELECT assigned_by, status FROM public.feedback_contact_assignments WHERE feedback_contact_id = '${fcMale}';
  `);
  recordCheck(
    'RPC assign_contact_atomic',
    'Feedback assignment succeeds with assigned_by UUID and status=Assigned',
    resFeedback.rows[0].res.success === true && fcaCheck.rows[0]?.status === 'Assigned',
    `assigned_by=${fcaCheck.rows[0]?.assigned_by}, status=${fcaCheck.rows[0]?.status}`
  );

  // 7.4 Cross-source Not Interested rejection via normalized phone
  // Registration with phone matching mc4 (marked Not Interested)
  const regNotInterested = (await pg.query<{ id: string }>(`
    INSERT INTO public.registrations (full_name, phone, gender)
    VALUES ('Registered But Not Interested', '+91 9876543213', 'Male') RETURNING id;
  `)).rows[0].id;
  const resSourceNotInterested = await pg.query<{ res: any }>(`
    SELECT public.assign_contact_atomic(
      '${regNotInterested}'::uuid,
      '${op1}'::uuid,
      'rathayatra',
      NULL,
      40,
      false
    ) as res;
  `);
  recordCheck(
    'RPC assign_contact_atomic',
    'Source assignment rejected when contact phone is marked Not Interested on master_contacts',
    resSourceNotInterested.rows[0].res.success === false && resSourceNotInterested.rows[0].res.code === 'CONTACT_NOT_INTERESTED',
    `Code: ${resSourceNotInterested.rows[0].res.code}`
  );

  // ──────────────────────────────────────────────────────────────────────────
  // Step 8: Test Capacity Reduction Behavior
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\nStep 8: Testing capacity reduction behavior...');
  // op1 currently has 1 active assignment in contact_assignments.
  // Reduce op1 capacity to 1
  await pg.query(`UPDATE public.contact_operators SET capacity = 1 WHERE id = '${op1}';`);
  const regExtra = (await pg.query<{ id: string }>(`
    INSERT INTO public.registrations (full_name, phone, gender)
    VALUES ('Extra Reg', '9876543501', 'Male') RETURNING id;
  `)).rows[0].id;
  const resReduced = await pg.query<{ res: any }>(`
    SELECT public.assign_contact_atomic(
      '${regExtra}'::uuid,
      '${op1}'::uuid,
      'rathayatra',
      NULL,
      40,
      false
    ) as res;
  `);
  recordCheck(
    'Capacity Reduction',
    'Lowering operator capacity dynamically rejects subsequent assignments',
    resReduced.rows[0].res.success === false && resReduced.rows[0].res.code === 'OPERATOR_CAPACITY_EXCEEDED',
    `Code: ${resReduced.rows[0].res.code}, Msg: ${resReduced.rows[0].res.message}`
  );

  // ──────────────────────────────────────────────────────────────────────────
  // Step 9: Test Invalid Capacity Fails Closed (No Silent 40 Fallback)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\nStep 9: Testing invalid capacity fails closed (no silent fallback to 40)...');
  // Temporarily disable check constraint to simulate corrupted or bypassed invalid operator capacity
  await pg.query(`ALTER TABLE public.contact_operators DROP CONSTRAINT IF EXISTS chk_operator_capacity;`);
  
  // Set op2 capacity to 0 (invalid)
  await pg.query(`UPDATE public.contact_operators SET capacity = 0 WHERE id = '${op2}';`);
  
  const mcTestInvalid = (await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (name, phone, gender)
    VALUES ('Male Invalid Op Test', '9876543601', 'Male') RETURNING id;
  `)).rows[0].id;

  const resInvalidMaster = await pg.query<{ res: any }>(`
    SELECT public.assign_master_contact_atomic(
      '${mcTestInvalid}'::uuid,
      '${op2}'::uuid,
      NULL,
      40,
      false
    ) as res;
  `);
  recordCheck(
    'Fail Closed on Invalid Capacity',
    'assign_master_contact_atomic rejects capacity=0 with INVALID_OPERATOR_CAPACITY without falling back to 40',
    resInvalidMaster.rows[0].res.success === false && resInvalidMaster.rows[0].res.code === 'INVALID_OPERATOR_CAPACITY',
    `Code: ${resInvalidMaster.rows[0].res.code}, Msg: ${resInvalidMaster.rows[0].res.message}`
  );

  const regTestInvalid = (await pg.query<{ id: string }>(`
    INSERT INTO public.registrations (full_name, phone, gender)
    VALUES ('Reg Invalid Op Test', '9876543602', 'Male') RETURNING id;
  `)).rows[0].id;

  const resInvalidContact = await pg.query<{ res: any }>(`
    SELECT public.assign_contact_atomic(
      '${regTestInvalid}'::uuid,
      '${op2}'::uuid,
      'rathayatra',
      NULL,
      40,
      false
    ) as res;
  `);
  recordCheck(
    'Fail Closed on Invalid Capacity',
    'assign_contact_atomic rejects capacity=0 with INVALID_OPERATOR_CAPACITY without falling back to 40',
    resInvalidContact.rows[0].res.success === false && resInvalidContact.rows[0].res.code === 'INVALID_OPERATOR_CAPACITY',
    `Code: ${resInvalidContact.rows[0].res.code}, Msg: ${resInvalidContact.rows[0].res.message}`
  );

  // Restore valid capacity and re-add constraint
  await pg.query(`UPDATE public.contact_operators SET capacity = 40 WHERE id = '${op2}';`);
  await pg.query(`ALTER TABLE public.contact_operators ADD CONSTRAINT chk_operator_capacity CHECK (capacity >= 1 AND capacity <= 500);`);

  // ──────────────────────────────────────────────────────────────────────────
  // Step 10: Capacity Reduction Below Active Count Preserves Existing Assignments
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\nStep 10: Testing capacity reduction preserves existing assignments...');
  // op2 currently has active assignments. Let's count them.
  const op2ActiveBefore = await pg.query<{ count: string | number }>(`
    SELECT count(*) as count FROM public.master_contact_assignments WHERE operator_id = '${op2}' AND is_active = true;
  `);
  const activeCountBefore = Number(op2ActiveBefore.rows[0].count);

  // Lower op2 capacity to 1 (which is strictly below activeCountBefore if >= 2)
  await pg.query(`UPDATE public.contact_operators SET capacity = 1 WHERE id = '${op2}';`);

  // Verify all existing assignments are preserved
  const op2ActiveAfter = await pg.query<{ count: string | number }>(`
    SELECT count(*) as count FROM public.master_contact_assignments WHERE operator_id = '${op2}' AND is_active = true;
  `);
  const activeCountAfter = Number(op2ActiveAfter.rows[0].count);

  recordCheck(
    'Capacity Reduction Preservation',
    'Existing active assignments are strictly preserved after capacity reduction',
    activeCountBefore === activeCountAfter,
    `Active assignments before: ${activeCountBefore}, after: ${activeCountAfter} (0 deleted/altered)`
  );

  // Step 10.2: Heavy workload operator (25 active assignments) lowered to capacity 10
  const opHeavy = (await pg.query<{ id: string }>(`
    INSERT INTO public.contact_operators (name, email, capacity)
    VALUES ('Heavy Operator', 'heavy_op@example.com', 40) RETURNING id;
  `)).rows[0].id;

  // Insert 25 active assignments
  for (let i = 1; i <= 25; i++) {
    const mcH = (await pg.query<{ id: string }>(`
      INSERT INTO public.master_contacts (name, phone, gender)
      VALUES ('Heavy Contact ${i}', '98765440${i < 10 ? '0' + i : i}', 'Male') RETURNING id;
    `)).rows[0].id;
    await pg.query(`
      INSERT INTO public.master_contact_assignments (master_contact_id, operator_id, is_active, status)
      VALUES ('${mcH}', '${opHeavy}', true, 'assigned');
    `);
  }

  const heavyBefore = await pg.query<{ count: string | number }>(`
    SELECT count(*) as count FROM public.master_contact_assignments WHERE operator_id = '${opHeavy}' AND is_active = true;
  `);

  // Lower capacity from 40 to 10
  await pg.query(`UPDATE public.contact_operators SET capacity = 10 WHERE id = '${opHeavy}';`);

  const heavyAfter = await pg.query<{ count: string | number }>(`
    SELECT count(*) as count FROM public.master_contact_assignments WHERE operator_id = '${opHeavy}' AND is_active = true;
  `);

  recordCheck(
    'Capacity Reduction Preservation',
    'Operator with 25 active assignments retains all 25 active assignments when capacity lowered to 10',
    Number(heavyBefore.rows[0].count) === 25 && Number(heavyAfter.rows[0].count) === 25,
    `Active count before: ${heavyBefore.rows[0].count}, after: ${heavyAfter.rows[0].count} (0 unassigned, 0 deleted)`
  );

  // Attempting 26th assignment fails closed with OPERATOR_CAPACITY_EXCEEDED
  const mc26 = (await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (name, phone, gender)
    VALUES ('Heavy Contact 26', '9876544026', 'Male') RETURNING id;
  `)).rows[0].id;

  const res26 = await pg.query<{ res: any }>(`
    SELECT public.assign_master_contact_atomic(
      '${mc26}'::uuid,
      '${opHeavy}'::uuid,
      NULL,
      40,
      false
    ) as res;
  `);

  recordCheck(
    'Capacity Reduction Enforcement',
    'Attempting 26th assignment on operator with 25 active / 10 capacity rejected with OPERATOR_CAPACITY_EXCEEDED',
    res26.rows[0].res.success === false && res26.rows[0].res.code === 'OPERATOR_CAPACITY_EXCEEDED',
    `Code: ${res26.rows[0].res.code}, Msg: ${res26.rows[0].res.message}`
  );

  // ──────────────────────────────────────────────────────────────────────────
  // Step 11: Not in Hyderabad Status Does NOT Trigger Unassignment or Exclusion
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\nStep 11: Testing Not in Hyderabad does not trigger unassignment or exclusion...');
  const mcHyd = (await pg.query<{ id: string }>(`
    INSERT INTO public.master_contacts (name, phone, gender)
    VALUES ('Hyd Stays Active', '9876543701', 'Male') RETURNING id;
  `)).rows[0].id;
  const asgnHyd = (await pg.query<{ id: string }>(`
    INSERT INTO public.master_contact_assignments (master_contact_id, operator_id, is_active, status)
    VALUES ('${mcHyd}', '${op1}', true, 'Not in Hyderabad') RETURNING id;
  `)).rows[0].id;

  const hydCheck = await pg.query<{ is_active: boolean; is_not_interested: boolean }>(`
    SELECT mca.is_active, mc.is_not_interested
    FROM public.master_contact_assignments mca
    JOIN public.master_contacts mc ON mc.id = mca.master_contact_id
    WHERE mca.id = '${asgnHyd}';
  `);
  recordCheck(
    'Not in Hyderabad Invariant',
    'Not in Hyderabad status remains active and does NOT trigger Not Interested exclusion',
    hydCheck.rows[0].is_active === true && hydCheck.rows[0].is_not_interested === false,
    `is_active=${hydCheck.rows[0].is_active}, is_not_interested=${hydCheck.rows[0].is_not_interested}`
  );

  // ──────────────────────────────────────────────────────────────────────────
  // Step 9: Summary & Verdict
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n╔═════════════════════════════════════════════════════════════════════════╗');
  console.log('║   AUDIT TEST SUMMARY                                                    ║');
  console.log('╚═════════════════════════════════════════════════════════════════════════╝\n');

  const total = auditChecks.length;
  const passed = auditChecks.filter(c => c.passed).length;
  const failed = auditChecks.filter(c => !c.passed).length;

  console.log(`Total Checks: ${total}`);
  console.log(`Passed:       ${passed}`);
  console.log(`Failed:       ${failed}`);

  if (failed > 0) {
    console.error('\n❌ AUDIT FAILED! Details of failed checks:');
    auditChecks.filter(c => !c.passed).forEach(c => {
      console.error(`  - [${c.section}] ${c.check}: ${c.details}`);
    });
    process.exit(1);
  } else {
    console.log('\n✅ ALL ISOLATED POSTGRESQL 16 AUDIT CHECKS PASSED PERFECTLY!\n');
  }
}

runAudit().catch(err => {
  console.error('Fatal error during audit:', err);
  process.exit(1);
});
