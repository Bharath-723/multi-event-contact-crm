const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envLocalPath = path.join(__dirname, '..', '.env.local');
const envLocal = fs.readFileSync(envLocalPath, 'utf8');
const env = {};
envLocal.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    env[match[1]] = (match[2] || '').trim().replace(/^['"]|['"]$/g, '');
  }
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error: qErr } = await supabase
    .from('contact_assignments')
    .select(`
      id, registration_id, operator_id,
      contact_operators!operator_id (id, name),
      registrations!registration_id (*)
    `);
  if (qErr) console.error("Query Error:", qErr);
  else console.log("Query Result:", JSON.stringify(data, null, 2));
}

run();
