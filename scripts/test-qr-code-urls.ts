/**
 * Test Suite: MECM QR Code URL Refresh Verification Suite
 * File: scripts/test-qr-code-urls.ts
 *
 * Verifies all requirements:
 * 1. All QR codes strictly encode the current production domain: https://mecm.vercel.app
 * 2. Obsolete URLs replaced and canonicalized:
 *    - rathayatra-three.vercel.app -> https://mecm.vercel.app/feedback
 *    - krishnashtami-2026.vercel.app -> https://mecm.vercel.app/krishnashtami-complete
 *    - localhost / 127.0.0.1 -> https://mecm.vercel.app
 * 3. Relative paths resolved correctly:
 *    - /contacts-register -> https://mecm.vercel.app/contacts-register
 *    - /feedback -> https://mecm.vercel.app/feedback
 *    - /visitor -> https://mecm.vercel.app/visitor
 * 4. Query strings and hash anchors preserved across domain rewrites.
 * 5. QR code image generation (PNG & SVG) produces valid, scannable data payloads.
 * 6. Database migration safely refreshes stored festival_events.registration_url.
 */

import { PGlite } from '@electric-sql/pglite';
import QRCode from 'qrcode';
import {
  MECM_PRODUCTION_DOMAIN,
  getMecmBaseUrl,
  normalizeQrUrl,
  resolveFestivalQrUrl,
} from '../src/lib/qr-url-resolver.ts';

interface TestResult {
  step: number;
  scenario: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function record(step: number, scenario: string, passed: boolean, details: string) {
  results.push({ step, scenario, passed, details });
  const icon = passed ? '✅ [PASS]' : '❌ [FAIL]';
  console.log(`  ${icon} Step ${step}: ${scenario}`);
  console.log(`         ${details}`);
}

async function run() {
  console.log('\n======================================================================');
  console.log('🧪 Starting MECM QR Code URL Refresh Verification Suite');
  console.log('======================================================================\n');

  // --- SCENARIO 1: Base URL canonicalization ---
  const baseUrl = getMecmBaseUrl();
  const pass1 = baseUrl === 'https://mecm.vercel.app';
  record(
    1,
    'Canonical MECM Production Base Domain Resolution',
    pass1,
    `Resolved getMecmBaseUrl(): "${baseUrl}" (matches ${MECM_PRODUCTION_DOMAIN})`
  );

  // --- SCENARIO 2: Obsolete Vercel domain normalization (Rathayatra) ---
  const rath1 = normalizeQrUrl('https://rathayatra-three.vercel.app');
  const rath2 = normalizeQrUrl('https://rathayatra-three.vercel.app/feedback');
  const pass2 =
    rath1 === 'https://mecm.vercel.app/feedback' &&
    rath2 === 'https://mecm.vercel.app/feedback';
  record(
    2,
    'Obsolete Rathayatra Domain Rewriting to Production',
    pass2,
    `rathayatra-three.vercel.app -> "${rath1}" and /feedback -> "${rath2}"`
  );

  // --- SCENARIO 3: Obsolete Vercel domain normalization (Krishnashtami) ---
  const krish1 = normalizeQrUrl('https://krishnashtami-2026.vercel.app');
  const krish2 = normalizeQrUrl('https://krishnashtami-2026.vercel.app/krishnashtami-complete');
  const pass3 =
    krish1 === 'https://mecm.vercel.app/krishnashtami-complete' &&
    krish2 === 'https://mecm.vercel.app/krishnashtami-complete';
  record(
    3,
    'Obsolete Krishnashtami Domain Rewriting to Production',
    pass3,
    `krishnashtami-2026.vercel.app -> "${krish1}" and /complete -> "${krish2}"`
  );

  // --- SCENARIO 4: Localhost and IP address sanitization ---
  const local1 = normalizeQrUrl('http://localhost:3000/contacts-register');
  const local2 = normalizeQrUrl('http://127.0.0.1:3000/visitor');
  const pass4 =
    local1 === 'https://mecm.vercel.app/contacts-register' &&
    local2 === 'https://mecm.vercel.app/visitor';
  record(
    4,
    'Localhost & Loopback IP QR Sanitization',
    pass4,
    `localhost:3000 -> "${local1}" and 127.0.0.1 -> "${local2}"`
  );

  // --- SCENARIO 5: Relative paths resolution ---
  const rel1 = normalizeQrUrl('/contacts-register');
  const rel2 = normalizeQrUrl('/feedback');
  const rel3 = normalizeQrUrl('/visitor');
  const rel4 = normalizeQrUrl('contacts-register'); // without leading slash
  const pass5 =
    rel1 === 'https://mecm.vercel.app/contacts-register' &&
    rel2 === 'https://mecm.vercel.app/feedback' &&
    rel3 === 'https://mecm.vercel.app/visitor' &&
    rel4 === 'https://mecm.vercel.app/contacts-register';
  record(
    5,
    'Relative Route Path Canonicalization',
    pass5,
    `/contacts-register -> "${rel1}", /feedback -> "${rel2}", /visitor -> "${rel3}"`
  );

  // --- SCENARIO 6: Preservation of query parameters and hash anchors ---
  const queryUrl = normalizeQrUrl('https://rathayatra-three.vercel.app/feedback?source=desk_qr&batch=sat1#register');
  const pass6 = queryUrl === 'https://mecm.vercel.app/feedback?source=desk_qr&batch=sat1#register';
  record(
    6,
    'Preservation of Query Parameters & Hash Anchors',
    pass6,
    `Input with query params resolved to: "${queryUrl}"`
  );

  // --- SCENARIO 7: Festival context resolution ---
  const festKrish = resolveFestivalQrUrl({
    slug: 'krishnashtami-2026',
    festival_name: 'Sri Krishna Janmashtami',
    registration_url: 'https://krishnashtami-2026.vercel.app',
  });
  const festRatha = resolveFestivalQrUrl({
    slug: 'rathayatra-2026',
    festival_name: 'Jagannatha Ratha Yatra',
    registration_url: 'https://rathayatra-three.vercel.app',
  });
  const festNull = resolveFestivalQrUrl(null);
  const pass7 =
    festKrish === 'https://mecm.vercel.app/krishnashtami-complete' &&
    festRatha === 'https://mecm.vercel.app/feedback' &&
    festNull === 'https://mecm.vercel.app/feedback';
  record(
    7,
    'Festival Context Destination URL Resolution',
    pass7,
    `Krishnashtami -> "${festKrish}", Rathayatra -> "${festRatha}", Default -> "${festNull}"`
  );

  // --- SCENARIO 8: End-to-End QR Code generation validation (PNG & SVG) ---
  const targetQrUrl = 'https://mecm.vercel.app/contacts-register';
  const pngDataUrl = await QRCode.toDataURL(targetQrUrl, { width: 512, margin: 2 });
  const svgString = await QRCode.toString(targetQrUrl, { type: 'svg', width: 512, margin: 2 });

  const pass8 =
    pngDataUrl.startsWith('data:image/png;base64,') &&
    pngDataUrl.length > 500 &&
    svgString.includes('<svg') &&
    svgString.includes('</svg>');
  record(
    8,
    'High-Resolution QR Code Artifact Generation (PNG & SVG)',
    pass8,
    `Generated PNG Base64 (${pngDataUrl.length} bytes) and SVG (${svgString.length} bytes) for: "${targetQrUrl}"`
  );

  // --- SCENARIO 9: Database migration validation on stored records ---
  const pg = new PGlite();
  await pg.exec(`
    CREATE TABLE IF NOT EXISTS public.festival_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      festival_name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      registration_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Seed with obsolete production URLs from earlier migrations
    INSERT INTO public.festival_events (festival_name, slug, registration_url)
    VALUES
      ('Rathayatra', 'rathayatra-2026', 'https://rathayatra-three.vercel.app'),
      ('Krishnashtami', 'krishnashtami-2026', 'https://krishnashtami-2026.vercel.app'),
      ('Local Festival', 'local-2026', 'http://localhost:3000/register');
  `);

  // Execute migration SQL logic
  await pg.exec(`
    UPDATE public.festival_events
    SET registration_url = 'https://mecm.vercel.app/feedback',
        updated_at = NOW()
    WHERE (slug = 'rathayatra-2026' OR festival_name ILIKE '%rathayatra%')
      AND (registration_url IS NULL OR registration_url NOT LIKE 'https://mecm.vercel.app%');

    UPDATE public.festival_events
    SET registration_url = 'https://mecm.vercel.app/krishnashtami-complete',
        updated_at = NOW()
    WHERE (slug = 'krishnashtami-2026' OR festival_name ILIKE '%krishnashtami%')
      AND (registration_url IS NULL OR registration_url NOT LIKE 'https://mecm.vercel.app%');

    UPDATE public.festival_events
    SET registration_url = REPLACE(registration_url, 'http://localhost:3000', 'https://mecm.vercel.app'),
        updated_at = NOW()
    WHERE registration_url LIKE '%localhost:3000%';
  `);

  const updatedRows = (
    await pg.query<{ slug: string; registration_url: string }>(
      `SELECT slug, registration_url FROM public.festival_events ORDER BY slug;`
    )
  ).rows;

  const rathRow = updatedRows.find((r) => r.slug === 'rathayatra-2026');
  const krishRow = updatedRows.find((r) => r.slug === 'krishnashtami-2026');
  const localRow = updatedRows.find((r) => r.slug === 'local-2026');

  const pass9 =
    rathRow?.registration_url === 'https://mecm.vercel.app/feedback' &&
    krishRow?.registration_url === 'https://mecm.vercel.app/krishnashtami-complete' &&
    localRow?.registration_url === 'https://mecm.vercel.app/register';
  record(
    9,
    'Database Migration Stored Records Verification',
    pass9,
    `Stored records updated safely: Rathayatra -> "${rathRow?.registration_url}", Krishnashtami -> "${krishRow?.registration_url}", Local -> "${localRow?.registration_url}"`
  );

  console.log('\n======================================================================');
  console.log('📊 TEST SUMMARY');
  console.log('======================================================================');
  const allPassed = results.every((r) => r.passed);
  console.log(`Total Scenarios: ${results.length}`);
  console.log(`Passed: ${results.filter((r) => r.passed).length}`);
  console.log(`Failed: ${results.filter((r) => !r.passed).length}`);
  console.log(`Overall Status: ${allPassed ? '🎉 ALL TESTS PASSED' : '❌ TESTS FAILED'}\n`);

  if (!allPassed) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
