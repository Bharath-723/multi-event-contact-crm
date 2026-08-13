/**
 * Phase 0 — Exact Count Audit via Supabase REST (HEAD method)
 */
const https = require('https');

const SUPABASE_URL = 'https://nmnizrkgdypylgllrfui.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tbml6cmtnZHlweWxnbGxyZnVpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjQ1NDYxMCwiZXhwIjoyMDk4MDMwNjEwfQ.jpaZHrH_aioInEvPFltAZqZYOcu0IgepKQk8aYRxJdE';

function headCount(table, filter = '') {
  return new Promise((resolve, reject) => {
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
    req.on('error', reject);
    req.end();
  });
}

function getRows(table, select, filter = '', order = '') {
  return new Promise((resolve, reject) => {
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
    req.on('error', reject);
    req.end();
  });
}

async function audit() {
  console.log('=== PHASE 0 — EXACT BASELINE COUNTS ===\n');

  const tables = [
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

  console.log('--- EXACT ROW COUNTS ---');
  const baseline = {};
  for (const t of tables) {
    const cnt = await headCount(t);
    baseline[t] = cnt;
    console.log(`  ${t}: ${cnt}`);
  }

  // Detailed breakdown
  console.log('\n--- CONTACT ASSIGNMENTS BREAKDOWN ---');
  const activeCA = await headCount('contact_assignments', '&is_active=eq.true');
  const inactiveCA = await headCount('contact_assignments', '&is_active=eq.false');
  console.log(`  Active (is_active=true): ${activeCA}`);
  console.log(`  Archived (is_active=false): ${inactiveCA}`);
  console.log(`  Total: ${activeCA + inactiveCA}`);

  // Volunteer slots with full detail
  console.log('\n--- VOLUNTEER SLOTS (FULL LIST) ---');
  const slots = await getRows('volunteer_slots', 'slot_time,display_order', '', '&order=display_order');
  if (Array.isArray(slots.data)) {
    slots.data.forEach(s => console.log(`  [order=${s.display_order}] "${s.slot_time}"`));
    console.log(`  TOTAL: ${slots.data.length}`);
  }

  // Services with full detail
  console.log('\n--- SERVICES (FULL LIST) ---');
  const svcs = await getRows('services', 'name,is_active', '', '&order=name');
  if (Array.isArray(svcs.data)) {
    svcs.data.forEach(s => console.log(`  [${s.is_active ? 'ACTIVE' : 'INACTIVE'}] "${s.name}"`));
    console.log(`  TOTAL: ${svcs.data.length}`);
  }

  // Sample registration (to see columns)
  console.log('\n--- REGISTRATION SAMPLE COLUMNS ---');
  const regSample = await getRows('registrations', '*', '', '&limit=1');
  if (Array.isArray(regSample.data) && regSample.data.length > 0) {
    const cols = Object.keys(regSample.data[0]);
    console.log(`  Columns: ${cols.join(', ')}`);
    console.log(`  festival_event_id present: ${cols.includes('festival_event_id')}`);
  } else {
    console.log('  No registrations to sample, or table empty');
  }

  // Check for duplicate phones
  console.log('\n--- REGISTRATIONS: DISTINCT PHONE COUNT ---');
  const phoneCnt = await headCount('registrations');
  console.log(`  Total registrations: ${phoneCnt}`);
  const regAll = await getRows('registrations', 'phone', '', '');
  if (Array.isArray(regAll.data)) {
    const phones = regAll.data.map(r => r.phone);
    const unique = new Set(phones);
    console.log(`  Unique phones: ${unique.size}`);
    if (phones.length !== unique.size) {
      console.log('  ⚠️  DUPLICATE PHONES EXIST — must handle before constraint change');
    } else {
      console.log('  ✅ No duplicate phones');
    }
  }

  console.log('\n=== BASELINE COMPLETE ===');
  console.log('\nFINAL BASELINE (copy for post-migration comparison):');
  Object.entries(baseline).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
}

audit().catch(console.error);
