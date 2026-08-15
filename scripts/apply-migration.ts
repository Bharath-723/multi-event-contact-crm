/**
 * Apply a single SQL migration file directly to Supabase
 * via the service role key and raw SQL execution.
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

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing env vars');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY);

async function applyMigration(filePath: string) {
  const sql = fs.readFileSync(filePath, 'utf8');
  console.log(`Applying migration: ${path.basename(filePath)}`);
  console.log(`SQL length: ${sql.length} chars`);

  const { error } = await db.rpc('exec_sql', { sql_text: sql }).single();
  if (error) {
    // Try direct query approach via pg REST
    console.log('exec_sql RPC not available, trying direct approach...');
    // Split on semicolons and execute statement by statement
    const statements = sql
      .split(/;\s*\n/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const stmt of statements) {
      const { error: stmtErr } = await db.rpc('exec_sql', { query: stmt });
      if (stmtErr) {
        console.error(`Statement failed: ${stmtErr.message}`);
        console.error(`Statement: ${stmt.slice(0, 200)}`);
      }
    }
  } else {
    console.log('Migration applied successfully');
  }
}

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('Usage: npx tsx scripts/apply-migration.ts <path-to-migration.sql>');
  process.exit(1);
}

applyMigration(path.resolve(migrationFile));
