import { supabaseAdmin } from './supabase-admin';

export const MAX_OPERATOR_FEEDBACK_CAPACITY = 40;

export interface AssignmentResult {
  success: boolean;
  assignmentId?: string;
  operatorId?: string;
  operatorName?: string;
  message: string;
}

/**
 * Automatically assigns an unassigned feedback contact to an eligible Contact Operator.
 * Excludes Females (gender = 'Female') and Co-ordinators (operator_type = 'coordinator') from automatic assignment.
 */
export async function autoAssignFeedbackContact(
  feedbackContactId: string,
  assignedBy?: string
): Promise<AssignmentResult> {
  try {
    // 0. Check gender of feedback contact (Female restriction)
    const { data: fc } = await supabaseAdmin
      .from('feedback_contacts')
      .select('id, gender')
      .eq('id', feedbackContactId)
      .single();

    if (!fc || fc.gender === 'Female') {
      return {
        success: false,
        message: 'Female feedback contacts are excluded from operator assignment.',
      };
    }

    // 1. Check if feedback contact already has an active assignment
    const { data: existing } = await supabaseAdmin
      .from('feedback_contact_assignments')
      .select('id, operator_id')
      .eq('feedback_contact_id', feedbackContactId)
      .eq('is_active', true)
      .single();

    if (existing) {
      return {
        success: false,
        assignmentId: existing.id,
        operatorId: existing.operator_id,
        message: 'Feedback contact is already actively assigned to an operator',
      };
    }

    // 2. Query eligible operators: active, operator_type = 'operator' or NULL (coordinators excluded)
    const { data: operators, error: opError } = await supabaseAdmin
      .from('contact_operators')
      .select('id, name, operator_type')
      .eq('is_active', true);

    if (opError || !operators || operators.length === 0) {
      return { success: false, message: 'No active contact operators found' };
    }

    // Filter out coordinators for auto-assignment
    const eligibleOperators = operators.filter(
      (op) => op.operator_type === 'operator' || !op.operator_type
    );

    if (eligibleOperators.length === 0) {
      return { success: false, message: 'No eligible Operators found for auto-assignment' };
    }

    // 3. Count active feedback contact workload for each eligible operator
    const operatorWorkloads = await Promise.all(
      eligibleOperators.map(async (op) => {
        const { count } = await supabaseAdmin
          .from('feedback_contact_assignments')
          .select('id', { count: 'exact', head: true })
          .eq('operator_id', op.id)
          .eq('is_active', true);

        return {
          operator: op,
          count: count ?? 0,
        };
      })
    );

    // 4. Filter operators under MAX capacity (40) and sort by least loaded
    const availableOperators = operatorWorkloads
      .filter((ow) => ow.count < MAX_OPERATOR_FEEDBACK_CAPACITY)
      .sort((a, b) => a.count - b.count);

    if (availableOperators.length === 0) {
      return {
        success: false,
        message: `All available operators have reached maximum capacity (${MAX_OPERATOR_FEEDBACK_CAPACITY})`,
      };
    }

    const selectedOperator = availableOperators[0].operator;

    // 5. Create new feedback assignment record
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('feedback_contact_assignments')
      .insert({
        feedback_contact_id: feedbackContactId,
        operator_id: selectedOperator.id,
        assigned_by: assignedBy || null,
        status: 'Assigned',
        is_active: true,
      })
      .select('id')
      .single();

    if (insertError || !inserted) {
      return { success: false, message: `Failed to insert assignment: ${insertError?.message}` };
    }

    // 6. Log audit event
    await supabaseAdmin.from('audit_logs').insert({
      action: 'FEEDBACK_ASSIGNED',
      details: {
        feedback_contact_id: feedbackContactId,
        operator_id: selectedOperator.id,
        assigned_by: assignedBy || 'system_auto',
        assignment_id: inserted.id,
      },
    });

    return {
      success: true,
      assignmentId: inserted.id,
      operatorId: selectedOperator.id,
      operatorName: selectedOperator.name,
      message: `Feedback contact assigned to ${selectedOperator.name}`,
    };
  } catch (err) {
    console.error('[autoAssignFeedbackContact] Exception:', err);
    return {
      success: false,
      message: `Auto assignment error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Manually assigns or reassigns a feedback contact to a specific Contact Operator.
 * Enforces Female assignment restriction.
 */
export async function assignFeedbackContactManually(
  feedbackContactId: string,
  targetOperatorId: string,
  assignedBy?: string
): Promise<AssignmentResult> {
  try {
    // 0. Check gender of feedback contact (Female restriction)
    const { data: fc } = await supabaseAdmin
      .from('feedback_contacts')
      .select('id, gender')
      .eq('id', feedbackContactId)
      .single();

    if (!fc || fc.gender === 'Female') {
      return {
        success: false,
        message: 'Female feedback contacts are excluded from operator assignment.',
      };
    }

    // 1. Verify target operator exists & is active
    const { data: operator } = await supabaseAdmin
      .from('contact_operators')
      .select('id, name, is_active')
      .eq('id', targetOperatorId)
      .single();

    if (!operator || !operator.is_active) {
      return { success: false, message: 'Target operator is inactive or does not exist' };
    }

    // 2. Check current active assignment for this feedback contact
    const { data: currentActive } = await supabaseAdmin
      .from('feedback_contact_assignments')
      .select('id, operator_id')
      .eq('feedback_contact_id', feedbackContactId)
      .eq('is_active', true)
      .maybeSingle();

    if (currentActive) {
      return {
        success: false,
        assignmentId: currentActive.id,
        operatorId: currentActive.operator_id,
        message: 'This contact is already assigned to an operator.',
      };
    }

    // 4. Create new active assignment
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('feedback_contact_assignments')
      .insert({
        feedback_contact_id: feedbackContactId,
        operator_id: targetOperatorId,
        assigned_by: assignedBy || null,
        status: 'Assigned',
        is_active: true,
      })
      .select('id')
      .single();

    if (insertError || !inserted) {
      return { success: false, message: `Failed to create assignment: ${insertError?.message}` };
    }

    // 5. Log audit event
    await supabaseAdmin.from('audit_logs').insert({
      action: 'FEEDBACK_ASSIGNED',
      details: {
        feedback_contact_id: feedbackContactId,
        new_operator_id: targetOperatorId,
        assigned_by: assignedBy || 'admin',
        assignment_id: inserted.id,
      },
    });

    return {
      success: true,
      assignmentId: inserted.id,
      operatorId: operator.id,
      operatorName: operator.name,
      message: `Feedback contact successfully assigned to ${operator.name}`,
    };
  } catch (err) {
    console.error('[assignFeedbackContactManually] Exception:', err);
    return {
      success: false,
      message: `Manual assignment error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
