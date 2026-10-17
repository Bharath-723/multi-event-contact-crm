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

async function checkAllTablesForLevel() {
  const { supabaseAdmin } = await import('../src/lib/supabase-admin');
  const tables = [
    'registrations',
    'krishnashtami_registrations',
    'feedback_contacts',
    'contacts_register',
    'master_contacts',
    'contact_assignments',
    'krishnashtami_contact_assignments',
    'feedback_contact_assignments',
    'master_contact_assignments',
    'contact_operators',
    'services',
    'visitor_visits',
    'krishnashtami_visitor_visits'
  ];

  for (const t of tables) {
    const { data, error } = await supabaseAdmin.from(t).select('*').limit(1);
    if (data && data[0]) {
      const allCols = Object.keys(data[0]);
      const levelCols = allCols.filter(k => k.toLowerCase().includes('level'));
      console.log(`Table "${t}": total ${allCols.length} columns, level columns: ${JSON.stringify(levelCols)}`);
    } else if (error) {
      console.log(`Table "${t}": error (${error.message})`);
    } else {
      console.log(`Table "${t}": 0 rows`);
    }
  }
}

checkAllTablesForLevel().catch(console.error);
