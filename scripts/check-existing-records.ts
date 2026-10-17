import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (m) {
      let v = m[2] || '';
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      process.env[m[1]] = v.trim();
    }
  }
}

async function verifyGenderAndCompatibility() {
  const { supabaseAdmin } = await import('../src/lib/supabase-admin');
  console.log('=== 1. AUDITING contacts_register ACTUAL DATA ===');
  const { data: crRows, error: crErr } = await supabaseAdmin
    .from('contacts_register')
    .select('id, full_name, phone, gender, current_stay, pg_name');

  if (crErr) {
    console.error('Error fetching contacts_register:', crErr);
    process.exit(1);
  }

  const distinctGenders = Array.from(new Set(crRows.map(r => r.gender)));
  console.log(`Total rows in contacts_register: ${crRows.length}`);
  console.log(`Distinct gender values in DB: ${JSON.stringify(distinctGenders)}`);

  const genderDistribution: Record<string, number> = {};
  for (const r of crRows) {
    genderDistribution[r.gender] = (genderDistribution[r.gender] || 0) + 1;
  }
  console.log('Gender distribution in DB:', genderDistribution);

  console.log('\n=== 2. AUDITING OTHER TABLES FOR GENDER CONVENTIONS ===');
  const { data: regSample } = await supabaseAdmin.from('registrations').select('gender').limit(100);
  const regGenders = Array.from(new Set(regSample?.map(r => r.gender)));
  console.log('registrations sample distinct genders:', regGenders);

  const { data: fbSample } = await supabaseAdmin.from('feedback_contacts').select('gender').limit(100);
  const fbGenders = Array.from(new Set(fbSample?.map(r => r.gender)));
  console.log('feedback_contacts sample distinct genders:', fbGenders);

  const { data: mcSample } = await supabaseAdmin.from('master_contacts').select('gender').limit(100);
  const mcGenders = Array.from(new Set(mcSample?.map(r => r.gender)));
  console.log('master_contacts sample distinct genders:', mcGenders);

  console.log('\n=== 3. VERIFYING COMPATIBILITY OF ALL 55 EXISTING RECORDS WITH PROPOSED CONSTRAINT ===');
  // Constraint logic:
  // (gender = 'Female' AND current_stay IS NULL AND (pg_name IS NULL OR length(trim(pg_name)) = 0)) OR
  // (gender = 'Male'   AND current_stay IS NOT NULL AND (
  //   (current_stay = 'With Parents' AND (pg_name IS NULL OR length(trim(pg_name)) = 0)) OR
  //   (current_stay = 'In Hostel'    AND pg_name IS NOT NULL AND length(trim(pg_name)) >= 2)
  // ))

  let passCount = 0;
  let failCount = 0;
  const failures: any[] = [];

  for (const r of crRows) {
    const isFemaleValid =
      r.gender === 'Female' &&
      r.current_stay === null &&
      (!r.pg_name || r.pg_name.trim().length === 0);

    const isMaleWithParentsValid =
      r.gender === 'Male' &&
      r.current_stay === 'With Parents' &&
      (!r.pg_name || r.pg_name.trim().length === 0);

    const isMaleInHostelValid =
      r.gender === 'Male' &&
      r.current_stay === 'In Hostel' &&
      r.pg_name !== null &&
      r.pg_name.trim().length >= 2;

    const satisfiesConstraint = isFemaleValid || isMaleWithParentsValid || isMaleInHostelValid;

    if (satisfiesConstraint) {
      passCount++;
    } else {
      failCount++;
      failures.push(r);
    }
  }

  console.log(`Evaluated ${crRows.length} existing records against proposed constraint:`);
  console.log(`  Passed: ${passCount}`);
  console.log(`  Failed: ${failCount}`);
  if (failures.length > 0) {
    console.error('Violations:', failures);
  } else {
    console.log('  -> 100% of existing records strictly satisfy the new constraint!');
  }
}

verifyGenderAndCompatibility().catch(console.error);
