const { Client } = require('pg');

async function testPoolerClean() {
  console.log('Testing ap-south-1 pooler without servername override...');

  const client = new Client({
    host: 'aws-0-ap-south-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.nmnizrkgdypylgllrfui',
    password: 'Harekrishna@123',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅✅✅ CONNECTED SUCCESSFULLY TO SUPABASE POOLER! ✅✅✅');
    const res = await client.query('SELECT current_database(), version();');
    console.log('Result:', res.rows[0]);
    await client.end();
  } catch (e) {
    console.error('Error:', e.message);
  }
}

testPoolerClean();
