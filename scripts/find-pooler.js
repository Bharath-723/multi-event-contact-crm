const { Client } = require('pg');

const regions = [
  'ap-south-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
  'us-east-1',
  'us-west-1',
  'eu-central-1',
  'eu-west-1',
  'sa-east-1'
];

async function findPooler() {
  for (const r of regions) {
    const host = `aws-0-${r}.pooler.supabase.com`;
    console.log(`Trying ${host}...`);
    const client = new Client({
      host,
      port: 6543,
      user: 'postgres.nmnizrkgdypylgllrfui',
      password: 'Harekrishna@123',
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000
    });
    try {
      await client.connect();
      console.log(`🎉 FOUND SUPABASE POOLER! ${host}`);
      const res = await client.query('SELECT current_database(), version();');
      console.log('Query:', res.rows[0]);
      await client.end();
      return host;
    } catch (err) {
      if (err.message.includes('tenant/user') && err.message.includes('not found')) {
        console.log(`  Not in ${r}`);
      } else {
        console.log(`  ${r} error: ${err.message}`);
      }
    }
  }
}

findPooler();
