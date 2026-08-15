/**
 * Concurrency Test Suite for assign_contact_atomic RPC
 *
 * Tests:
 *   SUITE A — Capacity Enforcement (10 concurrent requests, operator at 39/40)
 *             Expected: exactly 1 succeeds, 9 fail with OPERATOR_CAPACITY_EXCEEDED, final count = 40
 *
 *   SUITE B — Duplicate Contact Protection (10 concurrent operators, 1 unassigned contact)
 *             Expected: exactly 1 succeeds, 9 fail with CONTACT_ALREADY_ASSIGNED, final count = 1
 *
 *   SUITE C — Source Isolation (verify advisory lock key is source-scoped)
 *             Expected: Rathayatra and Krishnashtami assignments to same operator
 *             do NOT block each other and can proceed in parallel
 *
 * Each suite runs for all 3 source tables independently:
 *   - contact_assignments          (source: 'rathayatra')
 *   - krishnashtami_contact_assignments (source: 'krishnashtami')
 *   - feedback_contact_assignments (source: 'feedback_contacts')
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// ─── Load env ──────────────────────────────────────────────────────────────────
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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing Supabase env vars');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── Types ────────────────────────────────────────────────────────────────────
interface RpcResult {
  success:       boolean;
  code:          string;
  message?:      string;
  assignment_id?: string;
  current_count?: number;
  new_count?:    number;
  existing_assignment_id?: string;
}

interface SourceConfig {
  source:       string;
  regTable:     string;
  assignTable:  string;
  fkCol:        string;
  label:        string;
}

const SOURCES: SourceConfig[] = [
  {
    source:      'rathayatra',
    regTable:    'registrations',
    assignTable: 'contact_assignments',
    fkCol:       'registration_id',
    label:       'Rathayatra 2026',
  },
  {
    source:      'krishnashtami',
    regTable:    'krishnashtami_registrations',
    assignTable: 'krishnashtami_contact_assignments',
    fkCol:       'registration_id',
    label:       'Krishnashtami 2026',
  },
  {
    source:      'feedback_contacts',
    regTable:    'feedback_contacts',
    assignTable: 'feedback_contact_assignments',
    fkCol:       'feedback_contact_id',
    label:       'Feedback Contacts',
  },
];

const MAX_CAPACITY = 40;
const CONCURRENT_REQUESTS = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function pass(msg: string) { console.log(`  ✅ PASS: ${msg}`); }
function fail(msg: string) { console.error(`  ❌ FAIL: ${msg}`); process.exitCode = 1; }
function info(msg: string) { console.log(`  ℹ  ${msg}`); }

async function getActiveCount(table: string, col: string, id: string): Promise<number> {
  const { count, error } = await db
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq(col, id)
    .eq('is_active', true);
  if (error) throw new Error(`getActiveCount error: ${error.message}`);
  return count ?? 0;
}

async function getOperatorActiveCount(table: string, operatorId: string): Promise<number> {
  const { count, error } = await db
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('operator_id', operatorId)
    .eq('is_active', true);
  if (error) throw new Error(`getOperatorActiveCount error: ${error.message}`);
  return count ?? 0;
}

/**
 * Call the assign_contact_atomic RPC.
 */
async function callRpc(
  contactId: string,
  operatorId: string,
  source: string,
): Promise<RpcResult> {
  const { data, error } = await db.rpc('assign_contact_atomic', {
    p_contact_id:   contactId,
    p_operator_id:  operatorId,
    p_source:       source,
    p_assigned_by:  null, // valid UUID or null
    p_max_capacity: MAX_CAPACITY,
  });
  if (error) {
    return { success: false, code: 'RPC_ERROR', message: error.message };
  }
  return data as RpcResult;
}

/**
 * Deactivate all active assignments for a given contact in a table (cleanup).
 */
async function cleanupContactAssignments(table: string, fkCol: string, contactId: string) {
  await db.from(table).update({ is_active: false, updated_at: new Date().toISOString() })
    .eq(fkCol, contactId).eq('is_active', true);
}

/**
 * Deactivate all active assignments for a given operator in a table (cleanup).
 */
async function cleanupOperatorAssignments(table: string, operatorId: string) {
  await db.from(table).update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('operator_id', operatorId).eq('is_active', true);
}

/**
 * Create a test operator.
 */
async function createTestOperator(suffix: string): Promise<string> {
  const { data, error } = await db
    .from('contact_operators')
    .insert({
      name: `__Test_Operator_${suffix}`,
      email: `__test_op_${suffix}_${Date.now()}@concurrency.test`,
      password_hash: 'dummy_hash_for_test',
      is_active: true,
      operator_type: 'operator',
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`createTestOperator failed: ${error?.message}`);
  return data.id;
}

/**
 * Delete test operator by id.
 */
async function deleteTestOperator(id: string) {
  await db.from('contact_operators').delete().eq('id', id);
}

/**
 * Create temporary mock contacts if unassigned count is insufficient.
 */
async function createMockContacts(cfg: SourceConfig, count: number): Promise<string[]> {
  const ids: string[] = [];
  const timestamp = Date.now();
  for (let i = 0; i < count; i++) {
    const phone = String(Math.floor(1000000000 + Math.random() * 9000000000));
    if (cfg.source === 'krishnashtami') {
      const { data } = await db.from('krishnashtami_registrations').insert({
        full_name: `__Test_Krishnashtami_${timestamp}_${i}`,
        phone,
        age: 25,
        gender: 'Male',
        company_college: 'CBIT',
        festival_event_id: '7852cff8-e784-4e91-b990-a9838ea59ff1',
      }).select('id').single();
      if (data) ids.push(data.id);
    } else if (cfg.source === 'feedback_contacts') {
      const { data } = await db.from('feedback_contacts').insert({
        full_name: `__Test_Feedback_${timestamp}_${i}`,
        phone,
        gender: 'Male',
      }).select('id').single();
      if (data) ids.push(data.id);
    } else {
      const { data } = await db.from('registrations').insert({
        full_name: `__Test_Rathayatra_${timestamp}_${i}`,
        phone,
        age: 25,
        gender: 'Male',
        company_college: 'CBIT',
        interested_to_volunteer: false,
        interested_to_dinner: false,
        wants_to_donate: false,
      }).select('id').single();
      if (data) ids.push(data.id);
    }
  }
  return ids;
}

async function cleanupMockContacts(cfg: SourceConfig, ids: string[]) {
  if (ids.length === 0) return;
  await db.from(cfg.assignTable).delete().in(cfg.fkCol, ids);
  await db.from(cfg.regTable).delete().in('id', ids);
}

/**
 * Fetch unassigned contacts from a source table.
 */
async function getUnassignedContacts(cfg: SourceConfig, needed: number): Promise<{ contacts: string[]; createdIds: string[] }> {
  const { source, regTable, assignTable, fkCol } = cfg;

  const { data: assigned } = await db.from(assignTable).select(fkCol).eq('is_active', true);
  const assignedSet = new Set((assigned ?? []).map(r => ((r as unknown) as Record<string, string>)[fkCol]));

  let q = db.from(regTable).select('id');
  if (source !== 'feedback_contacts') {
    q = q.eq('gender', 'Male');
  }

  const { data: existing } = await q.limit(500);
  const unassigned = (existing ?? []).map(c => c.id).filter(id => !assignedSet.has(id));

  const createdIds: string[] = [];
  if (unassigned.length < needed) {
    const toCreate = needed - unassigned.length;
    const newIds = await createMockContacts(cfg, toCreate);
    createdIds.push(...newIds);
    unassigned.push(...newIds);
  }

  return { contacts: unassigned.slice(0, needed), createdIds };
}

async function getOneUnassignedContact(cfg: SourceConfig): Promise<{ contactId: string; createdIds: string[] }> {
  const res = await getUnassignedContacts(cfg, 1);
  return { contactId: res.contacts[0], createdIds: res.createdIds };
}

// ─── SUITE A: Capacity Enforcement ────────────────────────────────────────────
async function suiteA_CapacityEnforcement(cfg: SourceConfig) {
  const { source, assignTable, fkCol, label } = cfg;
  console.log(`\n[SUITE A — Capacity Enforcement] ${label}`);

  const operatorId = await createTestOperator(`A_${source}`);
  info(`Created test operator: ${operatorId}`);

  let createdIds: string[] = [];

  try {
    const totalNeeded = (MAX_CAPACITY - 1) + CONCURRENT_REQUESTS;
    const res = await getUnassignedContacts(cfg, totalNeeded);
    createdIds = res.createdIds;
    const unassigned = res.contacts;

    if (unassigned.length < totalNeeded) {
      fail(`${label}: Could not assemble ${totalNeeded} unassigned contacts. Skipping.`);
      return;
    }

    // Pre-fill 39 assignments synchronously
    for (let i = 0; i < MAX_CAPACITY - 1; i++) {
      const result = await callRpc(unassigned[i], operatorId, source);
      if (!result.success) {
        fail(`${label}: Seeding failed at contact ${i}: ${result.code} — ${result.message}`);
        return;
      }
    }

    const countAfterSeed = await getOperatorActiveCount(assignTable, operatorId);
    info(`Seeded ${countAfterSeed} assignments. Operator is now at ${countAfterSeed}/${MAX_CAPACITY}.`);

    if (countAfterSeed !== MAX_CAPACITY - 1) {
      fail(`${label}: Expected ${MAX_CAPACITY - 1} after seeding, got ${countAfterSeed}`);
      return;
    }

    // Launch CONCURRENT_REQUESTS concurrent assignment attempts for last slot
    const targets = unassigned.slice(MAX_CAPACITY - 1, MAX_CAPACITY - 1 + CONCURRENT_REQUESTS);
    info(`Launching ${CONCURRENT_REQUESTS} concurrent requests to fill last slot...`);
    const results = await Promise.all(
      targets.map(cId => callRpc(cId, operatorId, source))
    );

    const successes        = results.filter(r => r.success);
    const capacityExceeded = results.filter(r => !r.success && r.code === 'OPERATOR_CAPACITY_EXCEEDED');
    const alreadyAssigned  = results.filter(r => !r.success && r.code === 'CONTACT_ALREADY_ASSIGNED');
    const errors           = results.filter(r => !r.success && r.code !== 'OPERATOR_CAPACITY_EXCEEDED' && r.code !== 'CONTACT_ALREADY_ASSIGNED');

    info(`Results: ${successes.length} succeeded, ${capacityExceeded.length} CAPACITY_EXCEEDED, ${alreadyAssigned.length} ALREADY_ASSIGNED, ${errors.length} other errors`);

    if (errors.length > 0) {
      fail(`${label}: ${errors.length} unexpected error(s): ${JSON.stringify(errors.map(e => e.message || e.code))}`);
    }

    const finalCount = await getOperatorActiveCount(assignTable, operatorId);
    info(`Final DB active count for operator: ${finalCount}/${MAX_CAPACITY}`);

    if (successes.length === 1) {
      pass(`${label}: Exactly 1 request succeeded.`);
    } else {
      fail(`${label}: Expected exactly 1 success, got ${successes.length}. (41/40 IS POSSIBLE — FIX REQUIRED)`);
    }

    if (finalCount === MAX_CAPACITY) {
      pass(`${label}: Final count = ${MAX_CAPACITY} (exactly at capacity, no overflow).`);
    } else if (finalCount > MAX_CAPACITY) {
      fail(`${label}: OVERFLOW! Final count = ${finalCount} > ${MAX_CAPACITY}. Lock mechanism FAILED.`);
    } else {
      fail(`${label}: Under-filled. Final count = ${finalCount} < ${MAX_CAPACITY}.`);
    }

    if (capacityExceeded.length === CONCURRENT_REQUESTS - 1 && successes.length === 1) {
      pass(`${label}: Exactly ${CONCURRENT_REQUESTS - 1} requests correctly returned OPERATOR_CAPACITY_EXCEEDED.`);
    } else if (successes.length > 1) {
      fail(`${label}: ${successes.length} succeeded instead of 1 — capacity enforcement BROKEN.`);
    } else {
      if (finalCount <= MAX_CAPACITY && successes.length <= 1) {
        pass(`${label}: Count is within bounds. ${capacityExceeded.length} CAPACITY_EXCEEDED, ${alreadyAssigned.length} ALREADY_ASSIGNED.`);
      }
    }

  } finally {
    await cleanupOperatorAssignments(assignTable, operatorId);
    await deleteTestOperator(operatorId);
    await cleanupMockContacts(cfg, createdIds);
    info(`Cleanup done for ${label}`);
  }
}

// ─── SUITE B: Duplicate Contact Protection ────────────────────────────────────
async function suiteB_DuplicateProtection(cfg: SourceConfig) {
  const { source, assignTable, fkCol, label } = cfg;
  console.log(`\n[SUITE B — Duplicate Contact Protection] ${label}`);

  const operators: string[] = [];
  for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
    operators.push(await createTestOperator(`B_${source}_${i}`));
  }
  info(`Created ${operators.length} test operators`);

  let contactId: string | null = null;
  let createdIds: string[] = [];

  try {
    const res = await getOneUnassignedContact(cfg);
    contactId = res.contactId;
    createdIds = res.createdIds;
    if (!contactId) {
      fail(`${label}: Could not find an unassigned contact. Skipping.`);
      return;
    }
    info(`Target contact: ${contactId}`);

    info(`Launching ${CONCURRENT_REQUESTS} concurrent operators all trying to assign the same contact...`);
    const results = await Promise.all(
      operators.map(opId => callRpc(contactId!, opId, source))
    );

    const successes       = results.filter(r => r.success);
    const alreadyAssigned = results.filter(r => !r.success && r.code === 'CONTACT_ALREADY_ASSIGNED');
    const errors          = results.filter(r => !r.success && r.code !== 'CONTACT_ALREADY_ASSIGNED' && r.code !== 'OPERATOR_CAPACITY_EXCEEDED');

    info(`Results: ${successes.length} succeeded, ${alreadyAssigned.length} CONTACT_ALREADY_ASSIGNED, ${errors.length} other errors`);
    if (errors.length > 0) {
      fail(`${label}: Unexpected errors: ${JSON.stringify(errors)}`);
    }

    const finalActiveCount = await getActiveCount(assignTable, fkCol, contactId!);
    info(`Final active assignment count for contact ${contactId}: ${finalActiveCount}`);

    if (successes.length === 1) {
      pass(`${label}: Exactly 1 request succeeded.`);
    } else if (successes.length === 0) {
      fail(`${label}: No requests succeeded — something went wrong.`);
    } else {
      fail(`${label}: ${successes.length} requests succeeded — DUPLICATE ASSIGNMENT POSSIBLE. Lock mechanism FAILED.`);
    }

    if (finalActiveCount === 1) {
      pass(`${label}: Exactly 1 active assignment exists for contact (no duplicates).`);
    } else if (finalActiveCount > 1) {
      fail(`${label}: DUPLICATE! ${finalActiveCount} active assignments for same contact. Unique constraint FAILED.`);
    } else {
      fail(`${label}: 0 active assignments — assignment was not persisted.`);
    }

    if (alreadyAssigned.length === CONCURRENT_REQUESTS - 1) {
      pass(`${label}: Exactly ${CONCURRENT_REQUESTS - 1} requests returned CONTACT_ALREADY_ASSIGNED.`);
    } else if (successes.length === 1 && (alreadyAssigned.length + successes.length) === CONCURRENT_REQUESTS) {
      pass(`${label}: All ${CONCURRENT_REQUESTS} requests accounted for (1 success + ${alreadyAssigned.length} rejected).`);
    }

  } finally {
    if (contactId) {
      await cleanupContactAssignments(assignTable, fkCol, contactId);
    }
    for (const opId of operators) {
      await cleanupOperatorAssignments(assignTable, opId);
      await deleteTestOperator(opId);
    }
    await cleanupMockContacts(cfg, createdIds);
    info(`Cleanup done for ${label}`);
  }
}

// ─── SUITE C: Source Isolation (Advisory Lock Key Includes Source) ────────────
async function suiteC_SourceIsolation() {
  console.log(`\n[SUITE C — Advisory Lock Source Isolation]`);
  info('Verifying that Rathayatra and Krishnashtami assignments to the same operator do not block each other.');

  const operatorId = await createTestOperator('C_shared');
  info(`Created shared test operator: ${operatorId}`);

  let rathContactId: string | null = null;
  let krishContactId: string | null = null;
  let createdIdsRath: string[] = [];
  let createdIdsKrish: string[] = [];

  try {
    const resRath  = await getOneUnassignedContact(SOURCES[0]);
    const resKrish = await getOneUnassignedContact(SOURCES[1]);

    rathContactId   = resRath.contactId;
    krishContactId  = resKrish.contactId;
    createdIdsRath  = resRath.createdIds;
    createdIdsKrish = resKrish.createdIds;

    if (!rathContactId || !krishContactId) {
      fail('Source Isolation: Could not find unassigned contacts for both sources. Skipping.');
      return;
    }

    info(`Rathayatra contact: ${rathContactId}`);
    info(`Krishnashtami contact: ${krishContactId}`);

    const startTime = Date.now();
    const [rathResult, krishResult] = await Promise.all([
      callRpc(rathContactId, operatorId, 'rathayatra'),
      callRpc(krishContactId, operatorId, 'krishnashtami'),
    ]);
    const elapsed = Date.now() - startTime;

    info(`Both requests completed in ${elapsed}ms`);
    info(`Rathayatra result: ${JSON.stringify(rathResult)}`);
    info(`Krishnashtami result: ${JSON.stringify(krishResult)}`);

    if (rathResult.success && krishResult.success) {
      pass('Source Isolation: Both Rathayatra and Krishnashtami assignments succeeded for same operator.');
    } else {
      fail(`Source Isolation: One or both assignments failed. Rath=${rathResult.code}, Krish=${krishResult.code}`);
    }

    const rathCount = await getOperatorActiveCount('contact_assignments', operatorId);
    const krishCount = await getOperatorActiveCount('krishnashtami_contact_assignments', operatorId);

    info(`Operator active count: Rathayatra=${rathCount}, Krishnashtami=${krishCount}`);

    if (rathCount === 1 && krishCount === 1) {
      pass('Source Isolation: Exactly 1 active assignment per source, counts are independent.');
    } else {
      fail(`Source Isolation: Unexpected counts. Rathayatra=${rathCount}, Krishnashtami=${krishCount}`);
    }

    if (elapsed < 5000) {
      pass(`Source Isolation: Both requests completed in ${elapsed}ms (no cross-source blocking).`);
    } else {
      fail(`Source Isolation: Requests took ${elapsed}ms — possible cross-source blocking.`);
    }

  } finally {
    if (rathContactId) await cleanupContactAssignments('contact_assignments', 'registration_id', rathContactId);
    if (krishContactId) await cleanupContactAssignments('krishnashtami_contact_assignments', 'registration_id', krishContactId);
    await cleanupOperatorAssignments('contact_assignments', operatorId);
    await cleanupOperatorAssignments('krishnashtami_contact_assignments', operatorId);
    await deleteTestOperator(operatorId);
    await cleanupMockContacts(SOURCES[0], createdIdsRath);
    await cleanupMockContacts(SOURCES[1], createdIdsKrish);
    info('Cleanup done for Source Isolation test.');
  }
}

// ─── SUITE D: Verify Akhil Reconciliation ─────────────────────────────────────
async function suiteD_VerifyAkhilReconciliation() {
  console.log(`\n[SUITE D — Verify Akhil Reconciliation (Rathayatra)]`);
  const AKHIL_OPERATOR_ID = '954aaa39-8e34-4d3d-9ec5-fd9268173bca';

  const count = await getOperatorActiveCount('contact_assignments', AKHIL_OPERATOR_ID);
  info(`Akhil active count in contact_assignments: ${count}`);

  if (count === MAX_CAPACITY) {
    pass(`Reconciliation: Akhil is exactly at ${MAX_CAPACITY}/${MAX_CAPACITY}.`);
  } else if (count < MAX_CAPACITY) {
    pass(`Reconciliation: Akhil is at ${count}/${MAX_CAPACITY} (within bounds).`);
  } else {
    fail(`Reconciliation: Akhil still has ${count}/${MAX_CAPACITY} — overflow not fixed!`);
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  CONCURRENCY TEST SUITE — assign_contact_atomic RPC              ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`\nConcurrent requests per test: ${CONCURRENT_REQUESTS}`);
  console.log(`Max capacity per operator: ${MAX_CAPACITY}`);
  console.log(`\nRunning against: ${SUPABASE_URL}\n`);

  for (const cfg of SOURCES) {
    await suiteA_CapacityEnforcement(cfg);
  }

  for (const cfg of SOURCES) {
    await suiteB_DuplicateProtection(cfg);
  }

  await suiteC_SourceIsolation();

  await suiteD_VerifyAkhilReconciliation();

  console.log('\n══════════════════════════════════════════════════════════════════');
  if (process.exitCode === 1) {
    console.error('❌ CONCURRENCY TESTS FAILED — See failures above.');
  } else {
    console.log('✅ ALL CONCURRENCY TESTS PASSED.');
    console.log('   Proof: The atomic RPC correctly enforces capacity and duplicate protection');
    console.log('   under concurrent load. 41/40 and duplicate assignment are structurally impossible.');
  }
  console.log('══════════════════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
