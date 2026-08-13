const { Client } = require('pg');

const pass = 'Harekrishna@123';
const host = 'aws-0-ap-south-1.pooler.supabase.com';

const testCases = [
  { name: 'Case 1 (port 5432, user postgres.nmnizrkgdypylgllrfui)', port: 5432, user: 'postgres.nmnizrkgdypylgllrfui', db: 'postgres' },
  { name: 'Case 2 (port 6543, user postgres.nmnizrkgdypylgllrfui)', port: 6543, user: 'postgres.nmnizrkgdypylgllrfui', db: 'postgres' },
  { name: 'Case 3 (port 5432, user postgres, db postgres)', port: 5432, user: 'postgres', db: 'postgres' },
  { name: 'Case 4 (port 6543, user postgres, db postgres)', port: 6543, user: 'postgres', db: 'postgres' },
  { name: 'Case 5 (port 5432, user postgres.nmnizrkgdypylgllrfui, db postgres.nmnizrkgdypylgllrfui)', port: 5432, user: 'postgres.nmnizrkgdypylgllrfui', db: 'postgres.nmnizrkgdypylgllrfui' },
  { name: 'Case 6 (port 5432, user postgres, options project)', port: 5432, user: 'postgres', db: 'postgres', options: '-c project=nmnizrkgdypylgllrfui' },
  { name: 'Case 7 (port 6543, user postgres, options project)', port: 6543, user: 'postgres', db: 'postgres', options: '-c project=nmnizrkgdypylgllrfui' },
];

async function testMumbaiPooler() {
  console.log('Testing Mumbai pooler (aws-0-ap-south-1.pooler.supabase.com) formats...\n');

  for (const c of testCases) {
    console.log(`Testing ${c.name}...`);
    const client = new Client({
      host,
      port: c.port,
      user: c.user,
      password: pass,
      database: c.db,
      options: c.options,
      ssl: { rejectUnauthorized: false, servername: 'db.nmnizrkgdypylgllrfui.supabase.co' },
      connectionTimeoutMillis: 4000
    });

    try {
      await client.connect();
      console.log(`\n🎉🎉🎉 BOOM! SUCCESS ON ${c.name}! 🎉🎉🎉`);
      const res = await client.query('SELECT current_database(), version();');
      console.log('DB Info:', res.rows[0]);
      await client.end();
      return c;
    } catch (e) {
      console.log(`  ❌ ${c.name} -> ${e.message}`);
    }
  }
}

testMumbaiPooler();
