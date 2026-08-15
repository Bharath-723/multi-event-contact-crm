import { supabaseAdmin } from '../src/lib/supabase-admin';

async function main() {
  console.log('--- Inspecting contact_operators table ---');
  const { data: operators, error: opsError } = await supabaseAdmin
    .from('contact_operators')
    .select('id, name, email, operator_type, is_active, created_at')
    .order('created_at', { ascending: false });

  if (opsError) {
    console.error('Error fetching operators:', opsError);
    return;
  }

  console.log(`Total operators found: ${operators.length}`);
  for (const op of operators) {
    console.log(`- ID: ${op.id} | Name: "${op.name}" | Email: "${op.email}" | Type: ${op.operator_type} | Active: ${op.is_active}`);
  }

  console.log('\n--- Running SQL Migration to fix status check constraints ---');
  const migrationSQL = `
    -- Fix feedback_contact_assignments check constraint
    ALTER TABLE feedback_contact_assignments DROP CONSTRAINT IF EXISTS feedback_contact_assignments_status_check;
    ALTER TABLE feedback_contact_assignments ADD CONSTRAINT feedback_contact_assignments_status_check
        CHECK (status IN ('Pending', 'Assigned', 'Coming', 'Not Coming', 'Not Connected', 'Callback Required', 'Contacted', 'Interested', 'Not Interested', 'Completed'));

    -- Fix contact_assignments check constraint
    ALTER TABLE contact_assignments DROP CONSTRAINT IF EXISTS contact_assignments_status_check;
    ALTER TABLE contact_assignments ADD CONSTRAINT contact_assignments_status_check
        CHECK (status IN ('Pending', 'Assigned', 'Coming', 'Not Coming', 'Not Connected', 'Callback Required', 'Contacted', 'Interested', 'Not Interested', 'Completed'));

    -- Fix krishnashtami_contact_assignments check constraint
    ALTER TABLE krishnashtami_contact_assignments DROP CONSTRAINT IF EXISTS krishnashtami_contact_assignments_status_check;
    ALTER TABLE krishnashtami_contact_assignments ADD CONSTRAINT krishnashtami_contact_assignments_status_check
        CHECK (status IN ('Pending', 'Assigned', 'Coming', 'Not Coming', 'Not Connected', 'Callback Required', 'Contacted', 'Interested', 'Not Interested', 'Completed'));
  `;

  const { data: execRes, error: execErr } = await supabaseAdmin.rpc('_temp_migration_executor', { p_sql: migrationSQL });
  if (execErr) {
    console.error('Failed to run migration SQL via _temp_migration_executor:', execErr);
  } else {
    console.log('Migration SQL result:', execRes);
  }

  console.log('\n--- Deleting test operators ---');
  const testIds = operators
    .filter(op => 
      op.name.startsWith('__') || 
      op.name.toLowerCase().includes('test operator') || 
      op.name.toLowerCase().includes('_shared') ||
      op.email.includes('_test_op_') ||
      op.email.includes('test_operator') ||
      op.name.includes('_rathayatra') ||
      op.name.includes('_krishnashtami')
    )
    .map(op => op.id);

  console.log(`Identified ${testIds.length} test operator records to delete:`, testIds);

  if (testIds.length > 0) {
    const { error: delErr } = await supabaseAdmin
      .from('contact_operators')
      .delete()
      .in('id', testIds);

    if (delErr) {
      console.error('Error deleting test operators:', delErr);
    } else {
      console.log(`Successfully deleted ${testIds.length} test operators!`);
    }
  }

  // Final check of remaining operators
  const { data: remaining } = await supabaseAdmin
    .from('contact_operators')
    .select('id, name, email')
    .order('created_at', { ascending: false });

  console.log('\n--- Remaining Real Operators ---');
  for (const op of remaining ?? []) {
    console.log(`- ID: ${op.id} | Name: "${op.name}" | Email: "${op.email}"`);
  }
}

main().catch(console.error);
