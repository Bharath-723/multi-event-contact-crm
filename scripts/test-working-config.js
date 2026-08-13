const { Client } = require('pg');

async function testOptions() {
  const configs = [
    { name: 'config1', user: 'postgres', options: '-c project=nmnizrkgdypylgllrfui' },
    { name: 'config2', user: 'postgres.nmnizrkgdypylgllrfui', options: undefined },
    { name: 'config3', user: 'postgres.nmnizrkgdypylgllrfui', options: '-c project=nmnizrkgdypylgllrfui' },
    { name: 'config4', user: 'postgres', options: undefined },
  ];

  for (const cfg of configs) {
    console.log(`Testing ${cfg.name}: user=${cfg.user}, options=${cfg.options}`);
    const client = new Client({
      host: 'aws-0-ap-southeast-1.pooler.supabase.com',
      port: 5432,
      user: cfg.user,
      password: 'Harekrishna@123',
      database: 'postgres',
      options: cfg.options,
      ssl: { rejectUnauthorized: false, servername: 'db.nmnizrkgdypylgllrfui.supabase.co' }
    });

    try {
      await client.connect();
      console.log(`  ✅ ${cfg.name} WORKED!`);
      const res = await client.query('SELECT current_database();');
      console.log('  DB:', res.rows[0]);
      await client.end();
      return cfg;
    } catch (e) {
      console.log(`  ❌ ${cfg.name} failed: ${e.message}`);
    }
  }
}

testOptions();
