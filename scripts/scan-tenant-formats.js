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

async function scanAllTenantFormats() {
  console.log('Testing tenant formats across regions...\n');

  for (const r of regions) {
    const host = `aws-0-${r}.pooler.supabase.com`;
    const userFormats = [
      'postgres.nmnizrkgdypylgllrfui',
      'nmnizrkgdypylgllrfui.postgres',
      'postgres:nmnizrkgdypylgllrfui',
      'postgres[nmnizrkgdypylgllrfui]'
    ];

    for (const u of userFormats) {
      const client = new Client({
        host,
        port: 6543,
        user: u,
        password: 'Harekrishna@123',
        database: 'postgres',
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 2000
      });

      try {
        await client.connect();
        console.log(`\n🎉🎉🎉 SUCCESS ON REGION: ${r}, user: ${u}! 🎉🎉🎉`);
        const res = await client.query('SELECT current_database(), version();');
        console.log('DB Info:', res.rows[0]);
        await client.end();
        return;
      } catch (err) {
        if (err.message.includes('Password authentication failed')) {
          console.log(`🔑 AUTH MATCH ON REGION: ${r}, user: ${u}! (Tenant exists!)`);
        } else if (!err.message.includes('not found') && !err.message.includes('ENOTFOUND') && !err.message.includes('ENOIDENTIFIER') && !err.message.includes('timeout')) {
          console.log(`  [${r}][${u}] -> ${err.message}`);
        }
      }
    }
  }
  console.log('\nScan complete.');
}

scanAllTenantFormats();
