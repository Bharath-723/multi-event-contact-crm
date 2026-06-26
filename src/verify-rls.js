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

async function verifyRLS() {
  console.log('--- STARTING ROW LEVEL SECURITY (RLS) AUDIT ---');
  
  // 1. Test Anonymous Select on registrations table
  console.log('\n1. Testing Anonymous Read on registrations...');
  const { data: anonRead, error: anonReadErr } = await anonClient
    .from('registrations')
    .select('*');
    
  if (anonReadErr) {
    console.log('✅ Anonymous read blocked or failed as expected:', anonReadErr.message);
  } else if (!anonRead || anonRead.length === 0) {
    console.log('✅ Anonymous read returned 0 rows (RLS policy active and protecting data).');
  } else {
    console.log('❌ SECURITY WARNING: Anonymous read returned data! RLS might be misconfigured.');
    console.log('Returned data size:', anonRead.length);
  }

  // 2. Test Anonymous Insert on registrations table
  console.log('\n2. Testing Anonymous Insert on registrations...');
  const testPhone = '9999999999';
  
  // Cleanup any old test registrations first
  await serviceClient.from('registrations').delete().eq('phone', testPhone);

  const { error: anonInsertErr } = await anonClient
    .from('registrations')
    .insert({
      full_name: 'Test Anonymous User',
      phone: testPhone,
      age: 25,
      gender: 'Male',
      area_of_stay: 'Malleshwaram',
      company_college: 'Test College',
      interested_to_volunteer: false,
      interested_to_dinner: true,
      wants_to_donate: false,
      donation_status: 'Pending'
    });

  if (anonInsertErr) {
    console.log('❌ Anonymous insert failed:', anonInsertErr.message);
  } else {
    console.log('✅ Anonymous insert succeeded without returning rows (as expected by RLS)!');
  }

  // 3. Test Admin Select using Service Role Key
  console.log('\n3. Testing Admin Read (bypassing RLS or as Admin) on registrations...');
  const { data: adminRead, error: adminReadErr } = await serviceClient
    .from('registrations')
    .select('*')
    .eq('phone', testPhone);

  if (adminReadErr) {
    console.log('❌ Admin read failed:', adminReadErr.message);
  } else if (adminRead && adminRead.length > 0) {
    console.log('✅ Admin read successfully fetched the anonymous insert! Name:', adminRead[0].full_name);
  } else {
    console.log('❌ Admin read could not find the inserted test record.');
  }

  // 4. Clean up test record
  console.log('\n4. Cleaning up test record...');
  const { error: deleteErr } = await serviceClient
    .from('registrations')
    .delete()
    .eq('phone', testPhone);

  if (deleteErr) {
    console.log('❌ Failed to clean up test record:', deleteErr.message);
  } else {
    console.log('✅ Clean up completed successfully.');
  }

  console.log('\n--- RLS AUDIT COMPLETED ---');
}

verifyRLS();
