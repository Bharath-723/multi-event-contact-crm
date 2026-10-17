import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (m) {
      let v = m[2] || '';
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      process.env[m[1]] = v.trim();
    }
  }
}

async function inspectSchema() {
  const { supabaseAdmin } = await import('../src/lib/supabase-admin');
  console.log('=== SCHEMA & DATA INSPECTION ===\n');

  // 1. Check registrations columns & sample
  const { data: regSample } = await supabaseAdmin.from('registrations').select('*').limit(1);
  console.log('1. registrations columns:');
  if (regSample && regSample[0]) {
    console.log(Object.keys(regSample[0]));
    console.log('Has level column?', 'level' in regSample[0]);
  } else {
    console.log('(no rows)');
  }

  // 2. Check krishnashtami_registrations columns
  const { data: krishSample } = await supabaseAdmin.from('krishnashtami_registrations').select('*').limit(1);
  console.log('\n2. krishnashtami_registrations columns:');
  if (krishSample && krishSample[0]) {
    console.log(Object.keys(krishSample[0]));
    console.log('Has level column?', 'level' in krishSample[0]);
  }

  // 3. Check master_contacts columns
  const { data: mcSample } = await supabaseAdmin.from('master_contacts').select('*').limit(1);
  console.log('\n3. master_contacts columns:');
  if (mcSample && mcSample[0]) {
    console.log(Object.keys(mcSample[0]));
    console.log('Has chanting column?', 'chanting' in mcSample[0]);
    console.log('Has level column?', 'level' in mcSample[0]);
  }

  // 4. Check contacts_register columns
  const { data: crSample } = await supabaseAdmin.from('contacts_register').select('*').limit(1);
  console.log('\n4. contacts_register columns:');
  if (crSample && crSample[0]) {
    console.log(Object.keys(crSample[0]));
  }

  // 5. Check festival_events table for supported festivals and years
  const { data: festivals, error: festErr } = await supabaseAdmin
    .from('festival_events')
    .select('*')
    .order('event_year', { ascending: false });
  console.log('\n5. festival_events:');
  if (festErr) {
    console.error('Error fetching festivals:', festErr.message);
  } else {
    console.log(festivals);
  }
}

inspectSchema().catch(console.error);
