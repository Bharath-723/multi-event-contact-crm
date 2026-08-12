import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { FeedbackAssignmentStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

// ─── PATCH /api/assignments/feedback/[id] ───────────────────────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, notes, is_active } = body as {
      status?: FeedbackAssignmentStatus;
      notes?: string;
      is_active?: boolean;
    };

    // 1. Fetch current assignment
    const { data: currentAssignment, error: fetchErr } = await supabaseAdmin
      .from('feedback_contact_assignments')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !currentAssignment) {
      return NextResponse.json({ error: 'Feedback assignment record not found' }, { status: 404 });
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (notes !== undefined) updatePayload.notes = notes;
    if (status !== undefined) updatePayload.status = status;

    // Handle "Not Coming" / Deactivation workflow
    if (status === 'Not Coming' || is_active === false) {
      updatePayload.is_active = false;
    } else if (is_active !== undefined) {
      updatePayload.is_active = is_active;
    }

    // 2. Perform update
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('feedback_contact_assignments')
      .update(updatePayload)
      .eq('id', id)
      .select(`
        *,
        feedback_contact:feedback_contacts(*),
        operator:contact_operators(*)
      `)
      .single();

    if (updateErr) {
      console.error('[PATCH /api/assignments/feedback/[id]] Update error:', updateErr);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // 3. Log audit action
    const auditAction = status === 'Not Coming' ? 'FEEDBACK_COMPLETED' : 'FEEDBACK_STATUS_CHANGED';
    await supabaseAdmin.from('audit_logs').insert({
      action: auditAction,
      details: {
        assignment_id: id,
        feedback_contact_id: currentAssignment.feedback_contact_id,
        operator_id: currentAssignment.operator_id,
        previous_status: currentAssignment.status,
        new_status: status || currentAssignment.status,
        is_active: updatePayload.is_active ?? currentAssignment.is_active,
      },
    });

    return NextResponse.json({
      success: true,
      assignment: updated,
      message: `Assignment updated successfully to ${status || updated.status}`,
    });
  } catch (err) {
    console.error('[PATCH /api/assignments/feedback/[id]] Exception:', err);
    return NextResponse.json({ error: 'Failed to update feedback assignment' }, { status: 500 });
  }
}
