import { supabaseAdmin } from '../src/lib/supabase-admin';

async function main() {
  console.log('--- Force Cleaning Test Operators from DB ---');

  // SQL to nullify/delete references to test operators and delete test operators
  const sql = `
    -- 1. Identify test operator IDs
    DO $$
    DECLARE
      v_test_ids UUID[];
    BEGIN
      SELECT ARRAY_AGG(id) INTO v_test_ids
      FROM contact_operators
      WHERE name LIKE '__%'
         OR name ILIKE '%Test Operator%'
         OR name ILIKE '%shared%'
         OR email ILIKE '%test_op_%'
         OR email ILIKE '%test_operator%'
         OR email ILIKE '%test.com%';

      IF v_test_ids IS NOT NULL AND ARRAY_LENGTH(v_test_ids, 1) > 0 THEN
        RAISE NOTICE 'Deleting assignments associated with test operators...';

        -- Update or delete assignments referencing test operators
        UPDATE contact_assignments SET operator_id = NULL WHERE operator_id = ANY(v_test_ids);
        UPDATE krishnashtami_contact_assignments SET operator_id = NULL WHERE operator_id = ANY(v_test_ids);
        UPDATE feedback_contact_assignments SET operator_id = NULL WHERE operator_id = ANY(v_test_ids);

        -- Delete the test operators from contact_operators table
        DELETE FROM contact_operators WHERE id = ANY(v_test_ids);

        RAISE NOTICE 'Test operators deleted successfully.';
      END IF;
    END $$;
  `;

  const { data: res, error } = await supabaseAdmin.rpc('_temp_migration_executor', { p_sql: sql });
  if (error) {
    console.error('Error running SQL via RPC:', error);
  } else {
    console.log('SQL Result:', res);
  }

  // Also query contact_operators directly to verify remaining rows
  const { data: ops } = await supabaseAdmin
    .from('contact_operators')
    .select('id, name, email, is_active')
    .order('name');

  console.log('\n--- Remaining Operators in DB ---');
  for (const o of ops ?? []) {
    console.log(`- ID: ${o.id} | Name: "${o.name}" | Email: "${o.email}"`);
  }
}

main().catch(console.error);
