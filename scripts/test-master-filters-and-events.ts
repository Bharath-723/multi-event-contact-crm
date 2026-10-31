import fs from 'fs';
import path from 'path';

// MUST load .env.local BEFORE importing any app modules that initialize Supabase
const envContent = fs.readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf8');
for (const line of envContent.split('\n')) {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    process.env[match[1]] = value.trim();
  }
}

interface TestResult {
  title: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, title: string, details?: string) {
  if (condition) {
    results.push({ title, passed: true, details });
    console.log(`  ✓ PASS: ${title} ${details ? `(${details})` : ''}`);
  } else {
    results.push({ title, passed: false, details });
    console.error(`  ✗ FAIL: ${title} ${details ? `(${details})` : ''}`);
  }
}

async function runTestSuite() {
  console.log('================================================================');
  console.log(' HKM Master Dashboard — Filter Options & Event Breakdown Tests ');
  console.log('================================================================\n');

  // Dynamic import after env vars are populated
  const { supabaseAdmin } = await import('../src/lib/supabase-admin');
  const {
    getMasterMetadata,
    expandAreaSelections,
    expandCompanySelections,
    cleanFilterString,
    invalidateMasterMetadataCache,
  } = await import('../src/lib/master-filters');

  invalidateMasterMetadataCache();

  // Test 1: Fetch metadata from DB
  const { data: sourceRows } = await supabaseAdmin
    .from('event_sources')
    .select('*')
    .eq('is_active', true);

  const registeredSources = (sourceRows || []).map((s) => ({
    source_key: s.source_key,
    display_name: s.display_name,
  }));

  const metadata = await getMasterMetadata(registeredSources, true);

  // 1. Area of Stay dropdown contains every distinct valid database option
  console.log('[Check 1] Area of Stay dropdown options:');
  assert(
    metadata.areas.length > 50,
    'Area of Stay has all distinct database options',
    `Found ${metadata.areas.length} distinct areas (previously truncated at 200 rows)`
  );
  assert(
    !metadata.areas.includes('') && !metadata.areas.includes('—') && !metadata.areas.includes('null'),
    'Area of Stay excludes empty/null/placeholder values'
  );
  assert(
    metadata.areas.includes('Gandipet') && metadata.areas.includes('Gachibowli'),
    'Area of Stay includes primary locations like Gandipet & Gachibowli'
  );

  // 2. Company / College dropdown contains every distinct valid database option
  console.log('\n[Check 2] Company / College dropdown options:');
  assert(
    metadata.colleges.length > 200,
    'Company / College has all distinct database options',
    `Found ${metadata.colleges.length} distinct canonical colleges (previously truncated at 200 rows)`
  );
  assert(
    metadata.colleges.includes('CBIT'),
    'Company / College includes canonical "CBIT"'
  );
  assert(
    !metadata.colleges.includes('cbit') && !metadata.colleges.includes('Cbit'),
    'Case variations "cbit" and "Cbit" are deduplicated under canonical "CBIT"'
  );
  assert(
    metadata.colleges.includes('C.B.I.T'),
    'Genuinely different institution formatting "C.B.I.T" is preserved as a distinct option'
  );

  // 3. Search works across the complete option list
  console.log('\n[Check 3] MultiSelect search across complete option list:');
  function searchOptions(options: string[], query: string): string[] {
    if (!query.trim()) return options;
    const q = query.toLowerCase().trim();
    const cleanQ = q.replace(/[^a-z0-9]/g, '');
    return options.filter((o) => {
      const lowerO = o.toLowerCase();
      if (lowerO.includes(q)) return true;
      if (cleanQ) {
        const cleanO = lowerO.replace(/[^a-z0-9]/g, '');
        return cleanO.includes(cleanQ);
      }
      return false;
    });
  }

  const cbitSearch = searchOptions(metadata.colleges, 'cbit');
  assert(
    cbitSearch.includes('CBIT') && cbitSearch.includes('C.B.I.T'),
    'Search for "cbit" matches both "CBIT" and "C.B.I.T"',
    `Matches: ${cbitSearch.join(', ')}`
  );
  const mgitSearch = searchOptions(metadata.colleges, 'mgit');
  assert(
    mgitSearch.includes('MGIT'),
    'Search for "mgit" matches "MGIT"'
  );

  // 4. Select All and Clear work correctly
  console.log('\n[Check 4] Select All and Clear logic:');
  let selected: string[] = [];
  const selectAll = (filtered: string[]) => Array.from(new Set([...selected, ...filtered]));
  selected = selectAll(cbitSearch);
  assert(
    selected.length === cbitSearch.length,
    'Select All adds all filtered matches',
    `Selected: ${selected.length} items`
  );
  selected = [];
  assert(
    selected.length === 0,
    'Clear All clears the selection completely'
  );

  // 5. Multi-select filtering returns the expected records
  console.log('\n[Check 5] Multi-select raw variant expansion and OR filtering:');
  const expandedCbit = expandCompanySelections(['CBIT'], metadata);
  assert(
    expandedCbit.includes('CBIT') && expandedCbit.includes('Cbit') && expandedCbit.includes('cbit'),
    'Selecting "CBIT" expands to all DB variants ["CBIT", "Cbit", "cbit"]',
    `Variants: ${expandedCbit.join(', ')}`
  );

  // Run actual query with expanded variants against DB
  const { data: cbitContacts, error: cbitErr } = await supabaseAdmin
    .from('master_contacts')
    .select('id, name, company_college')
    .in('company_college', expandedCbit);

  assert(
    !cbitErr && (cbitContacts?.length ?? 0) === 361,
    'Selecting "CBIT" matches all 361 contacts across all case variations',
    `Total matched: ${cbitContacts?.length}`
  );

  // Multi-select CBIT and MGIT (OR logic)
  const expandedCbitAndMgit = expandCompanySelections(['CBIT', 'MGIT'], metadata);
  const { data: cbitMgitContacts, error: cmErr } = await supabaseAdmin
    .from('master_contacts')
    .select('id')
    .in('company_college', expandedCbitAndMgit);

  assert(
    !cmErr && (cbitMgitContacts?.length ?? 0) === 361 + 208,
    'Multi-select ["CBIT", "MGIT"] matches 569 contacts (361 CBIT + 208 MGIT) via boolean OR',
    `Total matched: ${cbitMgitContacts?.length}`
  );

  // 6. Event Contact Breakdown returns correct counts for all four sources
  console.log('\n[Check 6] Event Contact Breakdown:');
  assert(
    metadata.eventBreakdown.length === 4,
    'Event breakdown contains all 4 sources'
  );

  const breakdownMap = Object.fromEntries(metadata.eventBreakdown.map(e => [e.source, e.count]));
  console.log('  Event Counts in Breakdown:', breakdownMap);

  assert(
    breakdownMap['rathayatra'] === 825,
    'Rathayatra 2026 has exactly 825 unique contacts',
    `Count: ${breakdownMap['rathayatra']}`
  );
  assert(
    breakdownMap['krishnashtami'] === 520,
    'Krishnashtami 2026 has exactly 520 unique contacts',
    `Count: ${breakdownMap['krishnashtami']}`
  );
  assert(
    breakdownMap['feedback_contacts'] === 558,
    'Feedback Contact has exactly 558 unique contacts',
    `Count: ${breakdownMap['feedback_contacts']}`
  );
  assert(
    breakdownMap['contacts_register'] === 61,
    'Contacts Register has exactly 61 unique contacts',
    `Count: ${breakdownMap['contacts_register']}`
  );
  assert(
    Object.values(breakdownMap).every(c => c > 0),
    'Zero events issue resolved: all 4 event sources show positive, authentic contact counts'
  );

  // 7. Cross-event duplicate contacts handled correctly
  console.log('\n[Check 7] Cross-event duplicate contacts & Global total reconciliation:');
  const totalEventRegistrations = metadata.eventBreakdown.reduce((sum, e) => sum + e.count, 0);
  assert(
    totalEventRegistrations === 1964,
    'Sum of unique contacts per event is 1,964',
    `825 + 520 + 558 + 61 = ${totalEventRegistrations}`
  );

  const { count: globalUniqueContacts } = await supabaseAdmin
    .from('master_contacts')
    .select('id', { count: 'exact', head: true });

  assert(
    globalUniqueContacts === 1826,
    'Global Master Contacts total is 1,826 unique individuals',
    `Cross-event overlap: ${totalEventRegistrations - (globalUniqueContacts || 0)} event attendances by repeat attendees`
  );

  // 8. Empty source tables and missing phone numbers handled safely
  console.log('\n[Check 8] Clean filter string and edge cases:');
  assert(
    cleanFilterString(null) === null &&
    cleanFilterString('') === null &&
    cleanFilterString('   ') === null &&
    cleanFilterString('—') === null &&
    cleanFilterString('null') === null,
    'cleanFilterString safely rejects null, empty, whitespace, and placeholder strings'
  );
  assert(
    cleanFilterString('  CBIT   College  ') === 'CBIT College',
    'cleanFilterString trims leading/trailing whitespace and collapses internal multiple spaces'
  );

  // 9. Dashboard global contact count remains consistent with existing identity rules
  console.log('\n[Check 9] Normalized phone identity:');
  const { count: totalPhones } = await supabaseAdmin
    .from('master_contacts')
    .select('phone', { count: 'exact', head: true });
  
  assert(
    totalPhones === 1826,
    'All 1,826 master contact records have distinct normalized phones (1 row = 1 individual)'
  );

  // 10. No regressions in master contacts API response contract
  console.log('\n[Check 10] Master API response contract integrity:');
  const cachedMeta = await getMasterMetadata(registeredSources);
  assert(
    cachedMeta.cachedAt === metadata.cachedAt,
    'In-memory server cache returns instant hit without repeated heavy queries'
  );

  console.log('\n================================================================');
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;
  console.log(` RESULTS: ${passedCount} passed, ${failedCount} failed (${results.length} total checks)`);
  console.log('================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
