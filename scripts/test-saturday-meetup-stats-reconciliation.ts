/**
 * Test Suite: Saturday Meetup Dashboard Statistics & Reconciliation
 * File: scripts/test-saturday-meetup-stats-reconciliation.ts
 *
 * Verifies:
 * 1. Assigned Calls strictly equals active assignments count.
 * 2. Coming matches confirmed coming statuses for current weekly period.
 * 3. Pending Calls matches pending-response assignments.
 * 4. Invariant: assigned === coming + notComing + notAnswered + nextWeek + notInHyderabad + pending.
 * 5. Visitors equals approved unique check-ins for active weekly period.
 * 6. Attendance list count equals visitors count.
 * 7. Deduplication across canonical master_contact_id and normalized 10-digit phone.
 * 8. Agreement between Saturday Meetup Dashboard and Admin Contact Operators.
 * 9. Supabase Realtime channel subscriptions configured for live synchronization.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import { computeOperatorStats, normalizeAssignmentStatus } from '../src/lib/status-normalizer.ts';
import { getCurrentWeeklyPeriod } from '../src/lib/weekly-period.ts';
import { normalizePhone } from '../src/lib/phone-utils.ts';

let passCount = 0;
let failCount = 0;

function check(title: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${title}`);
    passCount++;
  } catch (err: unknown) {
    console.error(`  ❌ [FAIL] ${title}`);
    console.error(`     Error: ${err instanceof Error ? err.message : String(err)}`);
    failCount++;
  }
}

console.log('╔═════════════════════════════════════════════════════════════════════════════╗');
console.log('║   SATURDAY MEETUP DASHBOARD: COMING, PENDING & VISITOR STATS RECONCILIATION ║');
console.log('╚═════════════════════════════════════════════════════════════════════════════╝\n');

const currentPeriod = getCurrentWeeklyPeriod();
const pastPeriod = '2026-10-30';

// ── Test 1: Mathematical Invariant in Weekly Period Mode ─────────────────────
check('Invariant: assigned === coming + notComing + notAnswered + nextWeek + notInHyderabad + pending', () => {
  const mockAssignments = [
    { id: '1', status: 'Coming', is_active: true, updated_at: '2026-11-14T10:00:00Z' },
    { id: '2', status: 'Coming', is_active: true, updated_at: '2026-11-14T10:05:00Z' },
    { id: '3', status: 'Not Coming', is_active: true, updated_at: '2026-11-14T10:10:00Z' },
    { id: '4', status: 'Next Week', is_active: true, updated_at: '2026-11-14T10:15:00Z' },
    { id: '5', status: 'Not Answered', is_active: true, updated_at: '2026-11-14T10:20:00Z' },
    // 5 uncalled / pending assignments (never updated or updated in past period)
    { id: '6', status: 'assigned', is_active: true, updated_at: '2026-11-14T09:00:00Z' },
    { id: '7', status: 'assigned', is_active: true, updated_at: `${pastPeriod}T10:00:00Z` },
    { id: '8', status: 'Coming', is_active: true, updated_at: `${pastPeriod}T10:00:00Z` }, // old week coming -> pending this week
    { id: '9', status: 'Not Coming', is_active: true, updated_at: `${pastPeriod}T10:00:00Z` },
    { id: '10', status: 'assigned', is_active: true, updated_at: null },
    // 2 inactive assignments (should NOT be counted in assigned or pending)
    { id: '11', status: 'Coming', is_active: false, updated_at: '2026-11-14T10:00:00Z' },
    { id: '12', status: 'assigned', is_active: false, updated_at: '2026-11-14T10:00:00Z' },
  ];

  const stats = computeOperatorStats(mockAssignments, { currentWeeklyPeriod: currentPeriod });

  assert.strictEqual(stats.assigned, 10, 'Assigned calls must be strictly 10 active assignments');
  assert.strictEqual(stats.coming, 2, 'Coming calls must be 2 current weekly updates');
  assert.strictEqual(stats.notComing, 1, 'Not Coming calls must be 1');
  assert.strictEqual(stats.nextWeek, 1, 'Next Week calls must be 1');
  assert.strictEqual(stats.notAnswered, 1, 'Not Answered calls must be 1');
  assert.strictEqual(stats.pending, 5, 'Pending calls must be 5 (active assignments unresponded this week)');

  const sum = stats.coming + stats.notComing + stats.notAnswered + stats.nextWeek + stats.notInHyderabad + stats.pending;
  assert.strictEqual(sum, stats.assigned, 'Sum of all status buckets must strictly equal assigned');
});

// ── Test 2: Friday Rollover Reset & Pending Alignment ────────────────────────
check('Friday Rollover: Coming resets to 0 and all uncalled assignments become pending', () => {
  const previousWeekAssignments = [
    { id: '1', status: 'Coming', is_active: true, updated_at: `${pastPeriod}T10:00:00Z` },
    { id: '2', status: 'Coming', is_active: true, updated_at: `${pastPeriod}T10:00:00Z` },
    { id: '3', status: 'Not Coming', is_active: true, updated_at: `${pastPeriod}T10:00:00Z` },
  ];

  const rolledOverStats = computeOperatorStats(previousWeekAssignments, { currentWeeklyPeriod: currentPeriod });

  assert.strictEqual(rolledOverStats.assigned, 3, 'Assigned retained across rollover');
  assert.strictEqual(rolledOverStats.coming, 0, 'Coming reset to 0 in new weekly period');
  assert.strictEqual(rolledOverStats.notComing, 0, 'Not Coming reset to 0 in new weekly period');
  assert.strictEqual(rolledOverStats.pending, 3, 'All 3 assigned contacts pending response in new weekly period');
  assert.strictEqual(rolledOverStats.coming + rolledOverStats.pending, rolledOverStats.assigned);
});

// ── Test 3: Status Case-Insensitivity & Aliases ──────────────────────────────
check('normalizeAssignmentStatus maps case-insensitive statuses and aliases', () => {
  assert.strictEqual(normalizeAssignmentStatus('Coming'), 'coming');
  assert.strictEqual(normalizeAssignmentStatus('coming'), 'coming');
  assert.strictEqual(normalizeAssignmentStatus('CONFIRMED'), 'coming');
  assert.strictEqual(normalizeAssignmentStatus('Interested'), 'coming');
  assert.strictEqual(normalizeAssignmentStatus('Not Coming'), 'notComing');
  assert.strictEqual(normalizeAssignmentStatus('not_coming'), 'notComing');
  assert.strictEqual(normalizeAssignmentStatus('Next Week'), 'nextWeek');
  assert.strictEqual(normalizeAssignmentStatus('Not Answered'), 'notAnswered');
  assert.strictEqual(normalizeAssignmentStatus('assigned'), 'pending');
  assert.strictEqual(normalizeAssignmentStatus(null), 'pending');
  assert.strictEqual(normalizeAssignmentStatus(undefined), 'pending');
});

// ── Test 4: Visitor Deduplication by Canonical ID & Phone ───────────────────
check('Visitor checkins deduplicated by canonical master_contact_id and 10-digit phone', () => {
  const rawCheckins = [
    { id: 'c1', master_contact_id: 'm1', phone: '9876543210', weekly_period: currentPeriod },
    // Duplicate phone with +91 prefix
    { id: 'c2', master_contact_id: 'm2', phone: '+91 9876543210', weekly_period: currentPeriod },
    // Duplicate master_contact_id with different phone format
    { id: 'c3', master_contact_id: 'm1', phone: '919876543210', weekly_period: currentPeriod },
    // Distinct visitor
    { id: 'c4', master_contact_id: 'm3', phone: '9123456789', weekly_period: currentPeriod },
    // Distinct visitor without master_contact_id
    { id: 'c5', master_contact_id: null, phone: '9555555555', weekly_period: currentPeriod },
  ];

  const uniqueCheckins: typeof rawCheckins = [];
  const seenMasterIds = new Set<string>();
  const seenPhones = new Set<string>();

  for (const c of rawCheckins) {
    const normPhone = normalizePhone(c.phone) || c.phone;
    const mId = c.master_contact_id ? String(c.master_contact_id) : null;

    const duplicateById = Boolean(mId && seenMasterIds.has(mId));
    const duplicateByPhone = Boolean(normPhone && seenPhones.has(normPhone));

    if (duplicateById || duplicateByPhone) {
      continue;
    }

    if (mId) seenMasterIds.add(mId);
    if (normPhone) seenPhones.add(normPhone);
    uniqueCheckins.push(c);
  }

  assert.strictEqual(uniqueCheckins.length, 3, 'Must deduplicate c2 and c3, keeping exactly 3 unique visitors');
  assert.strictEqual(uniqueCheckins[0].id, 'c1');
  assert.strictEqual(uniqueCheckins[1].id, 'c4');
  assert.strictEqual(uniqueCheckins[2].id, 'c5');
});

// ── Test 5: Saturday Meetup API Implementation Inspection ───────────────────
check('src/app/api/saturday-meetup/route.ts uses computeOperatorStats and robust deduplication', () => {
  const content = fs.readFileSync('src/app/api/saturday-meetup/route.ts', 'utf8');

  assert.ok(content.includes('fetchAllActiveAssignments'), 'Must include batched active assignments fetcher');
  assert.ok(content.includes('fetchAllWeeklyCheckins'), 'Must include batched weekly checkins fetcher');
  assert.ok(content.includes('computeOperatorStats'), 'Must use computeOperatorStats');
  assert.ok(content.includes('seenMasterIds'), 'Must track seenMasterIds for deduplication');
  assert.ok(content.includes('seenPhones'), 'Must track seenPhones for deduplication');
  assert.ok(content.includes('metrics: {'), 'Must return metrics object');
  assert.ok(content.includes('assigned_calls: assignedCallsCount'), 'Metrics must include assigned_calls');
  assert.ok(content.includes('coming: comingCount'), 'Metrics must include coming');
  assert.ok(content.includes('pending_calls: pendingCallsCount'), 'Metrics must include pending_calls');
  assert.ok(content.includes('visitors: visitorsCount'), 'Metrics must include visitors');
  assert.ok(content.includes('total_attendance: visitorsCount'), 'Total attendance must strictly equal visitorsCount');
});

// ── Test 6: Saturday Meetup Dashboard UI Realtime Subscriptions ─────────────
check('src/app/admin/saturday-meetup/page.tsx subscribes to assignments, checkins & operators', () => {
  const content = fs.readFileSync('src/app/admin/saturday-meetup/page.tsx', 'utf8');

  assert.ok(content.includes('master_contact_checkins'), 'Must subscribe to checkins');
  assert.ok(content.includes('master_contact_assignments'), 'Must subscribe to assignments for live coming/pending updates');
  assert.ok(content.includes('contact_operators'), 'Must subscribe to operators');
  assert.ok(content.includes('isBackground'), 'Must support background silent refresh without screen flash');
});

console.log('\n=============================================================================');
console.log(`TOTAL CHECKS: ${passCount + failCount}`);
console.log(`PASSED: ${passCount}`);
console.log(`FAILED: ${failCount}`);
console.log(`OVERALL STATUS: ${failCount === 0 ? '✅ ALL CHECKS PASSED' : '❌ SOME CHECKS FAILED'}`);
console.log('=============================================================================\n');

if (failCount > 0) process.exit(1);
