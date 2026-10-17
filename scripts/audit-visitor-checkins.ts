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

async function auditVisitorCheckins() {
  const { supabaseAdmin } = await import('../src/lib/supabase-admin');
  console.log('=== AUDITING VISITOR CHECK-IN DATA (READ-ONLY) ===\n');

  // 1. visitor_visits (Rathayatra)
  const { data: vvData, error: vvErr, count: vvCount } = await supabaseAdmin
    .from('visitor_visits')
    .select('*', { count: 'exact' });

  if (vvErr) {
    console.error('Error fetching visitor_visits:', vvErr);
  } else {
    console.log(`1. TABLE: visitor_visits`);
    console.log(`   Total records: ${vvCount ?? vvData?.length ?? 0}`);
    if (vvData && vvData.length > 0) {
      const dates = vvData.map(r => new Date(r.visited_at).getTime()).filter(t => !isNaN(t));
      const minDate = new Date(Math.min(...dates)).toISOString();
      const maxDate = new Date(Math.max(...dates)).toISOString();
      console.log(`   Date range: ${minDate} to ${maxDate}`);
      console.log(`   Sample records:`, vvData.slice(0, 3));
    } else {
      console.log(`   (No records found)`);
    }
  }

  // 2. krishnashtami_visitor_visits (Krishnashtami)
  const { data: kvvData, error: kvvErr, count: kvvCount } = await supabaseAdmin
    .from('krishnashtami_visitor_visits')
    .select('*', { count: 'exact' });

  if (kvvErr) {
    console.error('Error fetching krishnashtami_visitor_visits:', kvvErr);
  } else {
    console.log(`\n2. TABLE: krishnashtami_visitor_visits`);
    console.log(`   Total records: ${kvvCount ?? kvvData?.length ?? 0}`);
    if (kvvData && kvvData.length > 0) {
      const dates = kvvData.map(r => new Date(r.visited_at).getTime()).filter(t => !isNaN(t));
      const minDate = new Date(Math.min(...dates)).toISOString();
      const maxDate = new Date(Math.max(...dates)).toISOString();
      console.log(`   Date range: ${minDate} to ${maxDate}`);
      console.log(`   Sample records:`, kvvData.slice(0, 3));
    } else {
      console.log(`   (No records found)`);
    }
  }

  // 3. Audit logs related to visitor check-in
  const { data: alData, error: alErr, count: alCount } = await supabaseAdmin
    .from('audit_logs')
    .select('id, action, created_at', { count: 'exact' })
    .ilike('action', '%VISITOR%');

  if (alErr) {
    console.warn('Audit logs check:', alErr.message);
  } else {
    console.log(`\n3. AUDIT LOGS (action ILIKE '%VISITOR%'):`);
    console.log(`   Total records: ${alCount ?? alData?.length ?? 0}`);
  }

  // 4. Check if registrations table has any visited flag or column
  const { data: regSample } = await supabaseAdmin.from('registrations').select('*').limit(1);
  if (regSample && regSample[0]) {
    const keys = Object.keys(regSample[0]);
    const visitKeys = keys.filter(k => k.toLowerCase().includes('visit'));
    console.log(`\n4. REGISTRATIONS visit-related columns:`, visitKeys);
  }
}

auditVisitorCheckins().catch(console.error);
