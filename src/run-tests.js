const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');

const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] ? match[2].trim() : '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    env[match[1]] = value;
  }
});

const anonClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const serviceClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function runTests() {
  console.log('===================================================');
  console.log('      VOLUNTEER REGISTRATION INTEGRATION TESTS     ');
  console.log('===================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passed++;
    } else {
      console.log(`❌ FAIL: ${message}`);
      failed++;
    }
  }

  // 1. Setup - Fetch Valid IDs
  let skillId = '';
  let slotId = '';
  try {
    const { data: skills } = await anonClient.from('skills').select('*').limit(1);
    const { data: slots } = await anonClient.from('volunteer_slots').select('*').limit(1);
    skillId = skills[0]?.id;
    slotId = slots[0]?.id;
  } catch (e) {
    console.error('Setup failed: check Supabase connection.');
    return;
  }

  const testPhone1 = Math.floor(1000000000 + Math.random() * 9000000000).toString();
  const testPhone2 = Math.floor(1000000000 + Math.random() * 9000000000).toString();
  let createdRegId = null;

  // Cleanup pre-existing test phones
  await serviceClient.from('registrations').delete().eq('phone', testPhone1);
  await serviceClient.from('registrations').delete().eq('phone', testPhone2);

  // --- TEST 1: Anonymous Insert Succeeds ---
  console.log('\n--- TEST 1: Anonymous Registration Submission ---');
  try {
    const { data, error } = await anonClient.rpc('register_volunteer', {
      p_full_name: 'Test Runner User One',
      p_phone: testPhone1,
      p_age: 22,
      p_gender: 'Male',
      p_area_of_stay: 'Indiranagar',
      p_company_college: 'Hardening University',
      p_pg_name: 'Vaikuntha PG',
      p_interested_to_volunteer: true,
      p_volunteer_slot_id: slotId || null,
      p_interested_to_dinner: true,
      p_wants_to_donate: true,
      p_donation_status: 'User Opted to Donate',
      p_skill_ids: skillId ? [skillId] : []
    });

    if (!error && data) {
      createdRegId = data;
      assert(true, 'Anonymous user successfully submitted registration via RPC.');
    } else {
      assert(false, `Anonymous user failed to submit registration: ${error?.message}`);
    }
  } catch (e) {
    assert(false, `Unexpected exception in Test 1: ${e.message}`);
  }

  // --- TEST 2: Schema Validation (Age limits constraint check) ---
  console.log('\n--- TEST 2: Schema Constraints (Age Limit Check) ---');
  try {
    const { error } = await anonClient.rpc('register_volunteer', {
      p_full_name: 'Too Young User',
      p_phone: testPhone2,
      p_age: 5, // Invalid age (Must be 10 - 100)
      p_gender: 'Female',
      p_area_of_stay: null,
      p_company_college: 'Elementary School',
      p_pg_name: null,
      p_interested_to_volunteer: false,
      p_volunteer_slot_id: null,
      p_interested_to_dinner: false,
      p_wants_to_donate: false,
      p_donation_status: 'Pending',
      p_skill_ids: []
    });

    if (error && (error.message.includes('chk_age') || error.message.includes('check constraint'))) {
      assert(true, 'Database successfully rejected invalid age < 10 (Check constraint chk_age works).');
    } else {
      assert(false, `Database failed to reject age 5 or returned unexpected error: ${error?.message}`);
    }
  } catch (e) {
    assert(false, `Unexpected exception in Test 2: ${e.message}`);
  }

  // --- TEST 3: Duplicate Phone Prevention ---
  console.log('\n--- TEST 3: Duplicate Phone Registration Prevention ---');
  try {
    const { error } = await anonClient.rpc('register_volunteer', {
      p_full_name: 'Duplicate Phone User',
      p_phone: testPhone1, // Same phone number as Test 1
      p_age: 25,
      p_gender: 'Female',
      p_area_of_stay: null,
      p_company_college: 'Duplicate Corp',
      p_pg_name: null,
      p_interested_to_volunteer: false,
      p_volunteer_slot_id: null,
      p_interested_to_dinner: false,
      p_wants_to_donate: false,
      p_donation_status: 'Pending',
      p_skill_ids: []
    });

    if (error && (error.code === '23505' || error.message.includes('already registered'))) {
      assert(true, 'Database successfully prevented duplicate registration with same phone number.');
    } else {
      assert(false, `Database allowed duplicate phone or returned incorrect error: ${error?.message}`);
    }
  } catch (e) {
    assert(false, `Unexpected exception in Test 3: ${e.message}`);
  }

  // --- TEST 4: Row Level Security Protection ---
  console.log('\n--- TEST 4: Row Level Security Check (RLS) ---');
  try {
    const { data, error } = await anonClient
      .from('registrations')
      .select('*')
      .eq('phone', testPhone1);

    if (error) {
      assert(true, `Anonymous read blocked with error: ${error.message}`);
    } else if (!data || data.length === 0) {
      assert(true, 'Anonymous read returned 0 rows (RLS active).');
    } else {
      assert(false, 'RLS Failure: Anonymous client successfully read registrations details!');
    }
  } catch (e) {
    assert(false, `Unexpected exception in Test 4: ${e.message}`);
  }

  // --- TEST 5: Automatic Notifications Trigger ---
  console.log('\n--- TEST 5: Persistent Notifications Trigger ---');
  try {
    const { data, error } = await serviceClient
      .from('notifications')
      .select('*')
      .eq('registration_id', createdRegId);

    if (!error && data && data.length > 0) {
      assert(true, `Notification created automatically by trigger. ID: ${data[0].id}, Is Read: ${data[0].is_read}`);
    } else {
      assert(false, `Notification row was not created or fetch error: ${error?.message}`);
    }
  } catch (e) {
    assert(false, `Unexpected exception in Test 5: ${e.message}`);
  }

  // --- TEST 6: Admin CRUD Operations ---
  console.log('\n--- TEST 6: Admin CRUD (Update and Delete logging) ---');
  try {
    // A. Update
    const { error: updateErr } = await serviceClient
      .from('registrations')
      .update({ pg_name: 'Modified Hardening Suite PG' })
      .eq('id', createdRegId);

    assert(!updateErr, 'Admin successfully updated registration record details.');

    // B. Audit Log existence for edit
    const { data: auditLogs } = await serviceClient
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);

    const logAction = auditLogs?.[0]?.action;
    assert(logAction === 'EDIT_REGISTRATION', `Audit trigger successfully logged administrative edit action: ${logAction}`);

    // C. Clean up / Delete
    const { error: deleteErr } = await serviceClient
      .from('registrations')
      .delete()
      .eq('id', createdRegId);

    assert(!deleteErr, 'Admin successfully deleted registration record.');
  } catch (e) {
    assert(false, `Unexpected exception in Test 6: ${e.message}`);
  }

  console.log('\n===================================================');
  console.log(`  TEST RESULTS: ${passed} PASSED | ${failed} FAILED  `);
  console.log('===================================================');
  
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
