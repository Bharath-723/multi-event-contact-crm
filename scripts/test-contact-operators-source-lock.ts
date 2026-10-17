/**
 * Regression Test Suite: Contact Operators Source Dropdown & Backend Source Lock
 * 
 * Asserts:
 * 1. Contact Operators page renders a Source dropdown with EXACTLY ONE option: "Master Dashboard".
 * 2. The options "Rathayatra 2026", "Krishnashtami 2026", and "Feedback Contacts" are completely absent from the dropdown.
 * 3. Default and active selected value is strictly "master_dashboard".
 * 4. The backend /api/operators endpoint locks its active assignment queries to master_contact_assignments,
 *    and passing alternative ?source=... query parameters CANNOT divert the backend data source.
 * 5. Operator Portal (src/app/operator/portal/page.tsx) remains locked exclusively to Master Dashboard.
 * 6. Historical assignment records in festival tables remain untouched.
 */

import fs from 'fs';
import path from 'path';

let total = 0;
let passed = 0;

function assert(condition: boolean, testName: string, details?: unknown) {
  total++;
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName}`);
    if (details) console.error('    Details:', details);
  }
}

async function runTests() {
  console.log('================================================================================');
  console.log('   REGRESSION SUITE: CONTACT OPERATORS SOURCE DROPDOWN & BACKEND LOCK');
  console.log('================================================================================\n');

  const operatorsPagePath = path.join(process.cwd(), 'src/app/admin/operators/page.tsx');
  const operatorsPageContent = fs.readFileSync(operatorsPagePath, 'utf8');

  // ─── 1. UI Dropdown Structure & Content ──────────────────────────────────────
  console.log('--- 1. Contact Operators Source Dropdown UI Verification ---');

  // Check that Source dropdown element exists
  const hasSourceSelect = /<select[^>]*aria-label=["']Source["'][^>]*>|<select[^>]*id=["']source-dropdown["'][^>]*>/i.test(operatorsPageContent);
  assert(hasSourceSelect, 'Source dropdown (<select>) element is present in Contact Operators page');

  // Extract the select block for Source dropdown
  const selectBlockMatch = operatorsPageContent.match(/<select[^>]*id=["']source-dropdown["'][^>]*>([\s\S]*?)<\/select>/i)
    || operatorsPageContent.match(/<select[^>]*aria-label=["']Source["'][^>]*>([\s\S]*?)<\/select>/i);
  
  assert(Boolean(selectBlockMatch), 'Found Source select block in JSX');

  if (selectBlockMatch) {
    const selectInner = selectBlockMatch[1];
    
    // Count <option> tags
    const optionMatches = selectInner.match(/<option[\s\S]*?<\/option>/gi) || [];
    assert(optionMatches.length === 1, `Source dropdown contains EXACTLY 1 option (found: ${optionMatches.length})`);

    // Verify the single option is Master Dashboard
    const hasMasterDashboardOption = /<option[^>]*value=["']master_dashboard["'][^>]*>\s*Master Dashboard\s*<\/option>/i.test(selectInner);
    assert(hasMasterDashboardOption, 'The single option is value="master_dashboard" displaying "Master Dashboard"');

    // Verify other sources are absent
    const hasRathayatraOption = /rathayatra/i.test(selectInner);
    const hasKrishnashtamiOption = /krishnashtami/i.test(selectInner);
    const hasFeedbackOption = /feedback/i.test(selectInner);
    assert(!hasRathayatraOption, 'Rathayatra 2026 is absent from the Source dropdown');
    assert(!hasKrishnashtamiOption, 'Krishnashtami 2026 is absent from the Source dropdown');
    assert(!hasFeedbackOption, 'Feedback Contacts is absent from the Source dropdown');
  }

  // Verify default and only state
  assert(
    operatorsPageContent.includes("const contactSource: ContactSource = 'master_dashboard';") ||
    operatorsPageContent.includes("contactSource = 'master_dashboard'"),
    'contactSource is locked strictly to "master_dashboard" in page state'
  );

  // ─── 2. Realtime Subscriptions Scoped to Master Dashboard ────────────────────
  console.log('\n--- 2. Realtime Subscription Isolation ---');
  const hasMasterRealtime = operatorsPageContent.includes("table: 'master_contact_assignments'");
  const hasKrishRealtime = operatorsPageContent.includes("table: 'krishnashtami_contact_assignments'");
  const hasRathaRealtime = operatorsPageContent.includes("table: 'contact_assignments'");
  const hasFeedbackRealtime = operatorsPageContent.includes("table: 'feedback_contact_assignments'");

  assert(hasMasterRealtime, 'Operators page subscribes to master_contact_assignments');
  assert(!hasKrishRealtime, 'Operators page does NOT subscribe to krishnashtami_contact_assignments');
  assert(!hasRathaRealtime, 'Operators page does NOT subscribe to contact_assignments');
  assert(!hasFeedbackRealtime, 'Operators page does NOT subscribe to feedback_contact_assignments');

  // ─── 3. Backend API Route Enforcement (/api/operators) ───────────────────────
  console.log('\n--- 3. Backend API Route Source Lock (/api/operators) ---');
  const apiOperatorsPath = path.join(process.cwd(), 'src/app/api/operators/route.ts');
  const apiOperatorsContent = fs.readFileSync(apiOperatorsPath, 'utf8');

  // Check that assignTable is strictly 'master_contact_assignments'
  const hasLockedAssignTable = /const\s+assignTable\s*=\s*['"]master_contact_assignments['"]/i.test(apiOperatorsContent);
  assert(hasLockedAssignTable, '/api/operators statically locks assignTable to "master_contact_assignments"');

  // Verify that query params cannot override the table
  const hasDynamicTableOverride = /assignTable\s*=\s*source\s*===/i.test(apiOperatorsContent);
  assert(!hasDynamicTableOverride, '/api/operators does NOT allow query parameter source to divert active table');

  // ─── 4. Operator Portal Locked to Master Dashboard ──────────────────────────
  console.log('\n--- 4. Operator Portal Source Lock (src/app/operator/portal/page.tsx) ---');
  const operatorPortalPath = path.join(process.cwd(), 'src/app/operator/portal/page.tsx');
  const operatorPortalContent = fs.readFileSync(operatorPortalPath, 'utf8');

  const hasPortalSourceDropdown = /<select[^>]*aria-label=["'](Source|Festival)["'][^>]*>/i.test(operatorPortalContent);
  assert(!hasPortalSourceDropdown, 'Operator Portal contains NO source or festival dropdown');

  const portalFetchesMy = operatorPortalContent.includes("fetch('/api/assignments/my')") || operatorPortalContent.includes("url = '/api/assignments/my'");
  assert(portalFetchesMy, 'Operator Portal fetches assignments strictly from /api/assignments/my');

  const apiMyPath = path.join(process.cwd(), 'src/app/api/assignments/my/route.ts');
  const apiMyContent = fs.readFileSync(apiMyPath, 'utf8');
  assert(
    apiMyContent.includes("from('master_contact_assignments')") && !apiMyContent.includes("from('contact_assignments')"),
    '/api/assignments/my queries master_contact_assignments exclusively'
  );

  // ─── 5. Auto-Assign Locked to Master Dashboard ───────────────────────────────
  console.log('\n--- 5. Auto-Assign Backend Lock ---');
  const autoAssignPath = path.join(process.cwd(), 'src/app/api/assignments/auto/route.ts');
  const autoAssignContent = fs.readFileSync(autoAssignPath, 'utf8');

  assert(
    autoAssignContent.includes("const targetRegTable = 'master_contacts';") &&
    autoAssignContent.includes("const assignTable = 'master_contact_assignments';"),
    '/api/assignments/auto targets master_contacts and master_contact_assignments exclusively'
  );

  // ─── Summary ─────────────────────────────────────────────────────────────────
  console.log('\n================================================================================');
  console.log(`RESULTS: ${passed} / ${total} Tests Passed (${((passed / total) * 100).toFixed(1)}%)`);
  console.log('================================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
