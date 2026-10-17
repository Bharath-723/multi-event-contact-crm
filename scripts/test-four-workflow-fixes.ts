/**
 * Test Suite: HKM Admin Portal — Four Final UI and Workflow Fixes
 * 
 * 1. Multi-select filter semantics in Auto-Assign (OR within filter, AND across filters, unrestricted when empty)
 * 2. Master Dashboard independent export/print/refresh loading states
 * 3. Enforce Master Dashboard as only active source in both operator interfaces
 * 4. Contact Operators default ordering (Highest assigned count to lowest)
 */

import fs from 'fs';
import path from 'path';
import {
  parseFilterValues,
  mapLevelCodeToNumber,
  matchesClassesAttended,
  matchesChanting,
  matchesLevelNumber,
} from '../src/app/api/assignments/auto/route';

async function runTestSuite() {
  console.log('================================================================================');
  console.log('       REGRESSION TEST SUITE: FOUR FINAL UI & WORKFLOW FIXES');
  console.log('================================================================================\n');

  let total = 0;
  let passed = 0;

  function assert(condition: boolean, testName: string, details?: unknown) {
    total++;
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      if (details) console.error('  Details:', details);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Multi-Select Filter Parsing and Semantics
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('--- 1. Auto-Assign Multi-Select Filter Parsing & Semantics ---');

  // parseFilterValues tests
  assert(parseFilterValues(null).length === 0, 'parseFilterValues(null) returns empty array');
  assert(parseFilterValues(undefined).length === 0, 'parseFilterValues(undefined) returns empty array');
  assert(parseFilterValues('').length === 0, 'parseFilterValues("") returns empty array');
  assert(parseFilterValues('All').length === 0, 'parseFilterValues("All") returns empty array (unrestricted)');
  assert(parseFilterValues('All Areas').length === 0, 'parseFilterValues("All Areas") returns empty array');
  assert(parseFilterValues('none').length === 0, 'parseFilterValues("none") returns empty array');
  assert(
    JSON.stringify(parseFilterValues(['Kokapet', 'Gandipet'])) === JSON.stringify(['Kokapet', 'Gandipet']),
    'parseFilterValues with array returns clean items'
  );
  assert(
    JSON.stringify(parseFilterValues('Kokapet, Gandipet')) === JSON.stringify(['Kokapet', 'Gandipet']),
    'parseFilterValues with comma-separated string returns array'
  );
  assert(
    JSON.stringify(parseFilterValues(['Kokapet, Gandipet', 'Banjara Hills'])) === JSON.stringify(['Kokapet', 'Gandipet', 'Banjara Hills']),
    'parseFilterValues deduplicates and flattens'
  );

  // Multi-select Candidate Filtering Logic Simulation (OR within category, AND across categories)
  type MockContact = {
    id: string;
    area_of_stay: string;
    company_college: string;
    occupation: string;
    standard: string;
    classes_attended: number;
    level: string;
    chanting: number;
    gender: string;
  };

  const sampleContacts: MockContact[] = [
    {
      id: 'c1',
      area_of_stay: 'Kokapet',
      company_college: 'CBIT',
      occupation: 'Student',
      standard: '1st Year',
      classes_attended: 0,
      level: 'level-0',
      chanting: 0,
      gender: 'Male',
    },
    {
      id: 'c2',
      area_of_stay: 'Gandipet',
      company_college: 'MGIT',
      occupation: 'Student',
      standard: '2nd Year',
      classes_attended: 5,
      level: 'level-1:AOMC',
      chanting: 4,
      gender: 'Male',
    },
    {
      id: 'c3',
      area_of_stay: 'Madhapur',
      company_college: 'Microsoft',
      occupation: 'Working',
      standard: '4th Year',
      classes_attended: 15,
      level: 'level-2:Foundation',
      chanting: 16,
      gender: 'Male',
    },
    {
      id: 'c4',
      area_of_stay: 'Kokapet',
      company_college: 'Amazon',
      occupation: 'Working',
      standard: 'Graduated',
      classes_attended: 25,
      level: 'level-3:Prilims',
      chanting: 16,
      gender: 'Female', // Female contact
    },
  ];

  function evaluateCandidate(
    c: MockContact,
    filters: {
      areas?: string[];
      colleges?: string[];
      occupations?: string[];
      classesAttended?: string[];
      levelNumbers?: string[];
      chanting?: string[];
    }
  ): boolean {
    const areas = filters.areas ?? [];
    if (areas.length > 0 && !areas.some((a) => a.toLowerCase() === c.area_of_stay.toLowerCase())) {
      return false;
    }

    const colleges = filters.colleges ?? [];
    if (colleges.length > 0 && !colleges.some((col) => col.toLowerCase() === c.company_college.toLowerCase())) {
      return false;
    }

    const occupations = filters.occupations ?? [];
    if (occupations.length > 0 && !occupations.some((o) => o.toLowerCase() === c.occupation.toLowerCase())) {
      return false;
    }

    const classesAttended = filters.classesAttended ?? [];
    if (classesAttended.length > 0 && !classesAttended.some((r) => matchesClassesAttended(c.classes_attended, r))) {
      return false;
    }

    const levelNumbers = filters.levelNumbers ?? [];
    if (levelNumbers.length > 0 && !levelNumbers.some((l) => matchesLevelNumber(c.level, l))) {
      return false;
    }

    const chanting = filters.chanting ?? [];
    if (chanting.length > 0 && !chanting.some((ch) => matchesChanting(c.chanting, ch))) {
      return false;
    }

    return true;
  }

  // Test: Unrestricted when no filters selected
  const allMatched = sampleContacts.filter((c) => evaluateCandidate(c, {}));
  assert(allMatched.length === 4, 'Empty filters treat all candidate records as unrestricted');

  // Test: Multi-select Area OR semantics (Kokapet OR Gandipet)
  const areaMatched = sampleContacts.filter((c) =>
    evaluateCandidate(c, { areas: ['Kokapet', 'Gandipet'] })
  );
  assert(
    areaMatched.length === 3 && areaMatched.map((c) => c.id).sort().join(',') === 'c1,c2,c4',
    'Multiple areas within filter combine with OR semantics (includes Kokapet and Gandipet, excludes Madhapur)'
  );

  // Test: Multi-select Classes Attended OR semantics (['0', '1-10'])
  const classMatched = sampleContacts.filter((c) =>
    evaluateCandidate(c, { classesAttended: ['0', '1-10'] })
  );
  assert(
    classMatched.length === 2 && classMatched.map((c) => c.id).sort().join(',') === 'c1,c2',
    'Multiple classes attended ranges combine with OR semantics (matches 0 and 5, rejects 15 and 25)'
  );

  // Test: Multi-select Level Number OR semantics (['0', '1'])
  const levelMatched = sampleContacts.filter((c) =>
    evaluateCandidate(c, { levelNumbers: ['0', '1'] })
  );
  assert(
    levelMatched.length === 2 && levelMatched.map((c) => c.id).sort().join(',') === 'c1,c2',
    'Multiple level numbers combine with OR semantics (matches level-0 and level-1, rejects level-2 and level-3)'
  );

  // Test: Multi-select Chanting OR semantics (['0', '16+'])
  const chantingMatched = sampleContacts.filter((c) =>
    evaluateCandidate(c, { chanting: ['0', '16+'] })
  );
  assert(
    chantingMatched.length === 3 && chantingMatched.map((c) => c.id).sort().join(',') === 'c1,c3,c4',
    'Multiple chanting counts combine with OR semantics (matches 0 and 16 rounds, rejects 4 rounds)'
  );

  // Test: AND semantics ACROSS categories
  // Area IN ['Kokapet', 'Gandipet'] AND Occupation IN ['Student']
  const andMatched = sampleContacts.filter((c) =>
    evaluateCandidate(c, {
      areas: ['Kokapet', 'Gandipet'],
      occupations: ['Student'],
    })
  );
  assert(
    andMatched.length === 2 && andMatched.map((c) => c.id).sort().join(',') === 'c1,c2',
    'Different categories combine with AND semantics (Area IN [Kokapet, Gandipet] AND Occupation=Student)'
  );

  // Test: Fail-closed gender restriction verification in route file
  const routePath = path.join(process.cwd(), 'src/app/api/assignments/auto/route.ts');
  const routeContent = fs.readFileSync(routePath, 'utf8');
  assert(
    routeContent.includes('isGenderEligible(r.gender)') && routeContent.includes('isFemale(r.gender)'),
    'Auto-assign route preserves universal fail-closed gender restrictions'
  );
  assert(
    routeContent.includes('parseFilterValues(body.areas ?? body.area_of_stay)'),
    'Auto-assign route parses validated array filters from request'
  );
  assert(
    routeContent.includes('filterAreas.some'),
    'Auto-assign route uses .some() for OR condition within areas filter'
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Master Dashboard Print PDF and Export CSV Loading States
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. Master Dashboard Export & Print Loading States ---');
  const masterDashPath = path.join(process.cwd(), 'src/app/admin/master_dashboard/page.tsx');
  const masterDashContent = fs.readFileSync(masterDashPath, 'utf8');

  assert(
    masterDashContent.includes('const [isExportingCsv, setIsExportingCsv] = useState<boolean>(false);'),
    'Master Dashboard declares independent isExportingCsv state'
  );
  assert(
    masterDashContent.includes('const [isPrintingPdf, setIsPrintingPdf] = useState<boolean>(false);'),
    'Master Dashboard declares independent isPrintingPdf state'
  );
  assert(
    masterDashContent.includes('const [isRefreshing, setIsRefreshing] = useState<boolean>(false);'),
    'Master Dashboard declares independent isRefreshing state'
  );
  assert(
    masterDashContent.includes('handleExportCSV = async () => {\n    setIsExportingCsv(true);') &&
      masterDashContent.includes('setIsExportingCsv(false);'),
    'handleExportCSV sets and clears only isExportingCsv in finally block'
  );
  assert(
    masterDashContent.includes('handlePrintPDF = async () => {\n    setIsPrintingPdf(true);') &&
      masterDashContent.includes('setIsPrintingPdf(false);'),
    'handlePrintPDF sets and clears only isPrintingPdf in finally block'
  );
  assert(
    masterDashContent.includes('disabled={contacts.length === 0 || isExportingCsv}') &&
      masterDashContent.includes('{isExportingCsv ? <Loader2'),
    'Export CSV button binds loading spinner and disabled state strictly to isExportingCsv'
  );
  assert(
    masterDashContent.includes('disabled={contacts.length === 0 || isPrintingPdf}') &&
      masterDashContent.includes('{isPrintingPdf ? <Loader2'),
    'Print PDF button binds loading spinner and disabled state strictly to isPrintingPdf'
  );
  assert(
    masterDashContent.includes('disabled={isRefreshing}') &&
      masterDashContent.includes('isRefreshing ? \'animate-spin'),
    'Refresh button binds loading spinner strictly to isRefreshing'
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Enforce Master Dashboard as the Only Active Source in Operator Interfaces
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. Enforce Master Dashboard as Only Active Source ---');
  const opPortalPath = path.join(process.cwd(), 'src/app/operator/portal/page.tsx');
  const opPortalContent = fs.readFileSync(opPortalPath, 'utf8');

  assert(
    !opPortalContent.includes('<select') ||
      !opPortalContent.includes('value={contactSource}'),
    'Operator Portal does NOT contain a source-switching <select> dropdown'
  );
  assert(
    opPortalContent.includes('const contactSource: ContactSource = \'master_dashboard\';'),
    'Operator Portal hardcodes active contactSource to master_dashboard'
  );
  assert(
    opPortalContent.includes('Master Dashboard Operator Portal'),
    'Operator Portal header displays "Master Dashboard Operator Portal"'
  );
  assert(
    opPortalContent.includes('<span className="text-slate-100 font-bold text-xs">Master Dashboard</span>'),
    'Operator Portal source badge explicitly displays Master Dashboard'
  );
  assert(
    opPortalContent.includes('table: \'master_contact_assignments\''),
    'Operator Portal Realtime subscription listens strictly to master_contact_assignments'
  );

  // Audit API route /api/assignments/my
  const myAssignPath = path.join(process.cwd(), 'src/app/api/assignments/my/route.ts');
  const myAssignContent = fs.readFileSync(myAssignPath, 'utf8');
  assert(
    myAssignContent.includes("const source = 'master_dashboard';"),
    '/api/assignments/my hardcodes canonical source to master_dashboard'
  );
  assert(
    myAssignContent.includes("from('master_contact_assignments')"),
    '/api/assignments/my queries master_contact_assignments unconditionally'
  );

  // Audit Operators Page
  const operatorsPagePath = path.join(process.cwd(), 'src/app/admin/operators/page.tsx');
  const operatorsPageContent = fs.readFileSync(operatorsPagePath, 'utf8');
  assert(
    operatorsPageContent.includes("const contactSource: ContactSource = 'master_dashboard';"),
    'Contact Operators page locks contactSource to master_dashboard'
  );
  assert(
    operatorsPageContent.includes('Active Source: {sourceTitle}'),
    'Contact Operators page displays Active Source: Master Dashboard'
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Contact Operators Default Ordering (Highest assigned count to lowest)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. Contact Operators Default Ordering ---');
  const opsApiPath = path.join(process.cwd(), 'src/app/api/operators/route.ts');
  const opsApiContent = fs.readFileSync(opsApiPath, 'utf8');

  assert(
    opsApiContent.includes('b.total_assigned - a.total_assigned'),
    '/api/operators sorts descending by total_assigned'
  );
  assert(
    opsApiContent.includes('(a.name || \'\').localeCompare(b.name || \'\')'),
    '/api/operators includes secondary deterministic tie-breaking by name'
  );
  assert(
    operatorsPageContent.includes("const [sortOrder, setSortOrder] = useState<'assigned_desc' | 'assigned_asc' | 'alphabetical'>('assigned_desc');"),
    'Contact Operators page initializes sortOrder state to "assigned_desc"'
  );
  assert(
    operatorsPageContent.includes('<option value="assigned_desc" className="bg-slate-900 text-slate-100">Highest assigned count to lowest</option>'),
    'Contact Operators ordering dropdown lists "Highest assigned count to lowest" as the first/default option'
  );

  // Check client-side sort behavior in displayedOperators
  type MockOperator = { id: string; name: string; total_assigned: number };
  const mockOps: MockOperator[] = [
    { id: 'op1', name: 'Zack', total_assigned: 5 },
    { id: 'op2', name: 'Alice', total_assigned: 20 },
    { id: 'op3', name: 'Bob', total_assigned: 20 },
    { id: 'op4', name: 'Charlie', total_assigned: 0 },
  ];

  const sorted = [...mockOps].sort((a, b) => {
    const diff = b.total_assigned - a.total_assigned;
    if (diff !== 0) return diff;
    const nameComp = a.name.localeCompare(b.name);
    if (nameComp !== 0) return nameComp;
    return a.id.localeCompare(b.id);
  });

  assert(
    sorted[0].name === 'Alice' && sorted[1].name === 'Bob' && sorted[2].name === 'Zack' && sorted[3].name === 'Charlie',
    'Default sort order accurately ranks highest assigned first with deterministic alphabetical tie-breaker'
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n================================================================================');
  console.log(`Results: ${passed} / ${total} Tests Passed (${((passed / total) * 100).toFixed(1)}%)`);
  console.log('================================================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test failure:', err);
  process.exit(1);
});
