const dns = require('dns');
const { Client } = require('pg');

dns.setServers(['8.8.8.8', '1.1.1.1']);

const poolers = [
  'aws-0-ap-south-1.pooler.supabase.com',
  'aws-0-ap-southeast-1.pooler.supabase.com',
  'aws-0-ap-southeast-2.pooler.supabase.com',
  'aws-0-ap-northeast-1.pooler.supabase.com',
  'aws-0-ap-northeast-2.pooler.supabase.com',
  'aws-0-us-east-1.pooler.supabase.com',
  'aws-0-us-east-2.pooler.supabase.com',
  'aws-0-us-west-1.pooler.supabase.com',
  'aws-0-us-west-2.pooler.supabase.com',
  'aws-0-ca-central-1.pooler.supabase.com',
  'eu-central-1.pooler.supabase.com',
  'aws-0-eu-central-1.pooler.supabase.com',
  'aws-0-eu-west-1.pooler.supabase.com',
  'aws-0-eu-west-2.pooler.supabase.com',
  'aws-0-eu-west-3.pooler.supabase.com',
  'aws-0-eu-north-1.pooler.supabase.com',
  'aws-0-sa-east-1.pooler.supabase.com'
];

async function checkPoolers() {
  console.log('Testing exact pooler host resolutions & connections...\n');

  for (const host of poolers) {
    try {
      const addrs = await new Promise((res, rej) => dns.resolve4(host, (err, a) => err ? rej(err) : res(a)));
      if (!addrs || addrs.length === 0) continue;
      
      console.log(`Pooler [${host}] resolved to IPv4: ${addrs[0]}`);

      // Test connection to IP
      const client = new Client({
        host: addrs[0],
        port: 5432,
        user: 'postgres.nmnizrkgdypylgllrfui',
        password: 'Harekrishna@123',
        database: 'postgres',
        ssl: { rejectUnauthorized: false, servername: 'db.nmnizrkgdypylgllrfui.supabase.co' },
        connectionTimeoutMillis: 3000
      });

      try {
        await client.connect();
        console.log(`\n==================================================`);
        console.log(`🎉🎉🎉 SUCCESS ON POOLER: ${host} (${addrs[0]}) 🎉🎉🎉`);
        console.log(`==================================================`);
        const res = await client.query('SELECT current_database(), version();');
        console.log('DB Info:', res.rows[0]);
        await client.end();
        return;
      } catch (connErr) {
        if (!connErr.message.includes('not found')) {
          console.log(`  -> Match signal on ${host}: ${connErr.message}`);
        }
      }
    } catch (dnsErr) {
      // DNS resolve failed for this host name format
    }
  }
  console.log('\nCheck complete.');
}

checkPoolers();
