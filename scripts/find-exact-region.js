const { Client } = require('pg');

const regions = [
  'ap-south-1',
  'ap-south-2',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-southeast-3',
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
  'sa-east-1',
  'me-south-1',
  'af-south-1'
];

async function scanPoolerRegions() {
  console.log('Testing each pooler region for project nmnizrkgdypylgllrfui...\n');

  for (const r of regions) {
    const host = `aws-0-${r}.pooler.supabase.com`;
    const client = new Client({
      host,
      port: 5432,
      user: 'postgres.nmnizrkgdypylgllrfui',
      password: 'Harekrishna@123',
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 2500
    });

    try {
      await client.connect();
      console.log(`\n🎉 SUCCESS ON REGION: ${r} (${host})!`);
      const res = await client.query('SELECT current_database(), version();');
      console.log('DB Info:', res.rows[0]);
      await client.end();
      return { host, region: r };
    } catch (err) {
      if (err.message.includes('Password authentication failed')) {
        console.log(`🎉 REGION FOUND: ${r} (password error confirms tenant exists!)`);
        await client.end().catch(()=>{});
        return { host, region: r };
      } else if (!err.message.includes('not found') && !err.message.includes('ENOTFOUND')) {
        console.log(`  [${r}] ${err.message}`);
      }
    }
  }
  console.log('\nScan complete.');
}

scanPoolerRegions();
