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

async function testSupavisorSNI() {
  console.log('Testing Supavisor connection with SNI servername & project option...\n');

  for (const r of regions) {
    const host = `aws-0-${r}.pooler.supabase.com`;
    const ports = [5432, 6543];

    for (const p of ports) {
      // Supavisor mode 1: user = postgres.nmnizrkgdypylgllrfui
      // Supavisor mode 2: options = '-c project=nmnizrkgdypylgllrfui'
      const client = new Client({
        host,
        port: p,
        user: 'postgres.nmnizrkgdypylgllrfui',
        password: 'Harekrishna@123',
        database: 'postgres',
        options: '-c project=nmnizrkgdypylgllrfui',
        ssl: {
          rejectUnauthorized: false,
          servername: 'db.nmnizrkgdypylgllrfui.supabase.co'
        },
        connectionTimeoutMillis: 3000
      });

      try {
        await client.connect();
        console.log(`\n==============================================`);
        console.log(`🎉 SUCCESS CONNECTING TO SUPABASE DB POOLER!`);
        console.log(`==============================================`);
        console.log(`   Host: ${host}`);
        console.log(`   Port: ${p}`);
        const res = await client.query('SELECT current_database(), version();');
        console.log('   DB Info:', res.rows[0]);
        await client.end();
        return { host, port: p };
      } catch (err) {
        if (!err.message.includes('not found') && !err.message.includes('ENOTFOUND')) {
          console.log(`  [${r}:${p}] error: ${err.message}`);
        }
      }
    }
  }
}

testSupavisorSNI();
