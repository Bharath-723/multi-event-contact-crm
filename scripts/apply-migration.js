const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  console.log('=== APPLYING MULTI-FESTIVAL SCHEMA MIGRATION ===\n');

  const migrationPath = path.join(__dirname, '../supabase/migrations/20260813000000_multi_festival_schema.sql');
  console.log(`Reading SQL file: ${migrationPath}`);
  const sql = fs.readFileSync(migrationPath, 'utf8');

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
    console.log('✅ Connected to Supabase DB via AP-SOUTH-1 Pooler');

    console.log('Executing multi-festival schema migration DDL...');
    await client.query(sql);
    console.log('\n==================================================');
    console.log('✅ MIGRATION EXECUTED SUCCESSFULLY!');
    console.log('==================================================\n');

  } catch (err) {
    console.error('❌ MIGRATION FAILED:', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
