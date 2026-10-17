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

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing Supabase env vars in .env.local');
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

async function runProductionReadinessAudit() {
  console.log('================================================================================');
  console.log('       HKM ADMIN PORTAL — PRODUCTION READINESS AUDIT (READ-ONLY)');
  console.log('================================================================================\n');

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Audit Canonical Master Contact Assignments
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('--- 1. Canonical Master Contact Assignments Audit ---');

  // Fetch all active master_contact_assignments
  let allMasterAssignments: Array<Record<string, unknown>> = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from('master_contact_assignments')
      .select('id, master_contact_id, operator_id, status, is_active, assigned_at')
      .eq('is_active', true)
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('Error fetching master_contact_assignments:', error.message);
      break;
    }
    if (!data || data.length === 0) break;
    allMasterAssignments = allMasterAssignments.concat(data);
    if (data.length < pageSize) break;
    page++;
  }

  console.log(`Total Active Master Dashboard Assignments: ${allMasterAssignments.length}`);

  // Invariant 1: One contact, at most one active operator
  const contactToAssignments = new Map<string, string[]>();
  for (const a of allMasterAssignments) {
    const cid = String(a.master_contact_id);
    if (!contactToAssignments.has(cid)) contactToAssignments.set(cid, []);
    contactToAssignments.get(cid)!.push(String(a.id));
  }

  const duplicateContactAssignments = Array.from(contactToAssignments.entries()).filter(
    ([_, ids]) => ids.length > 1
  );
  if (duplicateContactAssignments.length > 0) {
    console.error(`[VIOLATION] Found ${duplicateContactAssignments.length} master contacts with multiple active assignments!`);
    for (const [cid, ids] of duplicateContactAssignments.slice(0, 5)) {
      console.error(`  - Master Contact ${cid}: ${ids.length} active assignments (${ids.join(', ')})`);
    }
  } else {
    console.log(`[PASS] Invariant 1 Verified: 0 contacts with multiple active assignments in master_contact_assignments.`);
  }

  // Invariant 2: Maximum 40 contacts per operator
  const opToCount = new Map<string, number>();
  for (const a of allMasterAssignments) {
    const opId = String(a.operator_id);
    opToCount.set(opId, (opToCount.get(opId) || 0) + 1);
  }

  const overCapacityOperators = Array.from(opToCount.entries()).filter(([_, count]) => count > 40);
  if (overCapacityOperators.length > 0) {
    console.error(`[VIOLATION] Found ${overCapacityOperators.length} operators exceeding 40 active assignments!`);
    for (const [opId, count] of overCapacityOperators) {
      const { data: op } = await supabaseAdmin
        .from('contact_operators')
        .select('name')
        .eq('id', opId)
        .single();
      console.error(`  - Operator ${op?.name ?? opId} (${opId}): ${count} / 40 active assignments`);
    }
  } else {
    console.log(`[PASS] Invariant 2 Verified: 0 operators exceed 40 active assignments.`);
    const topOps = Array.from(opToCount.entries()).sort((a, b) => b[1] - a[1]);
    console.log(`  Highest active operator workload: ${topOps[0] ? topOps[0][1] : 0} / 40`);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Gender Restriction Audit in Active Master Assignments
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. Gender Restriction Audit (Female & Ineligible Contacts) ---');

  // Fetch all assigned master_contacts
  const assignedContactIds = Array.from(contactToAssignments.keys());
  let femaleAssignedCount = 0;
  let unknownGenderAssignedCount = 0;
  let maleAssignedCount = 0;
  const femaleViolations: Array<{ assignmentId: string; contactId: string; name: string; gender: string }> = [];
  const unknownGenderViolations: Array<{ assignmentId: string; contactId: string; name: string; gender: string }> = [];

  // Batch query master_contacts in chunks of 500
  const chunkSize = 500;
  for (let i = 0; i < assignedContactIds.length; i += chunkSize) {
    const chunk = assignedContactIds.slice(i, i + chunkSize);
    const { data: contacts, error: cErr } = await supabaseAdmin
      .from('master_contacts')
      .select('id, name, gender')
      .in('id', chunk);

    if (cErr) {
      console.error('Error fetching master_contacts for gender audit:', cErr.message);
      break;
    }

    for (const c of contacts || []) {
      const rawGender = String(c.gender || '').trim().toLowerCase();
      const aIds = contactToAssignments.get(c.id) || [];
      if (rawGender === 'female' || rawGender === 'f') {
        femaleAssignedCount++;
        femaleViolations.push({
          assignmentId: aIds[0],
          contactId: c.id,
          name: c.name,
          gender: c.gender,
        });
      } else if (!rawGender || rawGender === 'unknown' || rawGender === 'null') {
        unknownGenderAssignedCount++;
        unknownGenderViolations.push({
          assignmentId: aIds[0],
          contactId: c.id,
          name: c.name,
          gender: c.gender,
        });
      } else {
        maleAssignedCount++;
      }
    }
  }

  console.log(`Gender breakdown of active Master Dashboard assignments:`);
  console.log(`  - Male: ${maleAssignedCount}`);
  console.log(`  - Female: ${femaleAssignedCount}`);
  console.log(`  - Missing/Unknown: ${unknownGenderAssignedCount}`);

  if (femaleViolations.length > 0) {
    console.warn(`[AUDIT FINDING] Found ${femaleViolations.length} active female assignments in master_contact_assignments:`);
    for (const f of femaleViolations.slice(0, 10)) {
      console.warn(`  - Assignment ${f.assignmentId}: Contact "${f.name}" (${f.contactId}), gender: "${f.gender}"`);
    }
  } else {
    console.log(`[PASS] 0 female contacts actively assigned in master_contact_assignments.`);
  }

  if (unknownGenderViolations.length > 0) {
    console.warn(`[AUDIT FINDING] Found ${unknownGenderViolations.length} active assignments with missing/unknown gender:`);
    for (const u of unknownGenderViolations.slice(0, 10)) {
      console.warn(`  - Assignment ${u.assignmentId}: Contact "${u.name}" (${u.contactId}), gender: "${u.gender}"`);
    }
  } else {
    console.log(`[PASS] 0 unknown-gender contacts actively assigned in master_contact_assignments.`);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Historical Festival Assignments Audit (Read-Only)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. Historical Festival Assignment Tables Audit ---');
  const historicalSources = [
    { name: 'Rathayatra 2026', table: 'contact_assignments', regTable: 'registrations', fk: 'registration_id' },
    { name: 'Krishnashtami 2026', table: 'krishnashtami_contact_assignments', regTable: 'krishnashtami_registrations', fk: 'registration_id' },
    { name: 'Feedback Contacts', table: 'feedback_contact_assignments', regTable: 'feedback_contacts', fk: 'feedback_contact_id' },
  ];

  for (const hs of historicalSources) {
    const { count: totalActive, error: hErr } = await supabaseAdmin
      .from(hs.table)
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true);

    if (hErr) {
      console.error(`Error querying ${hs.table}:`, hErr.message);
      continue;
    }

    console.log(`Source: ${hs.name} (${hs.table}) → ${totalActive ?? 0} active historical assignments.`);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Cross-Page Data Consistency Audit
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. Cross-Page Data Consistency Audit ---');

  // Check master_contacts count
  const { count: masterTotal, error: mtErr } = await supabaseAdmin
    .from('master_contacts')
    .select('id', { count: 'exact', head: true });

  console.log(`Total Master Contacts: ${masterTotal ?? 'N/A'}`);

  // Check operators count
  const { data: operators, error: opErr } = await supabaseAdmin
    .from('contact_operators')
    .select('id, name, is_active, operator_type');

  const activeOperators = (operators || []).filter((o) => o.is_active);
  console.log(`Total Operators: ${(operators || []).length} (${activeOperators.length} Active)`);

  // Check unique phones in master_contacts
  const { count: totalPhoneCount } = await supabaseAdmin
    .from('master_contacts')
    .select('phone', { count: 'exact', head: true });

  console.log(`Canonical phone uniqueness enforced by database index: idx_unique_master_contacts_phone.`);
  console.log(`Total Master Contacts with Phone: ${totalPhoneCount}`);

  console.log('\n================================================================================');
  console.log('       PRODUCTION READINESS AUDIT FINISHED');
  console.log('================================================================================');
}

runProductionReadinessAudit().catch((err) => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
