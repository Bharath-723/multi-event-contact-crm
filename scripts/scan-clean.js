const { Client } = require('pg');

const regions = [
  'ap-south-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
  'ap-northeast-2',
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
  'sa-east-1'
];

async function scanClean() {
  console.log('Scanning pooler regions with clean SSL config...\n');

  for (const r of regions) {
    const host = `aws-0-${r}.pooler.supabase.com`;
    const client = new Client({
      host,
      port: 5432,
      user: 'postgres.nmnizrkgdypylgllrfui',
      password: 'Harekrishna@123',
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 2000
    });

    try {
      await client.connect();
      console.log(`\n🎉🎉🎉 FOUND POOLER REGION: ${r} (${host})! 🎉🎉🎉`);
      const res = await client.query('SELECT current_database(), version();');
      console.log('Result:', res.rows[0]);
      await client.end();
      return;
    } catch (e) {
      if (!e.message.includes('not found')) {
        console.log(`  [${r}] -> ${e.message}`);
      }
    }
  }
  console.log('\nScan complete.');
}

scanClean();
