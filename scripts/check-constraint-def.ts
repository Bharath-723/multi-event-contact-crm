import { PGlite } from '@electric-sql/pglite';

async function main() {
  const pg = new PGlite();
  await pg.exec(`
    CREATE TABLE contacts_register (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      gender TEXT NOT NULL,
      current_stay TEXT,
      pg_name TEXT,
      profession TEXT
    );

    CREATE TABLE master_contacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      chanting INT NOT NULL DEFAULT 0
    );

    ALTER TABLE contacts_register
      ADD CONSTRAINT chk_contacts_register_current_stay
      CHECK (current_stay IS NULL OR current_stay IN ('With Parents', 'In Hostel'));

    ALTER TABLE contacts_register
      ADD CONSTRAINT chk_contacts_register_gender_stay
      CHECK (
        (gender = 'Female' AND current_stay IS NULL AND (pg_name IS NULL OR length(trim(pg_name)) = 0)) OR
        (gender = 'Male'   AND current_stay IS NOT NULL AND (
          (current_stay = 'With Parents' AND (pg_name IS NULL OR length(trim(pg_name)) = 0)) OR
          (current_stay = 'In Hostel'    AND pg_name IS NOT NULL AND length(trim(pg_name)) >= 2)
        ))
      );

    ALTER TABLE master_contacts
      ADD CONSTRAINT chk_master_contacts_chanting
      CHECK (chanting >= 0);

    ALTER TABLE contacts_register
      ADD CONSTRAINT chk_contacts_register_profession
      CHECK (profession IS NULL OR profession IN ('Student', 'Working', 'Business', 'Others'));
  `);

  const res = await pg.query(`
    SELECT conname, pg_get_constraintdef(oid) as def
    FROM pg_constraint
    WHERE conname IN (
      'chk_contacts_register_current_stay',
      'chk_contacts_register_gender_stay',
      'chk_master_contacts_chanting',
      'chk_contacts_register_profession'
    )
    ORDER BY conname;
  `);

  console.log('--- EXACT POSTGRESQL NORMALIZED DEFINITIONS ---');
  for (const row of res.rows as any[]) {
    console.log(`\n[${row.conname}]:\n${row.def}`);
  }
}

main().catch(console.error);
