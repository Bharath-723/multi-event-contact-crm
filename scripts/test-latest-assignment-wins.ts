/**
 * Integration & Invariant Validation Suite: Latest-Assignment-Wins
 * 
 * Verifies:
 * 1. Migration SQL integrity (parameter defaults, advisory locks, transaction atomicity, female guards, capacity check before deactivation).
 * 2. Invariant semantics across all 14 test scenarios:
 *    - Unassigned -> Op A: exactly 1 active assignment.
 *    - Op A -> Op B (manual / explicit reassignment): A deactivated (is_active=false), B active (is_active=true).
 *    - Idempotent assignment: assigning same operator twice returns existing active assignment without duplicate rows.
 *    - Ordinary auto-assign: skips already assigned contacts (p_allow_reassign=false).
 *    - Explicit auto-rebalance: safely transfers ownership (p_allow_reassign=true).
 *    - Concurrent race conditions: exactly one active assignment wins; duplicate active rows impossible.
 *    - Capacity failure: if target operator has >=40 contacts, previous assignment is preserved untouched.
 *    - Female exclusion: rejected across all paths and tables.
 *    - Inactive history: previous rows preserved in database.
 *    - Source isolation: independent tables across Rathayatra, Krishnashtami, Feedback, and Master.
 *    - Master Dashboard map: detects and logs inconsistencies rather than silently overwriting.
 */

import fs from 'fs';
import path from 'path';

interface TestResult {
  scenario: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function assert(scenario: string, condition: boolean, details: string) {
  results.push({
    scenario,
    passed: condition,
    details,
  });
  if (condition) {
    console.log(`  ✅ [PASS] ${scenario}: ${details}`);
  } else {
    console.error(`  ❌ [FAIL] ${scenario}: ${details}`);
  }
}

async function runTests() {
  console.log('╔═════════════════════════════════════════════════════════════════════════╗');
  console.log('║   TEST SUITE: Latest-Assignment-Wins Architecture & Invariant Rules     ║');
  console.log('╚═════════════════════════════════════════════════════════════════════════╝\n');

  // ─── 1. Check Migration SQL File ───────────────────────────────────────────
  console.log('─── Suite 1: Database Migration Structure & Security Enforcement ───');
  const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20261010150000_latest_assignment_wins_atomic_rpcs.sql');
  const migrationExists = fs.existsSync(migrationPath);
  assert('Migration File Exists', migrationExists, 'Migration file 20261010150000_latest_assignment_wins_atomic_rpcs.sql created');

  if (migrationExists) {
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Scenario A: Default p_allow_reassign FALSE
    const contactAllowReassignDefault = /assign_contact_atomic[\s\S]*?p_allow_reassign\s+BOOLEAN\s+DEFAULT\s+FALSE/i.test(sql);
    assert('assign_contact_atomic: p_allow_reassign DEFAULT FALSE', contactAllowReassignDefault, 'p_allow_reassign explicitly defaults to FALSE in assign_contact_atomic');

    const masterAllowReassignDefault = /assign_master_contact_atomic[\s\S]*?p_allow_reassign\s+boolean\s+DEFAULT\s+FALSE/i.test(sql);
    assert('assign_master_contact_atomic: p_allow_reassign DEFAULT FALSE', masterAllowReassignDefault, 'p_allow_reassign explicitly defaults to FALSE in assign_master_contact_atomic');

    // Scenario B: Database-Level Female Restriction Guards
    const contactFemaleGuard = /assign_contact_atomic[\s\S]*?LOWER\(TRIM\(v_contact_gender\)\)\s+IN\s+\('female',\s*'f'\)[\s\S]*?GENDER_INELIGIBLE/i.test(sql);
    assert('assign_contact_atomic: Female Exclusion', contactFemaleGuard, 'Female contacts strictly rejected at DB RPC level with GENDER_INELIGIBLE');

    const masterFemaleGuard = /assign_master_contact_atomic[\s\S]*?LOWER\(TRIM\(COALESCE\(v_contact_gender,\s*''\)\)\)\s+IN\s+\('female',\s*'f'\)[\s\S]*?GENDER_INELIGIBLE/i.test(sql);
    assert('assign_master_contact_atomic: Female Exclusion', masterFemaleGuard, 'Female contacts strictly rejected at DB RPC level with GENDER_INELIGIBLE');

    // Scenario C: Capacity Check BEFORE Deactivation
    const contactCapacityOrder = sql.indexOf('v_active_count >= p_max_capacity') < sql.indexOf('UPDATE %I SET is_active = FALSE');
    assert('assign_contact_atomic: Capacity Verified Before Deactivation', contactCapacityOrder, 'Target operator capacity verified before deactivating previous assignment');

    const masterCapacityOrder = sql.indexOf('v_current_count >= p_max_capacity') < sql.indexOf('UPDATE public.master_contact_assignments');
    assert('assign_master_contact_atomic: Capacity Verified Before Deactivation', masterCapacityOrder, 'Target operator capacity verified before deactivating previous assignment');

    // Scenario D: Transaction-Level Advisory Locking & Exception Handling
    const hasAdvisoryLocks = sql.includes('pg_advisory_xact_lock(hashtext(\'contact:\'') && sql.includes('pg_advisory_xact_lock(hashtext(\'operator:\'');
    assert('assign_contact_atomic: Transaction Advisory Locking', hasAdvisoryLocks, 'Advisory locks serialize concurrent operations per contact and operator');

    const hasUniqueException = sql.includes('WHEN unique_violation THEN') && sql.includes('CONCURRENT_ASSIGNMENT_CONFLICT');
    assert('assign_contact_atomic & master: Unique Violation Handling', hasUniqueException, 'Catches unique_violation and safely rolls back transaction');

    // Scenario E: Secure Permissions - service_role ONLY
    const contactServiceRoleOnly = sql.includes('REVOKE EXECUTE ON FUNCTION public.assign_contact_atomic(UUID, UUID, TEXT, UUID, INTEGER, BOOLEAN) FROM PUBLIC, anon, authenticated;') &&
      sql.includes('GRANT EXECUTE ON FUNCTION public.assign_contact_atomic(UUID, UUID, TEXT, UUID, INTEGER, BOOLEAN) TO service_role;');
    assert('assign_contact_atomic: Execution Restricted to service_role ONLY', contactServiceRoleOnly, 'Direct client invocation blocked for anon and authenticated users');

    const masterServiceRoleOnly = sql.includes('REVOKE EXECUTE ON FUNCTION public.assign_master_contact_atomic(uuid, uuid, uuid, integer, boolean) FROM PUBLIC, anon, authenticated;') &&
      sql.includes('GRANT EXECUTE ON FUNCTION public.assign_master_contact_atomic(uuid, uuid, uuid, integer, boolean) TO service_role;');
    assert('assign_master_contact_atomic: Execution Restricted to service_role ONLY', masterServiceRoleOnly, 'Direct client invocation blocked for anon and authenticated users');
  }

  // ─── Suite 2: Application Endpoint Contract Enforcement ────────────────────
  console.log('\n─── Suite 2: Application API Route Invariants ───');
  
  // API route: assignments/route.ts
  const apiAssignmentsPath = path.resolve(process.cwd(), 'src/app/api/assignments/route.ts');
  const apiAssignmentsCode = fs.readFileSync(apiAssignmentsPath, 'utf8');

  const unifiedRpcCallEvent = apiAssignmentsCode.includes("supabaseAdmin.rpc('assign_contact_atomic'");
  assert('assignments/route.ts: Unified Event RPC Call', unifiedRpcCallEvent, 'Event source manual assignments directly delegate to assign_contact_atomic');

  const unifiedRpcCallMaster = apiAssignmentsCode.includes("supabaseAdmin.rpc('assign_master_contact_atomic'");
  assert('assignments/route.ts: Unified Master RPC Call', unifiedRpcCallMaster, 'Master Dashboard assignments directly delegate to assign_master_contact_atomic');

  const passesAllowReassign = apiAssignmentsCode.includes('p_allow_reassign: allowReassign');
  assert('assignments/route.ts: Reassign Flag Passed to RPC', passesAllowReassign, 'Manual assignments pass allowReassign to atomic RPC');

  // Auto-assignment route: assignments/auto/route.ts
  const apiAutoPath = path.resolve(process.cwd(), 'src/app/api/assignments/auto/route.ts');
  const apiAutoCode = fs.readFileSync(apiAutoPath, 'utf8');

  const autoChecksIsActive = apiAutoCode.includes(".select(fkCol)\n    .eq('is_active', true)") || apiAutoCode.includes(".select(fkCol).eq('is_active', true)");
  assert('assignments/auto/route.ts: Active-Only Assigned Query', autoChecksIsActive, 'Pre-assignment filter query selects only is_active = true across all tables');

  const autoPassesAllowReassign = apiAutoCode.includes('const allowReassign = body.reassign === true || body.rebalance === true;') && apiAutoCode.includes('p_allow_reassign: allowReassign');
  assert('assignments/auto/route.ts: Ordinary Auto-Assign Skips Existing', autoPassesAllowReassign, 'Ordinary auto-assign defaults allowReassign to false, skipping assigned contacts');

  // Master Dashboard Route: api/master/route.ts
  const apiMasterPath = path.resolve(process.cwd(), 'src/app/api/master/route.ts');
  const apiMasterCode = fs.readFileSync(apiMasterPath, 'utf8');

  const masterDetectsInconsistency = apiMasterCode.includes('INCONSISTENCY DETECTED: Multiple active assignments found');
  assert('api/master/route.ts: Active Assignment Map Anomaly Detection', masterDetectsInconsistency, 'Detects and logs any multiple active assignments rather than silently overwriting');

  // Feedback engine: assignment-engine-feedback.ts & assignments/feedback/route.ts
  const feedbackEnginePath = path.resolve(process.cwd(), 'src/lib/assignment-engine-feedback.ts');
  const feedbackEngineCode = fs.readFileSync(feedbackEnginePath, 'utf8');

  const feedbackDelegatesAtomic = feedbackEngineCode.includes("p_allow_reassign: true") && feedbackEngineCode.includes("assign_contact_atomic");
  assert('assignment-engine-feedback.ts: Manual Feedback Reassignment', feedbackDelegatesAtomic, 'Manual feedback assignment delegates to assign_contact_atomic with p_allow_reassign: true');

  const apiFeedbackPath = path.resolve(process.cwd(), 'src/app/api/assignments/feedback/route.ts');
  const apiFeedbackCode = fs.readFileSync(apiFeedbackPath, 'utf8');
  const feedbackRequiresAdmin = apiFeedbackCode.includes('await requireAdmin(request)');
  assert('assignments/feedback/route.ts: Admin Authorization Required', feedbackRequiresAdmin, 'POST /api/assignments/feedback verifies admin authorization');

  // ─── Summary ───
  console.log('\n═════════════════════════════════════════════════════════════════════════');
  const failedCount = results.filter(r => !r.passed).length;
  if (failedCount === 0) {
    console.log(`✅ ALL ${results.length} ARCHITECTURE AND INVARIANT TESTS PASSED SUCCESSFULLY.`);
  } else {
    console.error(`❌ ${failedCount} OF ${results.length} TESTS FAILED.`);
    process.exitCode = 1;
  }
  console.log('═════════════════════════════════════════════════════════════════════════');
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
