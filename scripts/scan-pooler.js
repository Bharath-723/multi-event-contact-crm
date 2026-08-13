const { Client } = require('pg');

const allRegions = [
  'ap-south-1',
  'ap-south-2',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-southeast-3',
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-northeast-3',
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'ca-central-1',
  'eu-central-1',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'eu-north-1',
  'sa-east-1',
  'me-south-1',
  'af-south-1'
];

async function scanRegions() {
  console.log('Scanning all Supabase Pooler regions for nmnizrkgdypylgllrfui...');
  for (const r of allRegions) {
    const host = `aws-0-${r}.pooler.supabase.com`;
    const client = new Client({
      host,
      port: 6543,
      user: 'postgres.nmnizrkgdypylgllrfui',
      password: 'Harekrishna@123',
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 3000
    });
    try {
      await client.connect();
      console.log(`\n🎉 FOUND MATCHING POOLER REGION: ${host}`);
      const res = await client.query('SELECT current_database(), version();');
      console.log('Connected! Result:', res.rows[0]);
      await client.end();
      return host;
    } catch (err) {
      if (err.message.includes('tenant/user') && err.message.includes('not found')) {
        // wrong region
      } else {
        console.log(`  [${r}] response: ${err.message}`);
      }
    }
  }
  console.log('Scan completed.');
}

scanRegions();
