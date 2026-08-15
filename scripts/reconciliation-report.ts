/**
 * Full reconciliation report for Akhil's 41/40 overflow.
 * Produces:
 *  1. All 41 active assignments with contact details + timestamps
 *  2. Duplicate contact detection (should be 0 by schema)
 *  3. Root-cause timeline trace (oldest vs newest)
 *  4. Recommendation: which record to deactivate
 */
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
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

const AKHIL_OPERATOR_ID = '954aaa39-8e34-4d3d-9ec5-fd9268173bca';
const MAX_CAPACITY = 40;

async function generateReconciliationReport() {
  console.log('=== RECONCILIATION REPORT: AKHIL OVERFLOW (41 / 40) ===\n');

  const { data: assignments, error } = await supabaseAdmin
    .from('contact_assignments')
    .select(`
      id,
      registration_id,
      status,
      is_active,
      assigned_at,
      created_at,
      assigned_by,
      registrations!registration_id (
        full_name,
        phone,
        gender,
        area_of_stay,
        company_college
      )
    `)
    .eq('operator_id', AKHIL_OPERATOR_ID)
    .eq('is_active', true)
    .order('assigned_at', { ascending: true });

  if (error) {
    console.error('ERROR fetching assignments:', error.message);
    return;
  }

  const rows = (assignments as unknown as Record<string, unknown>[]) ?? [];

  console.log(`--- OPERATOR SUMMARY ---`);
  console.log(`Operator Name: Akhil`);
  console.log(`Operator ID:   ${AKHIL_OPERATOR_ID}`);
  console.log(`Source/Festival: Rathayatra 2026 (contact_assignments)`);
  console.log(`Max Capacity:  ${MAX_CAPACITY}`);
  console.log(`Active Count:  ${rows.length} (OVERFLOW = ${rows.length - MAX_CAPACITY})\n`);

  const statusBreakdown: Record<string, number> = {};
  for (const r of rows) {
    const st = String(r.status ?? '');
    statusBreakdown[st] = (statusBreakdown[st] || 0) + 1;
  }
  console.log(`--- STATUS BREAKDOWN ---`);
  for (const [status, count] of Object.entries(statusBreakdown)) {
    console.log(`  ${status}: ${count}`);
  }
  console.log();

  const contactIdFreq: Record<string, number> = {};
  for (const r of rows) {
    const regId = String(r.registration_id ?? '');
    contactIdFreq[regId] = (contactIdFreq[regId] || 0) + 1;
  }
  const duplicates = Object.entries(contactIdFreq).filter(([_, count]) => count > 1);
  if (duplicates.length > 0) {
    console.log(`[WARNING] DUPLICATE CONTACTS DETECTED:`);
    for (const [id, count] of duplicates) {
      const row = rows.find(r => String(r.registration_id) === id);
      const reg = row?.registrations as Record<string, unknown> | null;
      console.log(`  registration_id=${id} appears ${count}x (name: ${reg?.full_name ?? 'N/A'})`);
    }
  } else {
    console.log(`--- DUPLICATE CONTACT CHECK ---`);
    console.log(`✓ No duplicate active assignments per contact. Each contact appears exactly once.\n`);
  }

  console.log(`--- TIMELINE TRACE (oldest 5) ---`);
  rows.slice(0, 5).forEach((r, i) => {
    const reg = r.registrations as Record<string, unknown> | null;
    console.log(`  [${i + 1}] ID=${r.id} | reg_id=${r.registration_id} | name=${String(reg?.full_name ?? 'N/A')} | status=${r.status} | assigned_at=${r.assigned_at} | assigned_by=${r.assigned_by ?? 'N/A'}`);
  });

  console.log(`\n--- TIMELINE TRACE (newest 5) ---`);
  rows.slice(-5).forEach((r, i) => {
    const reg = r.registrations as Record<string, unknown> | null;
    console.log(`  [${rows.length - 4 + i}] ID=${r.id} | reg_id=${r.registration_id} | name=${String(reg?.full_name ?? 'N/A')} | status=${r.status} | assigned_at=${r.assigned_at} | assigned_by=${r.assigned_by ?? 'N/A'}`);
  });

  const overflowRecord = rows[MAX_CAPACITY];

  console.log(`\n--- DETERMINISTIC OVERFLOW RECORD IDENTIFICATION ---`);
  console.log(`Rule: Records are ordered by assigned_at ASC. The first ${MAX_CAPACITY} are valid.`);
  console.log(`Record #${MAX_CAPACITY + 1} (the overflow) is:\n`);
  if (overflowRecord) {
    const reg = overflowRecord.registrations as Record<string, unknown> | null;
    console.log(`  Assignment ID:   ${overflowRecord.id}`);
    console.log(`  Registration ID: ${overflowRecord.registration_id}`);
    console.log(`  Contact Name:    ${String(reg?.full_name ?? 'N/A')}`);
    console.log(`  Contact Phone:   ${String(reg?.phone ?? 'N/A')}`);
    console.log(`  Status:          ${overflowRecord.status}`);
    console.log(`  is_active:       ${overflowRecord.is_active}`);
    console.log(`  assigned_at:     ${overflowRecord.assigned_at}`);
    console.log(`  assigned_by:     ${overflowRecord.assigned_by ?? 'N/A'}`);
    console.log(`  created_at:      ${overflowRecord.created_at}`);
  }

  console.log(`\n--- ROOT CAUSE ANALYSIS ---`);
  const allByAssignedAt = rows.map(r => new Date(String(r.assigned_at)).getTime());
  const minTime = new Date(Math.min(...allByAssignedAt));
  const maxTime = new Date(Math.max(...allByAssignedAt));
  const durationMs = maxTime.getTime() - minTime.getTime();
  const durationMinutes = Math.round(durationMs / 60000);

  console.log(`  Assignment span:       ${minTime.toISOString()} → ${maxTime.toISOString()}`);
  console.log(`  Duration:              ${durationMinutes} minutes`);
  console.log(`  All 41 status values:  ${JSON.stringify(statusBreakdown)}`);
  console.log();

  if (durationMinutes < 60) {
    console.log(`  CONCLUSION: All 41 assignments were created within ${durationMinutes} minutes.`);
    console.log(`  This indicates they were created during a batch Auto Assign session.`);
    console.log(`  The capacity check in assignOperator() computed countMap[op.id] at the START`);
    console.log(`  of the batch loop, without re-validating inside each individual assignOperator() call.`);
    console.log(`  The in-memory countMap[op.id] was incremented by 1 in the loop but`);
    console.log(`  never re-fetched from the DB, so the 41st assignment slipped past the < 40 guard.`);
  } else {
    console.log(`  CONCLUSION: Assignments span ${durationMinutes} minutes (>60 min).`);
    console.log(`  This suggests multiple sessions/manual assignments caused the overflow.`);
    console.log(`  POST /api/assignments (manual) did NOT check operator capacity before inserting.`);
  }

  console.log(`\n--- RECONCILIATION RECOMMENDATION ---`);
  console.log(`ACTION: Set is_active = FALSE for the overflow record ONLY.`);
  console.log(`This preserves all history. The contact will become unassigned and`);
  console.log(`can be reassigned after the capacity guard is hardened.`);
  console.log();
  if (overflowRecord) {
    const reg = overflowRecord.registrations as Record<string, unknown> | null;
    console.log(`TARGET RECORD:`);
    console.log(`  assignment_id   = '${overflowRecord.id}'`);
    console.log(`  registration_id = '${overflowRecord.registration_id}'`);
    console.log(`  contact_name    = '${String(reg?.full_name ?? 'N/A')}'`);
    console.log(`  status          = '${overflowRecord.status}'`);
    console.log(`  assigned_at     = '${overflowRecord.assigned_at}'`);
    console.log();
    console.log(`SQL (do NOT run until hardened capacity guard is in place):`);
    console.log(`UPDATE contact_assignments`);
    console.log(`SET is_active = FALSE,`);
    console.log(`    updated_at = NOW()`);
    console.log(`WHERE id = '${overflowRecord.id}'`);
    console.log(`  AND operator_id = '${AKHIL_OPERATOR_ID}'`);
    console.log(`  AND is_active = TRUE;`);
    console.log();
    console.log(`VERIFY AFTER RECONCILIATION:`);
    console.log(`SELECT COUNT(*) FROM contact_assignments`);
    console.log(`WHERE operator_id = '${AKHIL_OPERATOR_ID}' AND is_active = TRUE;`);
    console.log(`-- Expected: 40`);
  }

  console.log(`\n--- FULL ASSIGNMENT LIST (${rows.length} rows) ---`);
  console.log(`#  | Assignment ID                          | Registration ID                        | Name                    | Status    | assigned_at`);
  console.log(`---|----------------------------------------|----------------------------------------|-------------------------|-----------|----------------------------`);
  rows.forEach((r, i) => {
    const reg = r.registrations as Record<string, unknown> | null;
    const name = String(reg?.full_name ?? 'N/A').slice(0, 23).padEnd(23);
    const marker = i >= MAX_CAPACITY ? ' ← OVERFLOW' : '';
    console.log(`${String(i + 1).padStart(2)} | ${r.id} | ${r.registration_id} | ${name} | ${String(r.status).padEnd(9)} | ${r.assigned_at}${marker}`);
  });

  console.log(`\n=== RECONCILIATION REPORT COMPLETE ===`);
}

generateReconciliationReport().catch(console.error);
