const { Client } = require('pg');

const regions = [
  'ap-south-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'eu-central-1',
  'eu-west-1',
  'eu-west-2',
  'sa-east-1'
];

async function scanDetailed() {
  console.log('Testing Supabase poolers across regions, ports, and usernames...\n');
  for (const r of regions) {
    const host = `aws-0-${r}.pooler.supabase.com`;
    const users = ['postgres.nmnizrkgdypylgllrfui', 'postgres'];
    const ports = [5432, 6543];

    for (const u of users) {
      for (const p of ports) {
        const client = new Client({
          host,
          port: p,
          user: u,
          password: 'Harekrishna@123',
          database: 'postgres',
          ssl: { rejectUnauthorized: false },
          connectionTimeoutMillis: 2000
        });

        try {
          await client.connect();
          console.log(`\n🎉 SUCCESS! Connected to pooler!`);
          console.log(`   Host: ${host}`);
          console.log(`   Port: ${p}`);
          console.log(`   User: ${u}`);
          const res = await client.query('SELECT current_database(), version();');
          console.log('   Result:', res.rows[0]);
          await client.end();
          return { host, port: p, user: u };
        } catch (err) {
          if (!err.message.includes('not found') && !err.message.includes('ENOTFOUND') && !err.message.includes('timeout')) {
            console.log(`  [${r}][p:${p}][u:${u}] ${err.message}`);
          }
        }
      }
    }
  }
  console.log('\nDetailed scan complete.');
}

scanDetailed();
