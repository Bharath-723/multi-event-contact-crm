const dns = require('dns');
const { Client } = require('pg');

// Set public DNS servers (Google / Cloudflare) to bypass Windows router DNS timeout
dns.setServers(['8.8.8.8', '1.1.1.1']);

async function testCustomDNS() {
  console.log('Resolving db.nmnizrkgdypylgllrfui.supabase.co using 8.8.8.8...');
  dns.lookup('db.nmnizrkgdypylgllrfui.supabase.co', { all: true }, async (err, addresses) => {
    if (err) {
      console.error('DNS Lookup Error:', err);
      return;
    }
    console.log('DNS Addresses:', addresses);

    for (const addr of addresses) {
      console.log(`\nAttempting connection to ${addr.address} (${addr.family})...`);
      const client = new Client({
        host: addr.address,
        port: 5432,
        user: 'postgres',
        password: 'Harekrishna@123',
        database: 'postgres',
        ssl: { rejectUnauthorized: false, servername: 'db.nmnizrkgdypylgllrfui.supabase.co' },
        connectionTimeoutMillis: 5000
      });
      try {
        await client.connect();
        console.log(`✅ CONNECTED SUCCESSFULLY TO ${addr.address}!`);
        const res = await client.query('SELECT current_database(), version();');
        console.log('DB:', res.rows[0]);
        await client.end();
        return;
      } catch (e) {
        console.error(`❌ Connection failed to ${addr.address}: ${e.message}`);
      }
    }
  });
}

testCustomDNS();
