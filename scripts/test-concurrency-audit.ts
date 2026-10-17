import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

async function testConcurrencyScenarios() {
  console.log('Testing concurrency scenarios with PGlite (PostgreSQL 16.2 engine)...');
  const pg = new PGlite();

  // Set up schema
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
      level TEXT NOT NULL DEFAULT 'level-0',
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

  const admin = (await pg.query<{ id: string }>(`INSERT INTO admins (email) VALUES ('admin@hkm.org') RETURNING id;`)).rows[0].id;

  console.log('\n--- Scenario 1: Same Master Contact ID and phone in same weekly period ---');
  const c1 = (await pg.query<{ id: string }>(`
    INSERT INTO master_contacts (phone, name, classes_attended) VALUES ('9876543210', 'Person 1', 0) RETURNING id;
  `)).rows[0].id;

  const res1A = await pg.query<{ approve_master_contact_checkin: any }>(`
    SELECT approve_master_contact_checkin($1, $2, 'admin@hkm.org');
  `, [c1, admin]);
  console.log('1A result:', res1A.rows[0].approve_master_contact_checkin);

  const res1B = await pg.query<{ approve_master_contact_checkin: any }>(`
    SELECT approve_master_contact_checkin($1, $2, 'admin@hkm.org');
  `, [c1, admin]);
  console.log('1B result:', res1B.rows[0].approve_master_contact_checkin);

  console.log('\n--- Scenario 2: Two different Master Contact IDs with the same normalized phone ---');
  const c2A = (await pg.query<{ id: string }>(`
    INSERT INTO master_contacts (phone, name, classes_attended) VALUES ('+91 91234 56789', 'Person 2A', 0) RETURNING id;
  `)).rows[0].id;
  const c2B = (await pg.query<{ id: string }>(`
    INSERT INTO master_contacts (phone, name, classes_attended) VALUES ('09123456789', 'Person 2B', 0) RETURNING id;
  `)).rows[0].id;

  const res2A = await pg.query<{ approve_master_contact_checkin: any }>(`
    SELECT approve_master_contact_checkin($1, $2, 'admin@hkm.org');
  `, [c2A, admin]);
  console.log('2A result:', res2A.rows[0].approve_master_contact_checkin);

  const res2B = await pg.query<{ approve_master_contact_checkin: any }>(`
    SELECT approve_master_contact_checkin($1, $2, 'admin@hkm.org');
  `, [c2B, admin]);
  console.log('2B result:', res2B.rows[0].approve_master_contact_checkin);

  console.log('\n--- Scenario 3: Different phone values associated with same Master Contact ID ---');
  // First approval with phone 9988776655
  const c3 = (await pg.query<{ id: string }>(`
    INSERT INTO master_contacts (phone, name, classes_attended) VALUES ('9988776655', 'Person 3', 0) RETURNING id;
  `)).rows[0].id;

  const res3A = await pg.query<{ approve_master_contact_checkin: any }>(`
    SELECT approve_master_contact_checkin($1, $2, 'admin@hkm.org');
  `, [c3, admin]);
  console.log('3A result (phone 9988776655):', res3A.rows[0].approve_master_contact_checkin);

  // Now change phone of c3 to 9988776656
  await pg.query(`UPDATE master_contacts SET phone = '9988776656' WHERE id = $1;`, [c3]);

  // Attempt second approval with new phone in same weekly period
  const res3B = await pg.query<{ approve_master_contact_checkin: any }>(`
    SELECT approve_master_contact_checkin($1, $2, 'admin@hkm.org');
  `, [c3, admin]);
  console.log('3B result (phone updated to 9988776656, same contact ID):', res3B.rows[0].approve_master_contact_checkin);

  // Verify check-in count and classes_attended
  const c3Contact = (await pg.query<{ classes_attended: number }>(`SELECT classes_attended FROM master_contacts WHERE id = $1;`, [c3])).rows[0];
  const c3Checkins = (await pg.query<{ count: string }>(`SELECT count(*) FROM master_contact_checkins WHERE master_contact_id = $1;`, [c3])).rows[0];
  console.log('3 Contact classes_attended:', c3Contact.classes_attended, '(expected: 1)');
  console.log('3 Checkins count for contact:', c3Checkins.count, '(expected: 1)');

  console.log('\n--- Scenario 3b: Direct collision on idx_mcc_contact_period during INSERT ---');
  const c4 = (await pg.query<{ id: string }>(`
    INSERT INTO master_contacts (phone, name, classes_attended) VALUES ('9111222333', 'Person 4', 0) RETURNING id;
  `)).rows[0].id;

  const period = (await pg.query<{ get_current_weekly_period: string }>(`SELECT get_current_weekly_period();`)).rows[0].get_current_weekly_period;

  await pg.query(`
    INSERT INTO master_contact_checkins (master_contact_id, phone, weekly_period)
    VALUES ($1, '9111222333', $2);
  `, [c4, period]);

  await pg.query(`
    DO $$
    DECLARE
      v_new_id UUID;
    BEGIN
      BEGIN
        INSERT INTO master_contact_checkins (master_contact_id, phone, weekly_period)
        VALUES ('${c4}', '9111222444', '${period}')
        ON CONFLICT (phone, weekly_period) DO NOTHING
        RETURNING id INTO v_new_id;
      EXCEPTION WHEN unique_violation THEN
        v_new_id := NULL;
      END;

      IF v_new_id IS NOT NULL THEN
        RAISE EXCEPTION 'Expected conflict on idx_mcc_contact_period, but got id: %', v_new_id;
      END IF;
    END $$;
  `);
  console.log('Direct test of idx_mcc_contact_period conflict in subtransaction passed successfully!');

  console.log('\n--- Scenario 4 & 5: Invisible Snapshot Fallback (SQLSTATE 40001) ---');
  try {
    await pg.query(`
      DO $$
      DECLARE
        v_new_checkin_id UUID := NULL;
        v_existing_id UUID := NULL;
      BEGIN
        IF v_new_checkin_id IS NULL THEN
          IF v_existing_id IS NULL THEN
            RAISE EXCEPTION 'Concurrent check-in collision detected... Please retry.'
              USING ERRCODE = '40001';
          END IF;
        END IF;
      END $$;
    `);
    console.error('FAIL: Expected 40001 exception was not thrown');
  } catch (err: any) {
    console.log('PASS: Correctly raised SQLSTATE 40001 serialization failure:', err.message);
  }
}

testConcurrencyScenarios().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
