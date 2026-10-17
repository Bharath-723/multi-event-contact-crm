import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      process.env[key] = value.trim();
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

function calculateStats(samples: number[]): { median: number; p95: number; min: number; max: number } {
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  const p95 = sorted[p95Index];
  return {
    median: Math.round(median * 100) / 100,
    p95: Math.round(p95 * 100) / 100,
    min: Math.round(sorted[0] * 100) / 100,
    max: Math.round(sorted[sorted.length - 1] * 100) / 100,
  };
}

async function runBenchmark() {
  console.log('================================================================================');
  console.log('       HKM ADMIN PORTAL: READ-ONLY LATENCY & PERFORMANCE BENCHMARK');
  console.log('================================================================================\n');

  const iterations = 10;
  console.log(`Running ${iterations} iterations per workload to calculate Median & P95 latencies...\n`);

  const results: Array<{ workload: string; median: number; p95: number; min: number; max: number }> = [];

  // Workload 1: Master Dashboard Paginated Query (Page 1, 25 records with exact count)
  {
    const times: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const t0 = performance.now();
      await supabaseAdmin
        .from('master_contacts')
        .select('id, phone, name, age, gender, area_of_stay, company_college, chanting, classes_attended, level, created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(0, 24);
      times.push(performance.now() - t0);
    }
    const stats = calculateStats(times);
    results.push({ workload: 'Master Dashboard Page 1 (25 records)', ...stats });
  }

  // Workload 2: Master Dashboard Filtered Query (Gender=Male, Search term)
  {
    const times: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const t0 = performance.now();
      await supabaseAdmin
        .from('master_contacts')
        .select('id, phone, name, age, gender, area_of_stay, company_college, chanting, classes_attended, level, created_at', { count: 'exact' })
        .ilike('gender', 'Male')
        .ilike('area_of_stay', '%Kokapet%')
        .order('created_at', { ascending: false })
        .range(0, 24);
      times.push(performance.now() - t0);
    }
    const stats = calculateStats(times);
    results.push({ workload: 'Master Dashboard Filtered (Male + Kokapet)', ...stats });
  }

  // Workload 3: Contact Operators Active Workload Query
  {
    const times: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const t0 = performance.now();
      const [opsRes, assignRes] = await Promise.all([
        supabaseAdmin.from('contact_operators').select('id, name, is_active, operator_type').eq('is_active', true),
        supabaseAdmin.from('master_contact_assignments').select('id, operator_id, status').eq('is_active', true),
      ]);
      times.push(performance.now() - t0);
    }
    const stats = calculateStats(times);
    results.push({ workload: 'Contact Operators (Parallel Operators + Assignments)', ...stats });
  }

  // Workload 4: Contacts Register Paginated Query
  {
    const times: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const t0 = performance.now();
      await supabaseAdmin
        .from('contacts_register')
        .select('id, full_name, phone, profession, current_stay, created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(0, 24);
      times.push(performance.now() - t0);
    }
    const stats = calculateStats(times);
    results.push({ workload: 'Contacts Register (25 records + total count)', ...stats });
  }

  // Workload 5: Saturday Meetup Check-in Lookups
  {
    const times: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const t0 = performance.now();
      await supabaseAdmin
        .from('master_contacts')
        .select('id, phone, name, classes_attended, level')
        .order('created_at', { ascending: false })
        .limit(50);
      times.push(performance.now() - t0);
    }
    const stats = calculateStats(times);
    results.push({ workload: 'Saturday Meetup Candidate Lookup (50 items)', ...stats });
  }

  // Workload 6: Visitor Lookup by Phone
  {
    const times: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const t0 = performance.now();
      await supabaseAdmin
        .from('master_contacts')
        .select('id, phone, name, classes_attended, level')
        .ilike('phone', '%98765%')
        .limit(5);
      times.push(performance.now() - t0);
    }
    const stats = calculateStats(times);
    results.push({ workload: 'Visitor Partial Phone Search (Indexed lookup)', ...stats });
  }

  // Print Table
  console.log('| Workload / Endpoint | Median (ms) | P95 (ms) | Min (ms) | Max (ms) | Status |');
  console.log('|---|---|---|---|---|---|');
  for (const r of results) {
    const status = r.median < 300 ? 'EXCELLENT (<300ms)' : r.median < 800 ? 'GOOD (<800ms)' : 'FAIR';
    console.log(`| ${r.workload} | ${r.median} ms | ${r.p95} ms | ${r.min} ms | ${r.max} ms | ${status} |`);
  }

  console.log('\n================================================================================');
  console.log('       BENCHMARK COMPLETE');
  console.log('================================================================================');
}

runBenchmark().catch(console.error);
