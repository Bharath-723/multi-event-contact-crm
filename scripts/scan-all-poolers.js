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
  'sa-east-1',
  'me-south-1',
  'af-south-1'
];

async function scanAllPoolers() {
  console.log('Scanning all regions for project nmnizrkgdypylgllrfui...');

  for (const r of regions) {
    const host = `aws-0-${r}.pooler.supabase.com`;
    for (const port of [5432, 6543]) {
      const client = new Client({
        host,
        port,
        user: 'postgres.nmnizrkgdypylgllrfui',
        password: 'Harekrishna@123',
        database: 'postgres',
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 2000
      });

      try {
        await client.connect();
        console.log(`\n========================================`);
        console.log(`🎉 FOUND DB POOLER REGION: ${r} (port ${port})`);
        console.log(`========================================`);
        const res = await client.query('SELECT current_database(), version();');
        console.log('DB Info:', res.rows[0]);
        await client.end();
        return { host, port, region: r };
      } catch (err) {
        if (!err.message.includes('not found') && !err.message.includes('ENOTFOUND') && !err.message.includes('timeout')) {
          console.log(`  [${r}:${port}] ${err.message}`);
        }
      }
    }
  }
  console.log('Scan finished.');
}

scanAllPoolers();
