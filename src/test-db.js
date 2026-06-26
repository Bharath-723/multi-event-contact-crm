const { createClient } = require('@supabase/supabase-js');

// Load env variables manually from .env.local
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

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function testConnection() {
  console.log('Testing connection to Supabase URL:', env.NEXT_PUBLIC_SUPABASE_URL);
  
  const { data, error } = await supabase
    .from('volunteer_slots')
    .select('slot_time, display_order')
    .order('display_order');
    
  if (error) {
    console.log('\n❌ Table volunteer_slots does not exist or fetch failed:', error.message);
    console.log('Error details:', error);
  } else {
    console.log('\n✅ Table volunteer_slots exists! Seeded slots:');
    console.log(data);
  }
}

testConnection();
