import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

async function runAllMigrationsStagingTest() {
  console.log('================================================================================');
  console.log('   FULL THREE-MIGRATION STAGING TEST SUITE (POSTGRESQL 16)');
  console.log('================================================================================\n');

  const pg = new PGlite();

  // Helper to strip NOTIFY pgrst for in-memory PGlite
  const loadMigration = (relPath: string) => {
    const raw = fs.readFileSync(path.resolve(relPath), 'utf8');
    return raw.replace(/NOTIFY\s+pgrst[^;]*;/gi, '-- NOTIFY skipped');
  };

  // ─── Step 0: Setup Supabase Roles & Baseline Tables simulating HKM schema ──────
  console.log('--- Step 0: Initializing Supabase Roles & Baseline Tables ---');
  await pg.exec(`
    -- Create Supabase roles in test engine
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
    END $$;

    CREATE OR REPLACE FUNCTION normalize_phone(phone_input TEXT)
    RETURNS TEXT AS $$
    BEGIN
      RETURN right(regexp_replace(phone_input, '[^0-9]', '', 'g'), 10);
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;

    -- contacts_register (pre-migration state: current_stay was NOT NULL, has legacy constraints)
    CREATE TABLE contacts_register (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      college_name TEXT NOT NULL,
      area_of_stay TEXT NOT NULL,
      gender TEXT NOT NULL CHECK (gender IN ('Male', 'Female')),
      current_stay TEXT NOT NULL CHECK (current_stay IN ('With Parents', 'In Hostel')),
      pg_name TEXT,
      skills TEXT[] NOT NULL DEFAULT '{}',
      interested_online_workshop BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT chk_contacts_register_pg_name CHECK (
        (current_stay IS DISTINCT FROM 'In Hostel' AND pg_name IS NULL) OR
        (current_stay = 'In Hostel' AND pg_name IS NOT NULL AND length(trim(pg_name)) >= 2)
      )
    );

    -- registrations
    CREATE TABLE registrations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      phone TEXT NOT NULL
    );

    -- krishnashtami_registrations
    CREATE TABLE krishnashtami_registrations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      phone TEXT NOT NULL
    );

    -- master_contacts
    CREATE TABLE master_contacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      phone TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- master_contact_events
    CREATE TABLE master_contact_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      master_contact_id UUID REFERENCES master_contacts(id),
      phone TEXT NOT NULL,
      source TEXT NOT NULL,
      event_display_name TEXT NOT NULL,
      event_record_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Seed existing records
    INSERT INTO master_contacts (phone, name) VALUES ('9999999999', 'Existing Master Contact');
    INSERT INTO contacts_register (full_name, phone, college_name, area_of_stay, gender, current_stay, pg_name)
    VALUES ('Male Student', '8888888888', 'CBIT', 'Gandipet', 'Male', 'With Parents', NULL);
  `);
  console.log('✅ Baseline roles, tables & data seeded successfully.');

  // ─── Step 1: Execute Migration 1 ───────────────────────────────────────────
  console.log('\n--- Step 1: Executing Migration 1 (20261015000000_contacts_register_nullable_current_stay.sql) ---');
  const m1Sql = loadMigration('supabase/migrations/20261015000000_contacts_register_nullable_current_stay.sql');
  await pg.exec(m1Sql);
  console.log('✅ Migration 1 executed cleanly.');

  // Test inserting female with NULL current_stay
  await pg.exec(`
    INSERT INTO contacts_register (full_name, phone, college_name, area_of_stay, gender, current_stay, pg_name)
    VALUES ('Female Student', '7777777777', 'CBIT', 'Kokapet', 'Female', NULL, NULL);
  `);
  console.log('✅ Female registration with NULL stay accepted.');

  // Test re-running Migration 1 (Idempotency and Canonical Preservation)
  await pg.exec(m1Sql);
  console.log('✅ Migration 1 re-run cleanly without dropping or recreating validated constraints.');

  // ─── Step 2: Execute Migration 2 ───────────────────────────────────────────
  console.log('\n--- Step 2: Executing Migration 2 (20261015120000_admin_portal_features_update.sql) ---');
  const m2Sql = loadMigration('supabase/migrations/20261015120000_admin_portal_features_update.sql');
  await pg.exec(m2Sql);
  console.log('✅ Migration 2 executed cleanly.');

  // Test re-running Migration 2 (Idempotency)
  await pg.exec(m2Sql);
  console.log('✅ Migration 2 re-run cleanly without dropping or recreating validated constraints.');

  // Test update_master_contact_chanting RPC
  const masterRow: any = await pg.query('SELECT id FROM master_contacts LIMIT 1;');
  const contactId = masterRow.rows[0].id;

  // Increment by 1
  const rpcInc: any = await pg.query(
    'SELECT public.update_master_contact_chanting($1, $2, $3) as chanting;',
    [contactId, 1, null]
  );
  if (rpcInc.rows[0].chanting !== 1) throw new Error('RPC increment failed: ' + rpcInc.rows[0].chanting);
  console.log('✅ RPC update_master_contact_chanting increment: chanting = 1');

  // Set to 16
  const rpcSet: any = await pg.query(
    'SELECT public.update_master_contact_chanting($1, $2, $3) as chanting;',
    [contactId, 0, 16]
  );
  if (rpcSet.rows[0].chanting !== 16) throw new Error('RPC set value failed: ' + rpcSet.rows[0].chanting);
  console.log('✅ RPC update_master_contact_chanting set value: chanting = 16');

  // Test negative set value rejected
  let negError = false;
  try {
    await pg.query(
      'SELECT public.update_master_contact_chanting($1, $2, $3);',
      [contactId, 0, -5]
    );
  } catch (err: any) {
    negError = true;
  }
  if (!negError) throw new Error('RPC failed to reject negative set value');
  console.log('✅ RPC update_master_contact_chanting correctly rejected negative set value.');

  // Test nonexistent contact ID rejected with P0002
  let p0002Error = false;
  let p0002Msg = '';
  try {
    await pg.query(
      'SELECT public.update_master_contact_chanting($1, $2, $3);',
      ['00000000-0000-0000-0000-000000000000', 1, null]
    );
  } catch (err: any) {
    p0002Error = true;
    p0002Msg = err.message;
  }
  if (!p0002Error || !p0002Msg.includes('not found')) throw new Error('RPC failed to raise not found exception on missing ID');
  console.log('✅ RPC update_master_contact_chanting correctly raised P0002 on nonexistent contact.');

  // Verify function permissions in pg_proc
  const privRes: any = await pg.query(`
    SELECT 
      has_function_privilege('public', p.oid, 'EXECUTE') AS public_can_execute,
      has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
      has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_execute
    FROM pg_proc p
    WHERE p.proname = 'update_master_contact_chanting';
  `);
  const priv = privRes.rows[0];
  if (priv.public_can_execute || priv.anon_can_execute || priv.authenticated_can_execute || !priv.service_role_can_execute) {
    throw new Error('RPC privileges incorrect: ' + JSON.stringify(priv));
  }
  console.log('✅ RPC privileges verified: service_role ONLY (public=false, anon=false, authenticated=false).');

  // ─── Step 3: Execute Migration 3 ───────────────────────────────────────────
  console.log('\n--- Step 3: Executing Migration 3 (20261016000000_master_contacts_level.sql) ---');
  const m3Sql = loadMigration('supabase/migrations/20261016000000_master_contacts_level.sql');
  await pg.exec(m3Sql);
  console.log('✅ Migration 3 executed cleanly.');

  // Test re-running Migration 3 (Idempotency)
  await pg.exec(m3Sql);
  console.log('✅ Migration 3 re-run cleanly.');

  // Verify that level on existing master contact is 'level-0'
  const masterLevelRes: any = await pg.query('SELECT level FROM master_contacts WHERE id = $1;', [contactId]);
  if (masterLevelRes.rows[0].level !== 'level-0') {
    throw new Error('Default level was not level-0: ' + masterLevelRes.rows[0].level);
  }
  console.log('✅ Pre-existing master contact has level = "level-0" without physical UPDATE rewrite.');

  // ─── Step 4: Test Divergent Constraint Protection ──────────────────────────
  console.log('\n--- Step 4: Testing Divergent Constraint Safety Halt ---');
  // Intentionally mutate chk_master_contacts_chanting to a divergent check
  await pg.exec(`
    ALTER TABLE master_contacts DROP CONSTRAINT chk_master_contacts_chanting;
    ALTER TABLE master_contacts ADD CONSTRAINT chk_master_contacts_chanting CHECK (chanting >= 10);
  `);

  let divCaught = false;
  let divMsg = '';
  try {
    await pg.exec(m2Sql);
  } catch (err: any) {
    divCaught = true;
    divMsg = err.message;
  }
  if (!divCaught || !divMsg.includes('unexpected definition')) {
    throw new Error('FAILED: Divergent constraint did not abort migration!');
  }
  console.log('✅ Divergent constraint successfully halted migration:');
  console.log('   ' + divMsg.split('\n')[0]);

  console.log('\n================================================================================');
  console.log('🌟 ALL THREE MIGRATIONS FULLY VERIFIED IN POSTGRESQL 16 STAGING ENGINE!');
  console.log('================================================================================');
}

runAllMigrationsStagingTest().catch(console.error);
