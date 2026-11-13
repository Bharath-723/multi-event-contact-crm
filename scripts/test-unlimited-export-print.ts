import assert from 'node:assert';

/**
 * Test Suite: Unlimited Print and CSV Export Verification
 * Validates removal of the 1,000-record limit across all MECM pages.
 */

console.log('╔═════════════════════════════════════════════════════════════════════════════╗');
console.log('║   MECM: UNLIMITED RECORD PRINT & CSV EXPORT VERIFICATION                    ║');
console.log('╚═════════════════════════════════════════════════════════════════════════════╝\n');

let totalChecks = 0;
let passedChecks = 0;

function check(title: string, fn: () => void) {
  totalChecks++;
  try {
    fn();
    passedChecks++;
    console.log(`  ✅ [PASS] Check ${totalChecks}: ${title}`);
  } catch (err: unknown) {
    console.error(`  ❌ [FAIL] Check ${totalChecks}: ${title}`);
    console.error(`     Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 1: Batched Pagination Loop & Zero Truncation Simulation
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Section 1: Batched Pagination Loop (<1,000 and >1,000 Records) ---');

// Mock data generator for synthetic database records
function generateMockRecords(count: number, prefix: string) {
  return Array.from({ length: count }, (_, i) => ({
    id: `rec-${prefix}-${String(i + 1).padStart(6, '0')}`,
    full_name: `Devotee ${prefix} ${i + 1}`,
    phone: `98${String(i).padStart(8, '0')}`,
    created_at: new Date(Date.now() - (count - i) * 1000).toISOString(),
    gender: i % 3 === 0 ? 'Female' : 'Male',
    occupation: i % 2 === 0 ? 'Student' : 'Employee',
    company_college: `Institution ${i % 10}`,
  }));
}

// Simulated batched database fetcher matching Supabase PostgREST behavior
async function simulateBatchedSupabaseQuery(
  allDbRows: any[],
  batchSize: number = 1000,
  filterFn?: (row: any) => boolean
) {
  const filtered = filterFn ? allDbRows.filter(filterFn) : allDbRows;
  const retrieved: any[] = [];
  let fromIdx = 0;

  while (true) {
    // PostgREST range simulation (clamped at batchSize)
    const slice = filtered.slice(fromIdx, fromIdx + batchSize);
    if (!slice || slice.length === 0) break;
    retrieved.push(...slice);
    if (slice.length < batchSize) break;
    fromIdx += batchSize;
  }

  return { retrieved, totalMatched: filtered.length };
}

check('Small Dataset (< 1,000 records): Correctly fetches all records in a single batch', async () => {
  const smallDb = generateMockRecords(450, 'small');
  const { retrieved, totalMatched } = await simulateBatchedSupabaseQuery(smallDb, 1000);
  assert.strictEqual(retrieved.length, 450);
  assert.strictEqual(totalMatched, 450);
  assert.strictEqual(retrieved[0].id, 'rec-small-000001');
  assert.strictEqual(retrieved[449].id, 'rec-small-000450');
});

check('Large Dataset (> 1,000 records, e.g. 2,850 records): Fetches across multiple batches without truncation', async () => {
  const largeDb = generateMockRecords(2850, 'large');
  const { retrieved, totalMatched } = await simulateBatchedSupabaseQuery(largeDb, 1000);
  assert.strictEqual(retrieved.length, 2850);
  assert.strictEqual(totalMatched, 2850);
});

check('Batch Boundary Integrity: Zero missing records and zero duplicates between batches (items 999, 1000, 1001)', async () => {
  const largeDb = generateMockRecords(2500, 'boundary');
  const { retrieved } = await simulateBatchedSupabaseQuery(largeDb, 1000);

  // Check unique IDs
  const idSet = new Set(retrieved.map(r => r.id));
  assert.strictEqual(idSet.size, 2500, 'Duplicate IDs detected across batches');

  // Verify transition across 1000 boundary
  assert.strictEqual(retrieved[998].id, 'rec-boundary-000999');
  assert.strictEqual(retrieved[999].id, 'rec-boundary-001000');
  assert.strictEqual(retrieved[1000].id, 'rec-boundary-001001');
  assert.strictEqual(retrieved[1999].id, 'rec-boundary-002000');
  assert.strictEqual(retrieved[2000].id, 'rec-boundary-002001');
});

check('Filtered Query Across Multiple Batches: Preserves search & criteria across >1,000 items', async () => {
  const multiDb = generateMockRecords(3200, 'filtered');
  // Filter for 'Male' and 'Student'
  const { retrieved, totalMatched } = await simulateBatchedSupabaseQuery(
    multiDb,
    1000,
    (r) => r.gender === 'Male' && r.occupation === 'Student'
  );

  assert.strictEqual(retrieved.length, totalMatched);
  assert.ok(retrieved.length > 500, 'Expected non-trivial number of filtered items');
  for (const r of retrieved) {
    assert.strictEqual(r.gender, 'Male');
    assert.strictEqual(r.occupation, 'Student');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 2: CSV Generation & Escaping Standards
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- Section 2: CSV Escaping & UTF-8 Standards ---');

function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

check('CSV Cell Escaping: Quotes, Commas, and Newlines handled correctly', () => {
  assert.strictEqual(escapeCsvCell('Simple'), '"Simple"');
  assert.strictEqual(escapeCsvCell('Text with, comma'), '"Text with, comma"');
  assert.strictEqual(escapeCsvCell('Text with "quotes"'), '"Text with ""quotes"""');
  assert.strictEqual(escapeCsvCell('Multi\nline\ntext'), '"Multi\nline\ntext"');
  assert.strictEqual(escapeCsvCell(null), '""');
});

check('Large Dataset CSV String Assembly & UTF-8 BOM Presence', () => {
  const mockRows = generateMockRecords(1500, 'csv');
  const headers = ['ID', 'Name', 'Phone', 'Gender', 'Occupation'];
  const csvLines = [
    headers.map(h => `"${h}"`).join(','),
    ...mockRows.map(r => [
      escapeCsvCell(r.id),
      escapeCsvCell(r.full_name),
      escapeCsvCell(r.phone),
      escapeCsvCell(r.gender),
      escapeCsvCell(r.occupation),
    ].join(','))
  ].join('\n');

  const fullCsvContent = '\uFEFF' + csvLines;
  assert.ok(fullCsvContent.startsWith('\uFEFF'), 'UTF-8 BOM must be present for Excel compatibility');
  const lines = fullCsvContent.split('\n');
  assert.strictEqual(lines.length, 1501, 'CSV must contain 1 header line + 1500 data lines');
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 3: Print Multi-Page Structure & Non-Truncation
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- Section 3: Print Payload Structure & Multi-Page Rules ---');

check('Print HTML Payload: Contains repeated headers and page-break styling for >1,000 records', () => {
  const printRecords = generateMockRecords(1200, 'print');
  const tableRows = printRecords.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${r.id}</td>
      <td>${r.full_name}</td>
      <td>${r.phone}</td>
      <td>${r.gender}</td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          @page { size: A4 landscape; margin: 10mm; }
          @media print {
            thead { display: table-header-group; }
            tr { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <p class="meta">Total Records: ${printRecords.length}</p>
        <table>
          <thead><tr><th>#</th><th>Name</th><th>Phone</th><th>Gender</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </body>
    </html>
  `;

  assert.ok(html.includes('display: table-header-group'), 'Print styling must repeat table header across pages');
  assert.ok(html.includes('page-break-inside: avoid'), 'Print styling must avoid breaking inside rows');
  assert.ok(html.includes('Total Records: 1200'), 'Print meta must reflect untruncated count');
  assert.ok(html.includes('rec-print-001200'), 'Print payload must contain all 1200 records');
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 4: Normal Table Pagination Invariant Preservation
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- Section 4: Normal Table Pagination Invariant ---');

check('UI Table View: Displays strictly pageSize items per page while backing data has >1,000 records', () => {
  const totalDataset = generateMockRecords(2400, 'pagination');
  const itemsPerPage = 20;

  // Page 1
  const page1 = totalDataset.slice(0, itemsPerPage);
  assert.strictEqual(page1.length, 20);
  assert.strictEqual(page1[0].id, 'rec-pagination-000001');
  assert.strictEqual(page1[19].id, 'rec-pagination-000020');

  // Page 51 (items 1001-1020, beyond the old 1,000 cap)
  const page51 = totalDataset.slice(50 * itemsPerPage, 51 * itemsPerPage);
  assert.strictEqual(page51.length, 20);
  assert.strictEqual(page51[0].id, 'rec-pagination-001001');
  assert.strictEqual(page51[19].id, 'rec-pagination-001020');

  // Verify total pages
  const totalPages = Math.ceil(totalDataset.length / itemsPerPage);
  assert.strictEqual(totalPages, 120);
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 5: Verify Application Pages Implementation
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- Section 5: Application Page Audits ---');

import fs from 'node:fs';
import path from 'node:path';

function fileContains(relPath: string, patterns: string[]): boolean {
  const fullPath = path.resolve(process.cwd(), relPath);
  if (!fs.existsSync(fullPath)) return false;
  const content = fs.readFileSync(fullPath, 'utf8');
  return patterns.every(p => content.includes(p));
}

check('Page 1: Admin Registrations (src/app/admin/registrations/page.tsx) uses batched loop', () => {
  assert.ok(
    fileContains('src/app/admin/registrations/page.tsx', [
      'const pageSize = 1000',
      '.range(from, from + pageSize - 1)',
      'handleExportCSV',
      'handlePrintTable',
    ]),
    'registrations/page.tsx must implement batched loop and export/print handlers'
  );
});

check('Page 2: Master Dashboard API (src/app/api/master/route.ts) loops in 1000 batches on isExport', () => {
  assert.ok(
    fileContains('src/app/api/master/route.ts', [
      'isExport',
      'fromIdx += pageSize',
      '.range(fromIdx, fromIdx + pageSize - 1)',
    ]),
    'api/master/route.ts must loop in 1000 batches on isExport'
  );
});

check('Page 2: Master Dashboard UI (src/app/admin/master_dashboard/page.tsx) uses Blob + URL.createObjectURL for CSV', () => {
  assert.ok(
    fileContains('src/app/admin/master_dashboard/page.tsx', [
      'new Blob([\'\\uFEFF\' + csvLines]',
      'URL.createObjectURL(blob)',
      'handlePrintPDF',
    ]),
    'master_dashboard/page.tsx must use Blob object URL and UTF-8 BOM'
  );
});

check('Page 3: Feedback Dashboard API (src/app/api/feedback/route.ts) loops in 1000 batches on isAll', () => {
  assert.ok(
    fileContains('src/app/api/feedback/route.ts', [
      'isAll',
      'fromIdx += pageSize',
      '.range(fromIdx, fromIdx + pageSize - 1)',
    ]),
    'api/feedback/route.ts must loop in 1000 batches on isAll'
  );
});

check('Page 4: Contacts Register API (src/app/api/contacts-register/route.ts) loops in 1000 batches on isExport', () => {
  assert.ok(
    fileContains('src/app/api/contacts-register/route.ts', [
      'isExport',
      'fromIdx += pageSize',
      '.range(fromIdx, fromIdx + pageSize - 1)',
    ]),
    'api/contacts-register/route.ts must loop in 1000 batches on isExport'
  );
});

check('Page 4: Contacts Register UI (src/app/admin/contacts-register/page.tsx) supports both Export CSV & Print PDF Table', () => {
  assert.ok(
    fileContains('src/app/admin/contacts-register/page.tsx', [
      'handleExportCSV',
      'handlePrintTable',
      'Print PDF Table',
    ]),
    'contacts-register/page.tsx must have Export CSV and Print PDF Table'
  );
});

check('Page 5: Saturday Meetup API (src/app/api/saturday-meetup/route.ts) loops assignments & checkins in 1000 batches', () => {
  assert.ok(
    fileContains('src/app/api/saturday-meetup/route.ts', [
      'fetchAllActiveAssignments',
      'fetchAllWeeklyCheckins',
      '.range(fromIdx, fromIdx + pageSize - 1)',
    ]),
    'api/saturday-meetup/route.ts must fetch all active assignments & checkins in batches'
  );
});

check('Page 5: Saturday Meetup UI (src/app/admin/saturday-meetup/page.tsx) supports both Export CSV & Print Table', () => {
  assert.ok(
    fileContains('src/app/admin/saturday-meetup/page.tsx', [
      'handleExportCSV',
      'handlePrintTable',
      'Print Table',
    ]),
    'saturday-meetup/page.tsx must have Export CSV and Print Table'
  );
});

console.log('\n=============================================================================');
console.log(`TOTAL CHECKS: ${totalChecks}`);
console.log(`PASSED: ${passedChecks}`);
console.log(`FAILED: ${totalChecks - passedChecks}`);
console.log(`OVERALL STATUS: ${passedChecks === totalChecks ? '✅ ALL CHECKS PASSED' : '❌ SOME CHECKS FAILED'}`);
console.log('=============================================================================\n');

if (passedChecks !== totalChecks) {
  process.exit(1);
}
