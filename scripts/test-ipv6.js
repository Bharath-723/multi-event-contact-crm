const { Client } = require('pg');
const dns = require('dns');

// Enable IPv6 resolution in Node
dns.setDefaultResultOrder('verbatim');

async function testPgIPv6() {
  console.log('Testing direct PG connection to IPv6 address...');
  const client = new Client({
    host: 'db.nmnizrkgdypylgllrfui.supabase.co',
    port: 5432,
    user: 'postgres',
    password: 'Harekrishna@123',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ CONNECTED TO SUPABASE DB DIRECTLY!');
    const res = await client.query('SELECT current_database(), version();');
    console.log('Database info:', res.rows[0]);
    await client.end();
    return true;
  } catch (err) {
    console.error('❌ Connection error:', err.message);
    return false;
  }
}

testPgIPv6();
