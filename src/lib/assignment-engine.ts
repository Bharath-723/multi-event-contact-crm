import { supabaseAdmin } from '@/lib/supabase-admin';
import { MAX_CONTACTS_PER_OPERATOR } from '@/lib/constants/operator-config';

import { autoAssignFeedbackContact } from '@/lib/assignment-engine-feedback';

// Re-export so existing server-side importers don't need to change
export { MAX_CONTACTS_PER_OPERATOR };

/**
 * Attempts to automatically assign a registration to an active operator
 * using a round-robin / load-balancing algorithm.
 * 
 * This helper is completely production-safe and will never throw exceptions
 * that bubble up to the registration flow.
 * 
 * @param registrationId The UUID of the registration
 * @returns The operator ID assigned, or null if skipped/failed
 */
export async function assignOperator(
  registrationId: string,
  source: 'rathayatra' | 'krishnashtami' | 'feedback' | 'feedback_contacts' = 'krishnashtami'
): Promise<string | null> {
  try {
    if (source === 'feedback' || source === 'feedback_contacts') {
      const res = await autoAssignFeedbackContact(registrationId);
      return res.success ? (res.operatorId ?? null) : null;
    }

    const regTable = source === 'krishnashtami' ? 'krishnashtami_registrations' : 'registrations';
    const assignTable = source === 'krishnashtami' ? 'krishnashtami_contact_assignments' : 'contact_assignments';

    // 0. Fetch the registration gender
    const { data: reg, error: regError } = await supabaseAdmin
      .from(regTable)
      .select('gender')
      .eq('id', registrationId)
      .single();

    if (regError || !reg) {
      console.error(`Auto-assignment: Error fetching registration gender from ${regTable} for ${registrationId}:`, regError);
      return null;
    }

    if (reg.gender === 'Female') {
      console.log(`Assignment skipped: Female registration.`);
      return null;
    }



    // 1. Duplicate Protection check
    const { data: existing, error: checkError } = await supabaseAdmin
      .from(assignTable)
      .select('operator_id')
      .eq('registration_id', registrationId)
      .eq('is_active', true)
      .maybeSingle();

    if (checkError) {
      console.error(`Auto-assignment: Error checking existing assignment in ${assignTable}:`, checkError);
    }

    if (existing) {
      console.log(`Automatic assignment skipped: Active assignment already exists for ${registrationId}`);
      return existing.operator_id;
    }

    // 2. Select eligible active operator with least workload in source table
    const { data: operators, error: opErr } = await supabaseAdmin
      .from('contact_operators')
      .select('id')
      .eq('is_active', true);

    if (opErr || !operators || operators.length === 0) {
      console.log('Automatic assignment skipped: No active operators available.');
      return null;
    }

    // Count active assignments per operator in target table
    const { data: activeAssignments } = await supabaseAdmin
      .from(assignTable)
      .select('operator_id')
      .eq('is_active', true);

    const countsMap: Record<string, number> = {};
    operators.forEach(op => { countsMap[op.id] = 0; });
    (activeAssignments || []).forEach(a => {
      if (countsMap[a.operator_id] !== undefined) {
        countsMap[a.operator_id] += 1;
      }
    });

    // Find operator below capacity with minimum assigned count
    const eligible = operators
      .map(op => ({ id: op.id, count: countsMap[op.id] || 0 }))
      .filter(op => op.count < MAX_CONTACTS_PER_OPERATOR)
      .sort((a, b) => a.count - b.count);

    if (eligible.length === 0) {
      console.log('Automatic assignment skipped: All operators at max capacity.');
      return null;
    }

    const chosenOperatorId = eligible[0].id;

    // Call atomic RPC for capacity & duplicate safe insertion
    const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('assign_contact_atomic', {
      p_contact_id: registrationId,
      p_operator_id: chosenOperatorId,
      p_source: source,
      p_assigned_by: null,
      p_max_capacity: MAX_CONTACTS_PER_OPERATOR,
    });

    if (rpcErr || !rpcRes?.success) {
      console.error(`Automatic assignment RPC failed into ${assignTable}:`, rpcErr || rpcRes?.message);
      return null;
    }

    console.log(`Automatic assignment succeeded into ${assignTable} for ${registrationId} to operator ${chosenOperatorId}`);
    return chosenOperatorId;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`Automatic assignment failed for ${registrationId}: ${errMsg}`);
    return null;
  }
}
