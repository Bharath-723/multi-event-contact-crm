/**
 * PATCH /api/assignments/[id]
 * Operator: update call status and/or remarks on their own assignment.
 * Server-side validation ensures operator owns the assignment.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getOperatorSessionFromRequest } from '@/lib/operator-auth';
import type { AssignmentStatus } from '@/lib/types';

const VALID_STATUSES: AssignmentStatus[] = [
  'Pending', 'Coming', 'Not Coming', 'Callback Required',
];

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Validate operator session from cookie
  const session = getOperatorSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // Fetch the assignment and verify it belongs to this operator
  const { data: assignment, error: fetchError } = await supabaseAdmin
    .from('contact_assignments')
    .select('id, operator_id, status, is_active')
    .eq('id', id)
    .single();

  if (fetchError || !assignment) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
  }

  // Security: reject if assignment belongs to another operator
  if (assignment.operator_id !== session.operatorId) {
    return NextResponse.json({ error: 'Forbidden: Not your assignment' }, { status: 403 });
  }

  if (!assignment.is_active) {
    return NextResponse.json({ error: 'This assignment is no longer active' }, { status: 400 });
  }

  let body: { status?: string; remarks?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  const oldStatus = assignment.status as AssignmentStatus;

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status as AssignmentStatus)) {
      return NextResponse.json({ error: `Invalid status: ${body.status}` }, { status: 400 });
    }
    updates.status = body.status;
    // Record when contact was first actioned
    if (body.status !== 'Pending' && !assignment.status) {
      updates.called_at = new Date().toISOString();
    }
  }

  if (body.remarks !== undefined) {
    updates.remarks = body.remarks;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('contact_assignments')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // Audit log with full status change details
  const isStatusChange = body.status !== undefined;
  await supabaseAdmin.from('audit_logs').insert({
    action: isStatusChange ? 'ASSIGNMENT_STATUS_UPDATED' : 'ASSIGNMENT_REMARKS_UPDATED',
    details: {
      assignment_id: id,
      operator_id: session.operatorId,
      operator_name: session.name,
      ...(isStatusChange ? {
        old_status: oldStatus,
        new_status: body.status,
      } : {}),
      timestamp: new Date().toISOString(),
      changes: updates,
    },
  });

  return NextResponse.json({ assignment: updated });
}

// Admin can also PATCH (e.g., to add remarks from admin side)
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Admin auth
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: adminRow } = await supabaseAdmin.from('admins').select('id').eq('id', user.id).single();
  if (!adminRow) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  let body: { status?: string; remarks?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.status) updates.status = body.status;
  if (body.remarks !== undefined) updates.remarks = body.remarks;

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('contact_assignments')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ assignment: updated });
}

// DELETE /api/assignments/[id]
// Admin: deactivate assignment (unassign contact) while keeping audit log history
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: adminRow } = await supabaseAdmin.from('admins').select('id').eq('id', user.id).single();
  if (!adminRow) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('contact_assignments')
    .update({
      is_active: false,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select('id, registration_id, operator_id')
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

  // Record audit log
  await supabaseAdmin.from('audit_logs').insert({
    admin_id: user.id,
    action: 'ASSIGNMENT_DEACTIVATED',
    details: {
      assignment_id: id,
      registration_id: updated.registration_id,
      operator_id: updated.operator_id
    },
  });

  return NextResponse.json({ message: 'Assignment deactivated successfully', assignment: updated });
}
