const { Client } = require('pg');

const hosts = [
  'db.nmnizrkgdypylgllrfui.supabase.co',
  'aws-0-ap-south-1.pooler.supabase.com',
  'aws-0-us-east-1.pooler.supabase.com'
];

async function testConnection() {
  for (const host of hosts) {
    console.log(`Testing connection to: ${host}`);
    const client = new Client({
      host,
      port: host.includes('pooler') ? 6543 : 5432,
      user: host.includes('pooler') ? 'postgres.nmnizrkgdypylgllrfui' : 'postgres',
      password: 'Harekrishna@123',
      database: 'postgres',
      ssl: { rejectUnauthorized: false }
    });

    try {
      await client.connect();
      console.log(`✅ SUCCESS connecting to ${host}`);
      const res = await client.query('SELECT current_database(), version();');
      console.log('Query result:', res.rows[0]);
      await client.end();
      return { host, port: host.includes('pooler') ? 6543 : 5432, user: host.includes('pooler') ? 'postgres.nmnizrkgdypylgllrfui' : 'postgres' };
    } catch (err) {
      console.error(`❌ Failed on ${host}: ${err.message}`);
    }
  }
  return null;
}

testConnection();
