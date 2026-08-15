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

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

async function inspectAkhil() {
  const { data } = await supabaseAdmin
    .from('contact_assignments')
    .select('id, registration_id, status, assigned_at, created_at')
    .eq('operator_id', '954aaa39-8e34-4d3d-9ec5-fd9268173bca')
    .eq('is_active', true)
    .order('assigned_at', { ascending: true });

  console.log(`Akhil total active assignments in Rathayatra: ${data?.length}`);
  if (data) {
    console.log('Oldest 3 assignments:', data.slice(0, 3));
    console.log('Newest 3 assignments:', data.slice(-3));
    console.log('Status breakdown for Akhil:', 
      data.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {} as Record<string, number>)
    );
  }
}

inspectAkhil();
