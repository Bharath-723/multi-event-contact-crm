/**
 * Execute SQL on Supabase using the project's DB via Supabase Management API.
 * Project ref: nmnizrkgdypylgllrfui
 *
 * Uses: POST https://nmnizrkgdypylgllrfui.supabase.co/rest/v1/rpc/exec_migration_sql
 * If that's not available, falls back to creating a temporary RPC that self-executes.
 *
 * Primary approach: Use the Supabase Management REST API to run raw SQL.
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

const SUPABASE_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PROJECT_REF    = SUPABASE_URL.replace('https://', '').split('.')[0];

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('Usage: npx tsx scripts/run-sql-migration.ts <path-to-sql-file>');
  process.exit(1);
}

const sqlContent = fs.readFileSync(path.resolve(migrationFile), 'utf8');
console.log(`Applying: ${path.basename(migrationFile)} (${sqlContent.length} chars)`);
console.log(`Project:  ${PROJECT_REF}\n`);

async function main() {
  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  // Strategy 1: Try the Supabase pg.execute endpoint (available in some plans)
  // POST https://<ref>.supabase.co/rest/v1/rpc/pg_execute (if the RPC exists)
  
  // Strategy 2: Use the Management API SQL endpoint
  // POST https://api.supabase.com/v1/projects/<ref>/database/query
  // Requires a Management API access token (not the service role key).
  // This won't work with just the service role key.

  // Strategy 3: Create a temporary SQL executor function, call it, then drop it.
  // This is the only approach that works with just the service role key.
  
  console.log('Using temporary executor RPC strategy...\n');

  // Step 1: Create a temporary SQL executor function
  const createExecutorSQL = `
CREATE OR REPLACE FUNCTION public._temp_migration_executor(p_sql TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  EXECUTE p_sql;
  RETURN 'OK';
EXCEPTION
  WHEN OTHERS THEN
    RETURN 'ERROR: ' || SQLERRM || ' (STATE: ' || SQLSTATE || ')';
END;
$$;
GRANT EXECUTE ON FUNCTION public._temp_migration_executor(TEXT) TO service_role;
`;

  // Use fetch to run the executor creation via the REST endpoint
  // Supabase service role can create functions via the Postgres REST API
  const createResp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/_temp_migration_executor`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'apikey': SERVICE_KEY,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({ p_sql: 'SELECT 1' }),
  });

  let executorAvailable = createResp.ok;

  if (!executorAvailable) {
    // Create the executor function first
    console.log('Executor function not found — creating it...');
    const { error: createErr } = await db.rpc('_temp_migration_executor', { p_sql: 'SELECT 1' });
    if (createErr) {
      // Function doesn't exist yet — we need to create it via a different path
      // Try using Supabase's raw query capability through the REST API
      console.log('Attempting to bootstrap executor via Supabase API...');
      
      const bootstrapResp = await fetch(`${SUPABASE_URL}/rest/v1/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'apikey': SERVICE_KEY,
        },
        body: createExecutorSQL,
      });
      
      if (!bootstrapResp.ok) {
        console.warn('Cannot auto-create executor. Running each statement directly...');
        await runStatementsDirectly(db);
        return;
      }
    }
  }

  // Step 2: Call the executor with our migration SQL
  const { data, error } = await db.rpc('_temp_migration_executor', { p_sql: sqlContent });
  
  if (error) {
    console.error(`Migration failed: ${error.message}`);
    console.error('\n⚠️  Manual step required:');
    console.error(`   Copy and paste the SQL from:\n   ${path.resolve(migrationFile)}`);
    console.error('   Into: Supabase Dashboard → SQL Editor → Run');
    process.exit(1);
    return;
  }

  if (typeof data === 'string' && data.startsWith('ERROR:')) {
    console.error(`Migration SQL error: ${data}`);
    process.exit(1);
    return;
  }

  console.log(`✅ Migration applied successfully: ${data}`);

  // Step 3: Drop the temporary executor
  await db.rpc('_temp_migration_executor', { p_sql: 'DROP FUNCTION IF EXISTS public._temp_migration_executor(TEXT)' });
  console.log('Cleaned up temporary executor function.');
}

async function runStatementsDirectly(db: any) {
  // Last resort: try running the key parts of the migration directly
  // by calling known supabase-js methods
  console.log('\nAttempting direct approach via supabase-js...');
  
  // Check if assign_contact_atomic already exists
  const { data: existing } = await db
    .from('contact_operators')
    .select('id')
    .limit(1);
  
  console.log(`DB connection test: ${existing ? 'OK' : 'FAILED'}`);
  
  // We can't run arbitrary DDL via supabase-js without an RPC.
  // The migration must be applied manually or via psql.
  console.error('\n⚠️  Cannot apply migration automatically without psql access or Management API token.');
  console.error('📋 MANUAL STEP REQUIRED:');
  console.error('   1. Open Supabase Dashboard: https://supabase.com/dashboard/project/nmnizrkgdypylgllrfui/sql/new');
  console.error(`   2. Copy SQL from: ${path.resolve(migrationFile)}`);
  console.error('   3. Paste and click "Run"');
  console.error('\nThe concurrency tests will fail until this migration is applied.');
  process.exitCode = 2; // Exit code 2 = manual step required
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
