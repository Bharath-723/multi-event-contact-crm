import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  autoAssignFeedbackContact,
  assignFeedbackContactManually,
  MAX_OPERATOR_FEEDBACK_CAPACITY,
} from '@/lib/assignment-engine-feedback';

export const dynamic = 'force-dynamic';

// ─── GET /api/assignments/feedback ──────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const operatorId = url.searchParams.get('operator_id');
    const feedbackContactId = url.searchParams.get('feedback_contact_id');
    const status = url.searchParams.get('status');
    const isActive = url.searchParams.get('is_active');

    let query = supabaseAdmin
      .from('feedback_contact_assignments')
      .select(`
        *,
        feedback_contact:feedback_contacts(*),
        operator:contact_operators(*)
      `);

    if (operatorId) query = query.eq('operator_id', operatorId);
    if (feedbackContactId) query = query.eq('feedback_contact_id', feedbackContactId);
    if (status) query = query.eq('status', status);
    if (isActive !== null && isActive !== undefined && isActive !== '') {
      query = query.eq('is_active', isActive === 'true');
    } else {
      query = query.eq('is_active', true);
    }

    query = query.order('created_at', { ascending: false });

    const { data: assignments, error } = await query;

    if (error) {
      console.error('[GET /api/assignments/feedback] DB error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, assignments: assignments || [] });
  } catch (err) {
    console.error('[GET /api/assignments/feedback] Exception:', err);
    return NextResponse.json({ error: 'Failed to fetch feedback assignments' }, { status: 500 });
  }
}

// ─── POST /api/assignments/feedback ─────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, feedbackContactId, targetOperatorId, assignedBy } = body;

    // Action 1: Dry Run Preview for Feedback Auto-Assignment
    if (action === 'dry_run') {
      const { data: activeAssignments } = await supabaseAdmin
        .from('feedback_contact_assignments')
        .select('feedback_contact_id, operator_id')
        .eq('is_active', true);

      const assignedContactIds = new Set((activeAssignments || []).map((a) => a.feedback_contact_id));

      const { data: allFeedbackContacts } = await supabaseAdmin
        .from('feedback_contacts')
        .select('id, gender');

      const unassignedContacts = (allFeedbackContacts || []).filter(
        (fc) => !assignedContactIds.has(fc.id)
      );

      const eligibleMaleContacts = unassignedContacts.filter((fc) => fc.gender === 'Male');
      const skippedFemaleContacts = unassignedContacts.filter((fc) => fc.gender === 'Female');

      // Fetch active operators
      const { data: operators } = await supabaseAdmin
        .from('contact_operators')
        .select('id, name, operator_type, is_active')
        .eq('is_active', true)
        .order('name', { ascending: true });

      const activeOperators = (operators || []).filter(
        (op) => op.operator_type === 'operator' || !op.operator_type
      );

      const operatorCapacities = activeOperators.map((op) => {
        const assignedCount = (activeAssignments || []).filter((a) => a.operator_id === op.id).length;
        const remaining = Math.max(0, MAX_OPERATOR_FEEDBACK_CAPACITY - assignedCount);
        return {
          id: op.id,
          name: op.name,
          assignedCount,
          capacity: MAX_OPERATOR_FEEDBACK_CAPACITY,
          remaining,
        };
      });

      const totalAvailableSlots = operatorCapacities.reduce((acc, op) => acc + op.remaining, 0);
      const willAssign = Math.min(eligibleMaleContacts.length, totalAvailableSlots);

      return NextResponse.json({
        success: true,
        dryRun: {
          totalUnassigned: unassignedContacts.length,
          eligibleMale: eligibleMaleContacts.length,
          eligibleFemale: skippedFemaleContacts.length,
          activeOperatorsCount: activeOperators.length,
          totalAvailableSlots,
          willAssign,
          capacityWarning: eligibleMaleContacts.length > totalAvailableSlots,
          operatorCapacities,
        },
      });
    }

    // Action 2: Bulk Auto-Assign Unassigned Male Feedback Contacts
    if (action === 'auto_assign_all') {
      const { data: activeAssignments } = await supabaseAdmin
        .from('feedback_contact_assignments')
        .select('feedback_contact_id')
        .eq('is_active', true);

      const assignedContactIds = new Set((activeAssignments || []).map((a) => a.feedback_contact_id));

      const { data: allFeedbackContacts } = await supabaseAdmin
        .from('feedback_contacts')
        .select('id, gender');

      const unassignedMaleContacts = (allFeedbackContacts || []).filter(
        (fc) => !assignedContactIds.has(fc.id) && fc.gender === 'Male'
      );

      if (unassignedMaleContacts.length === 0) {
        return NextResponse.json({
          success: true,
          assignedCount: 0,
          message: 'All eligible male feedback contacts are already assigned.',
        });
      }

      let assignedCount = 0;
      const results = [];

      for (const fc of unassignedMaleContacts) {
        const res = await autoAssignFeedbackContact(fc.id, assignedBy);
        if (res.success) assignedCount++;
        results.push({ feedbackContactId: fc.id, ...res });
      }

      return NextResponse.json({
        success: true,
        totalUnassigned: unassignedMaleContacts.length,
        assignedCount,
        results,
        message: `Successfully auto-assigned ${assignedCount} out of ${unassignedMaleContacts.length} eligible male feedback contacts. (Female contacts skipped per policy)`,
      });
    }

    // Action 3: Auto-Assign Single Feedback Contact
    if (action === 'auto_assign_single' && feedbackContactId) {
      const res = await autoAssignFeedbackContact(feedbackContactId, assignedBy);
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    // Action 4: Manual Assignment / Reassignment
    if (feedbackContactId && targetOperatorId) {
      const res = await assignFeedbackContactManually(feedbackContactId, targetOperatorId, assignedBy);
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    return NextResponse.json({ error: 'Invalid assignment payload parameters' }, { status: 400 });
  } catch (err) {
    console.error('[POST /api/assignments/feedback] Exception:', err);
    return NextResponse.json({ error: 'Failed to process feedback assignment' }, { status: 500 });
  }
}
