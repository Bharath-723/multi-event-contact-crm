import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

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

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing Supabase env vars');
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

async function runAudit() {
  console.log('=== STARTING DATABASE ASSIGNMENT AUDIT ===\n');

  const sources = [
    { name: 'Rathayatra 2026', table: 'contact_assignments', fk: 'registration_id' },
    { name: 'Krishnashtami 2026', table: 'krishnashtami_contact_assignments', fk: 'registration_id' },
    { name: 'Feedback Contacts', table: 'feedback_contact_assignments', fk: 'feedback_contact_id' },
  ];

  for (const s of sources) {
    console.log(`--- Auditing Source: ${s.name} (${s.table}) ---`);

    const { data: activeAssignments, error: aErr } = await supabaseAdmin
      .from(s.table)
      .select('id, operator_id, status, is_active, created_at')
      .eq('is_active', true);

    if (aErr) {
      console.error(`Error fetching active assignments from ${s.table}:`, aErr.message);
      continue;
    }

    const rows = (activeAssignments as unknown as Record<string, unknown>[]) ?? [];
    console.log(`Total Active Assignments: ${rows.length}`);

    const contactCountMap: Record<string, string[]> = {};
    for (const r of rows) {
      const contactId = String(r[s.fk] ?? '');
      if (!contactCountMap[contactId]) contactCountMap[contactId] = [];
      contactCountMap[contactId].push(String(r.id));
    }

    const duplicateContacts = Object.entries(contactCountMap).filter(([_, ids]) => ids.length > 1);
    if (duplicateContacts.length > 0) {
      console.warn(`[WARNING] Found ${duplicateContacts.length} contacts with MULTIPLE ACTIVE ASSIGNMENTS in ${s.table}:`);
      for (const [cId, ids] of duplicateContacts) {
        console.warn(`  - Contact ${cId}: ${ids.length} active assignments (${ids.join(', ')})`);
      }
    } else {
      console.log(`✓ 0 duplicate active assignments found per contact in ${s.table}.`);
    }

    const opCountMap: Record<string, number> = {};
    for (const r of rows) {
      const opId = String(r.operator_id ?? '');
      if (opId) {
        opCountMap[opId] = (opCountMap[opId] ?? 0) + 1;
      }
    }

    const overCapacityOps = Object.entries(opCountMap).filter(([_, count]) => count > 40);
    if (overCapacityOps.length > 0) {
      console.warn(`[WARNING] Found ${overCapacityOps.length} operators exceeding 40 active capacity in ${s.table}:`);
      for (const [opId, count] of overCapacityOps) {
        const { data: op } = await supabaseAdmin.from('contact_operators').select('name').eq('id', opId).single();
        console.warn(`  - Operator ${op?.name ?? opId} (${opId}): ${count} / 40 active assignments`);
      }
    } else {
      console.log(`✓ 0 operators exceeding 40 active capacity in ${s.table}.`);
    }

    console.log('\n');
  }

  console.log('=== AUDIT COMPLETE ===');
}

runAudit();
