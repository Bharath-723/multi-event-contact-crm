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

async function verifyRPC() {
  console.log('--- STARTING DATABASE RPC AUDIT ---');
  
  // 1. Fetch available skills and volunteer slots
  console.log('Fetching skills and slots to get valid IDs...');
  const { data: skills, error: skillsErr } = await anonClient.from('skills').select('*').limit(2);
  const { data: slots, error: slotsErr } = await anonClient.from('volunteer_slots').select('*').limit(1);

  if (skillsErr || slotsErr) {
    console.error('❌ Failed to fetch pre-populated skills or slots:', skillsErr || slotsErr);
    return;
  }

  const skillIds = skills.map(s => s.id);
  const slotId = slots[0]?.id;
  
  console.log('Valid Skill IDs:', skillIds);
  console.log('Valid Slot ID:', slotId);

  // 2. Generate a random phone number to prevent duplicate errors
  const testPhone = Math.floor(1000000000 + Math.random() * 9000000000).toString();
  console.log('\n2. Testing register_volunteer RPC with Phone:', testPhone);

  const { data: registrationId, error: rpcErr } = await anonClient.rpc('register_volunteer', {
    p_full_name: 'RPC Verification User',
    p_phone: testPhone,
    p_age: 30,
    p_gender: 'Male',
    p_area_of_stay: 'Hebbal',
    p_company_college: 'RPC Tech Corp',
    p_pg_name: 'Noble PG',
    p_interested_to_volunteer: true,
    p_volunteer_slot_id: slotId || null,
    p_interested_to_dinner: true,
    p_wants_to_donate: false,
    p_donation_status: 'Pending',
    p_skill_ids: skillIds
  });

  if (rpcErr) {
    console.error('❌ RPC call failed:', rpcErr.message);
    console.error(rpcErr);
  } else {
    console.log('✅ RPC call succeeded! Registration ID created:', registrationId);

    // Verify it was correctly stored and the triggers ran
    console.log('\n3. Verifying record details and notifications...');
    const { data: checkReg, error: checkRegErr } = await serviceClient
      .from('registrations')
      .select('*, volunteer_slots(*)')
      .eq('id', registrationId)
      .single();

    if (checkRegErr) {
      console.error('❌ Failed to fetch created registration via admin client:', checkRegErr.message);
    } else {
      console.log('✅ Registration record details verified:');
      console.log('   Name:', checkReg.full_name);
      console.log('   Phone:', checkReg.phone);
      console.log('   Slot time:', checkReg.volunteer_slots?.slot_time);
    }

    // Verify unread notification trigger
    const { data: checkNotif, error: checkNotifErr } = await serviceClient
      .from('notifications')
      .select('*')
      .eq('registration_id', registrationId);

    if (checkNotifErr) {
      console.error('❌ Failed to fetch notifications for registration:', checkNotifErr.message);
    } else if (checkNotif && checkNotif.length > 0) {
      console.log('✅ Notification trigger verified! Unread notification row exists:');
      console.log('   Notification ID:', checkNotif[0].id);
      console.log('   Is Read:', checkNotif[0].is_read);
    } else {
      console.error('❌ Trigger warning: No notification row was created automatically.');
    }

    // Clean up test records
    console.log('\n4. Cleaning up created registration record...');
    const { error: deleteErr } = await serviceClient
      .from('registrations')
      .delete()
      .eq('id', registrationId);

    if (deleteErr) {
      console.error('❌ Cleanup failed:', deleteErr.message);
    } else {
      console.log('✅ Cleanup completed successfully.');
    }
  }

  console.log('\n--- RPC AUDIT COMPLETED ---');
}

verifyRPC();
