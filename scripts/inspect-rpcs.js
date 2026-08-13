const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] ? match[2].trim() : '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    env[match[1]] = value;
  }
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function inspectRpcs() {
  console.log('Inspecting RPC function signatures...');
  const funcs = [
    'rls_auto_enable',
    'get_contact_module_summary',
    'assign_operator_to_registration',
    'get_operator_stats',
    'assign_operator_to_feedback_contact',
    'mark_all_notifications_read',
    'register_volunteer'
  ];

  for (const f of funcs) {
    try {
      const { data, error } = await supabase.rpc(f, {});
      console.log(`RPC [${f}]:`, error ? `error: ${error.message}` : 'success');
    } catch (e) {
      console.log(`RPC [${f}] exception:`, e.message);
    }
  }
}

inspectRpcs();
