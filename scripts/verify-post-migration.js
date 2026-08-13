const https = require('https');

const SUPABASE_URL = 'https://nmnizrkgdypylgllrfui.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tbml6cmtnZHlweWxnbGxyZnVpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjQ1NDYxMCwiZXhwIjoyMDk4MDMwNjEwfQ.jpaZHrH_aioInEvPFltAZqZYOcu0IgepKQk8aYRxJdE';

function headCount(table, filter = '') {
  return new Promise((resolve) => {
    const path = `/rest/v1/${table}?select=*${filter}`;
    const url = new URL(SUPABASE_URL + path);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'HEAD',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Prefer': 'count=exact',
      }
    };
    const req = https.request(options, (res) => {
      res.resume();
      res.on('end', () => {
        const cr = res.headers['content-range'];
        if (cr) {
          const total = parseInt(cr.split('/')[1], 10);
          resolve(isNaN(total) ? -1 : total);
        } else {
          resolve(-1);
        }
      });
    });
    req.on('error', () => resolve(-1));
    req.end();
  });
}

function getRows(table, select, filter = '', order = '') {
  return new Promise((resolve) => {
    const path = `/rest/v1/${table}?select=${encodeURIComponent(select)}${filter}${order}`;
    const url = new URL(SUPABASE_URL + path);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.status || res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data: [] }); }
      });
    });
    req.on('error', () => resolve({ status: 500, data: [] }));
    req.end();
  });
}

async function verifyPostMigration() {
  console.log('=== POST-MIGRATION VERIFICATION AUDIT ===\n');

  const tables = [
    'festival_events',
    'registrations',
    'contact_assignments',
    'visitor_visits',
    'services',
    'volunteer_slots',
    'contact_operators',
    'feedback_contacts',
    'feedback_contact_assignments',
    'audit_logs',
    'notifications',
    'skills',
    'registration_skills',
  ];

  console.log('--- POST-MIGRATION ROW COUNTS ---');
  const postCounts = {};
  for (const t of tables) {
    const cnt = await headCount(t);
    postCounts[t] = cnt;
    console.log(`  ${t}: ${cnt}`);
  }

  // Fetch festival_events
  console.log('\n--- FESTIVAL EVENTS RAW QUERY ---');
  const fe = await getRows('festival_events', '*');
  console.log('  festival_events response:', JSON.stringify(fe));

  // Fetch registrations sample
  console.log('\n--- REGISTRATION SAMPLE ---');
  const regSample = await getRows('registrations', '*', '', '&limit=1');
  if (Array.isArray(regSample.data) && regSample.data.length > 0) {
    console.log('  Registration columns:', Object.keys(regSample.data[0]));
    console.log('  Sample registration festival_event_id:', regSample.data[0].festival_event_id);
  } else {
    console.log('  Registration query result:', JSON.stringify(regSample));
  }

  // Fetch volunteer_slots sample
  console.log('\n--- VOLUNTEER SLOTS SAMPLE ---');
  const slotSample = await getRows('volunteer_slots', '*');
  console.log('  Volunteer slots data:', JSON.stringify(slotSample));

  // Fetch services sample
  console.log('\n--- SERVICES SAMPLE ---');
  const serviceSample = await getRows('services', '*');
  console.log('  Services data:', JSON.stringify(serviceSample));

  console.log('\n=== VERIFICATION FINISHED ===');
}

verifyPostMigration().catch(console.error);
