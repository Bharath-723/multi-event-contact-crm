const { Client } = require('pg');

async function testPorts() {
  const ports = [5432, 6543];
  for (const port of ports) {
    console.log(`Testing db.nmnizrkgdypylgllrfui.supabase.co on port ${port}...`);
    const client = new Client({
      host: 'db.nmnizrkgdypylgllrfui.supabase.co',
      port,
      user: 'postgres',
      password: 'Harekrishna@123',
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000
    });
    try {
      await client.connect();
      console.log(`✅ SUCCESS on port ${port}!`);
      await client.end();
    } catch (e) {
      console.log(`❌ Port ${port} failed: ${e.message}`);
    }
  }
}

testPorts();
