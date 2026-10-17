import { PGlite } from '@electric-sql/pglite';

async function testConstraintValidationLogic() {
  console.log('Testing Constraint Validation Logic in PostgreSQL 16...');
  const pg = new PGlite();

  // 1. Setup base tables
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
  `);

  // --- Test Migration 1 Block on Fresh Schema ---
  const m1Sql = `
    DO $$
    DECLARE
      v_def TEXT;
      v_exp_stay_1 TEXT := 'CHECK (((current_stay IS NULL) OR (current_stay = ANY (ARRAY[''With Parents''::text, ''In Hostel''::text]))))';
      v_exp_stay_2 TEXT := 'CHECK (((current_stay IS NULL) OR (current_stay = ANY (ARRAY[''In Hostel''::text, ''With Parents''::text]))))';
      v_exp_gender TEXT := 'CHECK ((((gender = ''Female''::text) AND (current_stay IS NULL) AND ((pg_name IS NULL) OR (length(TRIM(BOTH FROM pg_name)) = 0))) OR ((gender = ''Male''::text) AND (current_stay IS NOT NULL) AND (((current_stay = ''With Parents''::text) AND ((pg_name IS NULL) OR (length(TRIM(BOTH FROM pg_name)) = 0))) OR ((current_stay = ''In Hostel''::text) AND (pg_name IS NOT NULL) AND (length(TRIM(BOTH FROM pg_name)) >= 2))))))';
    BEGIN
      -- chk_contacts_register_current_stay
      SELECT pg_get_constraintdef(c.oid) INTO v_def
      FROM pg_constraint c
      WHERE c.conrelid = 'public.contacts_register'::regclass
        AND c.conname = 'chk_contacts_register_current_stay';

      IF v_def IS NULL THEN
        ALTER TABLE public.contacts_register
          ADD CONSTRAINT chk_contacts_register_current_stay
          CHECK (current_stay IS NULL OR current_stay IN ('With Parents', 'In Hostel'));
      ELSIF v_def = v_exp_stay_1 OR v_def = v_exp_stay_2 THEN
        NULL;
      ELSE
        RAISE EXCEPTION 'Constraint chk_contacts_register_current_stay exists with unexpected definition: %. Manual review required.', v_def;
      END IF;

      -- chk_contacts_register_gender_stay
      SELECT pg_get_constraintdef(c.oid) INTO v_def
      FROM pg_constraint c
      WHERE c.conrelid = 'public.contacts_register'::regclass
        AND c.conname = 'chk_contacts_register_gender_stay';

      IF v_def IS NULL THEN
        ALTER TABLE public.contacts_register
          ADD CONSTRAINT chk_contacts_register_gender_stay
          CHECK (
            (gender = 'Female' AND current_stay IS NULL AND (pg_name IS NULL OR length(trim(pg_name)) = 0)) OR
            (gender = 'Male'   AND current_stay IS NOT NULL AND (
              (current_stay = 'With Parents' AND (pg_name IS NULL OR length(trim(pg_name)) = 0)) OR
              (current_stay = 'In Hostel'    AND pg_name IS NOT NULL AND length(trim(pg_name)) >= 2)
            ))
          );
      ELSIF v_def = v_exp_gender THEN
        NULL;
      ELSE
        RAISE EXCEPTION 'Constraint chk_contacts_register_gender_stay exists with unexpected definition: %. Manual review required.', v_def;
      END IF;
    END $$;
  `;

  // Step 1: Run on fresh schema (should create constraints)
  await pg.exec(m1Sql);
  console.log('✅ Fresh execution: constraints created successfully.');

  // Step 2: Run again on existing identical schema (should preserve without error)
  await pg.exec(m1Sql);
  console.log('✅ Re-execution on identical schema: preserved existing constraints without error.');

  // Step 3: Test divergent constraint detection
  await pg.exec(`
    ALTER TABLE contacts_register DROP CONSTRAINT chk_contacts_register_current_stay;
    ALTER TABLE contacts_register ADD CONSTRAINT chk_contacts_register_current_stay CHECK (current_stay = 'In Hostel');
  `);

  let errorCaught = false;
  let errorMessage = '';
  try {
    await pg.exec(m1Sql);
  } catch (err: any) {
    errorCaught = true;
    errorMessage = err.message;
  }

  if (errorCaught && errorMessage.includes('unexpected definition')) {
    console.log('✅ Divergent constraint correctly halted migration with exception:');
    console.log('   ' + errorMessage.split('\n')[0]);
  } else {
    throw new Error('FAILED to catch divergent constraint: ' + errorMessage);
  }

  // --- Test Migration 2 Block ---
  const m2Sql = `
    DO $$
    DECLARE
      v_def TEXT;
      v_exp_chanting TEXT := 'CHECK ((chanting >= 0))';
      v_exp_profession TEXT := 'CHECK (((profession IS NULL) OR (profession = ANY (ARRAY[''Student''::text, ''Working''::text, ''Business''::text, ''Others''::text]))))';
    BEGIN
      -- chk_master_contacts_chanting
      SELECT pg_get_constraintdef(c.oid) INTO v_def
      FROM pg_constraint c
      WHERE c.conrelid = 'public.master_contacts'::regclass
        AND c.conname = 'chk_master_contacts_chanting';

      IF v_def IS NULL THEN
        ALTER TABLE public.master_contacts
          ADD CONSTRAINT chk_master_contacts_chanting
          CHECK (chanting >= 0);
      ELSIF v_def = v_exp_chanting THEN
        NULL;
      ELSE
        RAISE EXCEPTION 'Constraint chk_master_contacts_chanting exists with unexpected definition: %. Manual review required.', v_def;
      END IF;

      -- chk_contacts_register_profession
      SELECT pg_get_constraintdef(c.oid) INTO v_def
      FROM pg_constraint c
      WHERE c.conrelid = 'public.contacts_register'::regclass
        AND c.conname = 'chk_contacts_register_profession';

      IF v_def IS NULL THEN
        ALTER TABLE public.contacts_register
          ADD CONSTRAINT chk_contacts_register_profession
          CHECK (profession IS NULL OR profession IN ('Student', 'Working', 'Business', 'Others'));
      ELSIF v_def = v_exp_profession THEN
        NULL;
      ELSE
        RAISE EXCEPTION 'Constraint chk_contacts_register_profession exists with unexpected definition: %. Manual review required.', v_def;
      END IF;
    END $$;
  `;

  // Step 4: Run M2 on fresh schema
  await pg.exec(m2Sql);
  console.log('✅ M2 Fresh execution: created chanting & profession constraints successfully.');

  // Step 5: Run M2 on identical schema (preserves)
  await pg.exec(m2Sql);
  console.log('✅ M2 Re-execution on identical schema: preserved constraints without error.');

  // Step 6: Test M2 divergent constraint detection
  await pg.exec(`
    ALTER TABLE master_contacts DROP CONSTRAINT chk_master_contacts_chanting;
    ALTER TABLE master_contacts ADD CONSTRAINT chk_master_contacts_chanting CHECK (chanting > 10);
  `);

  let m2ErrorCaught = false;
  let m2ErrorMessage = '';
  try {
    await pg.exec(m2Sql);
  } catch (err: any) {
    m2ErrorCaught = true;
    m2ErrorMessage = err.message;
  }

  if (m2ErrorCaught && m2ErrorMessage.includes('unexpected definition')) {
    console.log('✅ M2 Divergent constraint correctly halted migration with exception:');
    console.log('   ' + m2ErrorMessage.split('\n')[0]);
  } else {
    throw new Error('FAILED to catch divergent M2 constraint: ' + m2ErrorMessage);
  }

  console.log('\n🌟 ALL CONSTRAINT LOGIC TESTS PASSED PERFECTLY IN POSTGRESQL 16!');
}

testConstraintValidationLogic().catch(console.error);
