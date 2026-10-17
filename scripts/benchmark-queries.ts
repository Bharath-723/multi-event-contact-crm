import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.join(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env: Record<string, string> = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] ? match[2].trim() : '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    env[match[1]] = value;
  }
});

const supabaseAdmin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function benchmark() {
  console.log('================================================================================');
  console.log('        HKM ADMIN PORTAL: PERFORMANCE BENCHMARKING (ACTUAL DB METRICS)');
  console.log('================================================================================\n');

  // Baseline simulated old query: full scan 1000 items (old loop fetched 1000 at a time up to 50k)
  const t0 = performance.now();
  const { data: allData, count: fullCount, error: errOld } = await supabaseAdmin
    .from('master_contacts')
    .select('id, phone, name, age, gender, area_of_stay, company_college, chanting, classes_attended, level, created_at', { count: 'exact' })
    .range(0, 999);
  const t1 = performance.now();
  if (errOld) console.error('errOld:', errOld);
  console.log(`[Baseline 1st Batch of 1000] Time: ${(t1 - t0).toFixed(2)}ms | Records fetched: ${allData?.length} | Total count in DB: ${fullCount}`);

  // Optimized query: exact page range 0..24 (25 records)
  const t2 = performance.now();
  const { data: pageData, count: optimizedCount, error: errOpt } = await supabaseAdmin
    .from('master_contacts')
    .select('id, phone, name, age, gender, area_of_stay, company_college, chanting, classes_attended, level, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(0, 24);
  const t3 = performance.now();
  if (errOpt) console.error('errOpt:', errOpt);
  console.log(`[Optimized Page 1 (25 records)] Time: ${(t3 - t2).toFixed(2)}ms | Records fetched: ${pageData?.length} | Total: ${optimizedCount}`);

  // Page 2
  const t4 = performance.now();
  const { data: page2Data, error: errPage2 } = await supabaseAdmin
    .from('master_contacts')
    .select('id, phone, name, age, gender, area_of_stay, company_college, chanting, classes_attended, level, created_at')
    .order('created_at', { ascending: false })
    .range(25, 49);
  const t5 = performance.now();
  if (errPage2) console.error('errPage2:', errPage2);
  console.log(`[Optimized Page 2 (25 records)] Time: ${(t5 - t4).toFixed(2)}ms | Records fetched: ${page2Data?.length}`);

  // Filter query: by gender and search
  const tF0 = performance.now();
  const { data: filteredData, count: filteredCount } = await supabaseAdmin
    .from('master_contacts')
    .select('id, phone, name, age, gender, area_of_stay, company_college, chanting, classes_attended, level, created_at', { count: 'exact' })
    .ilike('gender', 'Male')
    .or('name.ilike.%test%,phone.ilike.%test%')
    .order('created_at', { ascending: false })
    .range(0, 24);
  const tF1 = performance.now();
  console.log(`[Optimized Filtered Search (25 records)] Time: ${(tF1 - tF0).toFixed(2)}ms | Records fetched: ${filteredData?.length} | Total matches: ${filteredCount}`);

  // Chanting atomic increment response time
  console.log('\n--- Benchmarking Chanting Counter Atomic Operation ---');
  if (pageData && pageData.length > 0) {
    const testContact = pageData[0];
    const currentChant = testContact.chanting || 0;
    const tc0 = performance.now();
    const { data: updatedContact, error: chantErr } = await supabaseAdmin
      .from('master_contacts')
      .update({ chanting: currentChant + 1 })
      .eq('id', testContact.id)
      .select('id, chanting')
      .single();
    const tc1 = performance.now();
    if (chantErr) console.error('chantErr:', chantErr);
    console.log(`[Chant Count Increment] Time: ${(tc1 - tc0).toFixed(2)}ms | New count: ${updatedContact?.chanting}`);

    // Revert back so we do not pollute data
    await supabaseAdmin.from('master_contacts').update({ chanting: currentChant }).eq('id', testContact.id);
    console.log(`[Reverted Chant Count back to ${currentChant}]`);
  }

  // Auto assign dry-run candidates fetch
  console.log('\n--- Benchmarking Auto-Assign Dry Run Candidates Fetch ---');
  const ta0 = performance.now();
  const { data: candidates, error: cErr } = await supabaseAdmin
    .from('master_contacts')
    .select('id, name, phone, area_of_stay, gender, company_college, chanting, classes_attended, level, created_at')
    .eq('gender', 'Male')
    .order('created_at', { ascending: true })
    .limit(500);
  const ta1 = performance.now();
  if (cErr) console.error('cErr:', cErr);
  console.log(`[Auto-Assign Male Candidates Fetch (up to 500)] Time: ${(ta1 - ta0).toFixed(2)}ms | Found: ${candidates?.length}`);

  // Saturday meet-up parallel fetch
  console.log('\n--- Benchmarking Saturday Meet-up Parallel Queries ---');
  const ts0 = performance.now();
  const [aRes, cRes] = await Promise.all([
    supabaseAdmin.from('master_contact_assignments').select('id, master_contact_id, assigned_to_user_id, contact_source, created_at').eq('contact_source', 'master_dashboard').limit(200),
    supabaseAdmin.from('master_contact_checkins').select('id, master_contact_id, weekly_period, checked_in_by, created_at').limit(200),
  ]);
  const ts1 = performance.now();
  console.log(`[Saturday Meet-up Parallel Fetch] Time: ${(ts1 - ts0).toFixed(2)}ms | Assignments: ${aRes.data?.length}, Checkins: ${cRes.data?.length}`);
}

benchmark().catch(console.error);
