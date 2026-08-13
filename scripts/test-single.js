const { Client } = require('pg');

async function testSingle() {
  const client = new Client({
    host: 'aws-0-ap-south-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.nmnizrkgdypylgllrfui',
    password: 'Harekrishna@123',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Connecting...');
    await client.connect();
    console.log('Connected!');
    const res = await client.query('SELECT 1 AS num;');
    console.log('Query:', res.rows);
    await client.end();
  } catch (e) {
    console.error('Error:', e);
  }
}

testSingle();
