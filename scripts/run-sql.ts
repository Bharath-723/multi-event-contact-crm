/**
 * Apply SQL migration via Supabase Management API (pg_execute or direct SQL endpoint).
 * Uses the SUPABASE_DB_URL if available, otherwise falls back to the REST API.
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

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

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('Usage: npx tsx scripts/run-sql.ts <path-to-sql-file>');
  process.exit(1);
}

const sql = fs.readFileSync(path.resolve(migrationFile), 'utf8');

async function runSql() {
  // Use Supabase's pg REST endpoint to execute raw SQL
  // The endpoint is: POST https://<ref>.supabase.co/rest/v1/rpc/... (not available for raw SQL)
  // Instead, use the Supabase Admin API endpoint for running SQL
  const projectRef = SUPABASE_URL.replace('https://', '').split('.')[0];
  
  console.log(`Project ref: ${projectRef}`);
  console.log(`Migration: ${path.basename(migrationFile)}`);
  console.log(`SQL length: ${sql.length} characters\n`);

  // Use fetch to call Supabase's SQL query endpoint
  const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'apikey': SERVICE_KEY,
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!response.ok) {
    // Try the pg.query approach via a custom RPC
    // Fall back to running statements individually via supabase-js
    console.log('Direct SQL endpoint not available. Running via supabase-js rpc...');
    await runViaSplitStatements();
    return;
  }

  console.log('Migration applied successfully via REST API');
}

async function runViaSplitStatements() {
  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  // Split SQL into executable blocks (handle BEGIN/COMMIT as atomic)
  // The migration has a BEGIN...COMMIT block, so we try it as one call
  // via a DO block wrapper
  const wrappedSql = `DO $apply_migration$
BEGIN
  ${sql.replace(/^BEGIN;?$/m, '').replace(/^COMMIT;?$/m, '')}
END;
$apply_migration$;`;

  console.log('Attempting to apply migration as a DO block...');
  
  const { data, error } = await db.rpc('exec_sql', { p_sql: sql });
  
  if (error) {
    console.error(`RPC exec_sql failed: ${error.message}`);
    console.log('\nFalling back to Supabase management API...');
    await runViaMgmtApi();
    return;
  }
  
  console.log('Migration applied successfully:', data);
}

async function runViaMgmtApi() {
  const projectRef = SUPABASE_URL.replace('https://', '').split('.')[0];
  
  // Try the Supabase management API
  const mgmtApiUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
  
  console.log(`Trying management API: ${mgmtApiUrl}`);
  
  const response = await fetch(mgmtApiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`Management API failed (${response.status}): ${body}`);
    console.log('\n⚠️  Manual step required: Apply the migration SQL via Supabase Dashboard SQL Editor.');
    console.log(`File: ${path.resolve(migrationFile)}`);
    return;
  }

  const result = await response.json();
  console.log('Migration applied via management API:', JSON.stringify(result, null, 2));
}

runSql().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
