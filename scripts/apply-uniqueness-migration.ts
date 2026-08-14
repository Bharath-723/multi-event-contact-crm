import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      process.env[key] = value.trim();
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing Supabase env vars');
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

async function main() {
  console.log('=== Checking and Applying Database Uniqueness Indexes ===');

  const sqlStatements = [
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_contact_assignments_active_reg ON public.contact_assignments(registration_id) WHERE is_active = TRUE;`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_krishnashtami_assignments_active_reg ON public.krishnashtami_contact_assignments(registration_id) WHERE is_active = TRUE;`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_feedback_assignments_active_contact ON public.feedback_contact_assignments(feedback_contact_id) WHERE is_active = TRUE;`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_krishnashtami_visitor_visits_reg ON public.krishnashtami_visitor_visits(registration_id);`
  ];

  for (const sql of sqlStatements) {
    try {
      const { error } = await supabaseAdmin.rpc('exec_sql', { sql });
      if (error) {
        console.warn('RPC exec_sql warning/error for:', sql, error.message);
      } else {
        console.log('Successfully executed:', sql);
      }
    } catch (e) {
      console.error('Exception executing SQL:', e);
    }
  }

  console.log('=== Migration Execution Complete ===');
}

main();
