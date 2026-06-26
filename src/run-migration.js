const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const client = new Client({
  host: 'db.nmnizrkgdypylgllrfui.supabase.co',
  port: 5432,
  user: 'postgres',
  password: 'Harekrishna@123',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  console.log('Connecting to database host: db.nmnizrkgdypylgllrfui.supabase.co...');
  try {
    await client.connect();
    console.log('Connected successfully!');

    const migrationPath = path.join(__dirname, '../supabase/migrations/20260626000000_init_schema.sql');
    console.log('Reading migration file from:', migrationPath);
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('Applying database migrations (creating tables, indexes, triggers, and seeding initial records)...');
    await client.query(sql);
    console.log('\n✅ Database migrations applied successfully!');
  } catch (err) {
    console.error('\n❌ Migration execution failed:', err.message);
    console.error(err);
  } finally {
    await client.end();
  }
}

runMigration();
