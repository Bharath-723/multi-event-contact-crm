import { supabaseAdmin } from '@/lib/supabase-admin';

export const MAX_CONTACTS_PER_OPERATOR = 30;

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
export async function assignOperator(registrationId: string): Promise<string | null> {
  try {
    // 0. Fetch the registration gender
    const { data: reg, error: regError } = await supabaseAdmin
      .from('registrations')
      .select('gender')
      .eq('id', registrationId)
      .single();

    if (regError || !reg) {
      console.error(`Auto-assignment: Error fetching registration gender for ${registrationId}:`, regError);
      return null;
    }

    if (reg.gender === 'Female') {
      console.log(`Assignment skipped: Female registration.`);
      return null;
    }

    // 1. Duplicate Protection check (pre-flight check for logging clarity)
    const { data: existing, error: checkError } = await supabaseAdmin
      .from('contact_assignments')
      .select('operator_id')
      .eq('registration_id', registrationId)
      .eq('is_active', true)
      .maybeSingle();

    if (checkError) {
      console.error('Auto-assignment: Error checking existing assignment:', checkError);
    }

    if (existing) {
      console.log(`Automatic assignment skipped.

Reason:
An active assignment already exists.

Registration ID:
${registrationId}

Operator ID (if applicable):
${existing.operator_id}`);
      return existing.operator_id;
    }

    // 2. Call the database RPC which executes the selection algorithm safely
    // and holds row-level locks (FOR UPDATE OF co) to avoid concurrency race conditions.
    const { data: operatorId, error: rpcError } = await supabaseAdmin.rpc(
      'assign_operator_to_registration',
      {
        p_registration_id: registrationId,
        p_max_contacts: MAX_CONTACTS_PER_OPERATOR
      }
    );

    if (rpcError) {
      console.error(`Automatic assignment failed.

Registration ID:
${registrationId}

Assignment failure reason (if applicable):
${rpcError.message}`);
      return null;
    }

    // 3. Log results based on the RPC response
    if (operatorId) {
      console.log(`Automatic assignment succeeded.

Registration ID:
${registrationId}

Operator ID (if applicable):
${operatorId}`);
      return operatorId;
    } else {
      console.log(`Automatic assignment skipped.

Reason:
No active operator with available capacity.

Registration ID:
${registrationId}`);
      return null;
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`Automatic assignment failed.

Registration ID:
${registrationId}

Assignment failure reason (if applicable):
${errMsg}`);
    return null;
  }
}
