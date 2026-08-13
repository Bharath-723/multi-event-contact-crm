const { Client } = require('pg');

async function testLiteralIP() {
  console.log('Testing connection to IP [2406:da1a:314:7101:cfa2:3b53:157b:2298]...');
  const client = new Client({
    host: '2406:da1a:314:7101:cfa2:3b53:157b:2298',
    port: 5432,
    user: 'postgres',
    password: 'Harekrishna@123',
    database: 'postgres',
    ssl: { rejectUnauthorized: false, servername: 'db.nmnizrkgdypylgllrfui.supabase.co' }
  });

  try {
    await client.connect();
    console.log('✅ CONNECTED VIA LITERAL IP!');
    const res = await client.query('SELECT current_database(), version();');
    console.log('DB:', res.rows[0]);
    await client.end();
    return true;
  } catch (err) {
    console.error('❌ IP Connection error:', err.message);
    return false;
  }
}

testLiteralIP();
