import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getOperatorSessionFromRequest } from '@/lib/operator-auth';
import { normalizeSource } from '@/lib/source-resolver';
import { getCurrentWeeklyPeriod } from '@/lib/weekly-period';
import type { AssignmentStatus } from '@/lib/types';

const VALID_STATUSES: AssignmentStatus[] = [
  'Pending', 'Assigned', 'Coming', 'Not Coming', 'Not Answered', 'Next Week', 'Not Interested', 'Not in Hyderabad', 'Not Connected', 'Callback Required',
];

function getAssignmentTable(source: string | null) {
  const norm = normalizeSource(source);
  if (norm === 'master_dashboard') return 'master_contact_assignments';
  if (norm === 'krishnashtami') return 'krishnashtami_contact_assignments';
  if (norm === 'feedback_contacts') return 'feedback_contact_assignments';
  return 'contact_assignments';
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const url = new URL(req.url);
  const sourceParam = url.searchParams.get('source') ?? 'master_dashboard';
  const assignTable = getAssignmentTable(sourceParam);

  const session = getOperatorSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const { data: assignment, error: fetchError } = await supabaseAdmin
    .from(assignTable)
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !assignment) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
  }

  if (assignment.operator_id !== session.operatorId) {
    return NextResponse.json({ error: 'Forbidden: Not your assignment' }, { status: 403 });
  }

  let body: { status?: string; remarks?: string; notes?: string; comments?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  const oldStatus = assignment.status as AssignmentStatus;

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status as AssignmentStatus)) {
      return NextResponse.json({ error: `Invalid status: ${body.status}` }, { status: 400 });
    }
    updates.status = body.status;
    if (assignTable === 'master_contact_assignments') {
      updates.status_weekly_period = getCurrentWeeklyPeriod();
    }
    if (body.status !== 'Pending' && !assignment.status) {
      updates.called_at = new Date().toISOString();
    }
    // When marked Not Interested, automatically deactivate active assignment atomically
    if (body.status === 'Not Interested') {
      updates.is_active = false;
    }
  }

  if (body.notes !== undefined || body.remarks !== undefined || body.comments !== undefined) {
    const textVal = body.notes !== undefined ? body.notes : body.remarks !== undefined ? body.remarks : body.comments;
    if (assignTable === 'master_contact_assignments') {
      updates.comments = textVal;
    } else {
      updates.notes = textVal;
      updates.remarks = textVal;
    }
  }

  if (Object.keys(updates).length <= 1) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  let { data: updated, error: updateError } = await supabaseAdmin
    .from(assignTable)
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  // Backward compatibility fallback if status_weekly_period column does not exist yet (code 42703)
  if (updateError && (updateError.code === '42703' || updateError.message?.includes('status_weekly_period'))) {
    delete updates.status_weekly_period;
    const retryNoCol = await supabaseAdmin
      .from(assignTable)
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    updated = retryNoCol.data;
    updateError = retryNoCol.error;
  }

  if (updateError && updateError.code === '23514') {
    if (updates.status === 'Not Answered') {
      updates.status = 'Not Connected';
    } else if (updates.status === 'Next Week') {
      updates.status = 'Callback Required';
    }
    const retryRes = await supabaseAdmin
      .from(assignTable)
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    updated = retryRes.data;
    updateError = retryRes.error;
  }

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // When marked Not Interested, persist exclusion on master contact and audit log
  if (body.status === 'Not Interested') {
    let masterId = (assignment as Record<string, unknown>).master_contact_id as string | undefined;
    let cleanPhone: string | undefined;
    if (!masterId) {
      const regId = (assignment as Record<string, unknown>).registration_id || (assignment as Record<string, unknown>).feedback_contact_id;
      if (regId) {
        const { data: eventMatch } = await supabaseAdmin
          .from('master_contact_events')
          .select('master_contact_id')
          .eq('event_record_id', String(regId))
          .maybeSingle();

        if (eventMatch?.master_contact_id) {
          masterId = eventMatch.master_contact_id;
        } else {
          const regTable = assignTable === 'feedback_contact_assignments'
            ? 'feedback_contacts'
            : assignTable === 'krishnashtami_contact_assignments'
            ? 'krishnashtami_registrations'
            : 'registrations';

          const { data: regData } = await supabaseAdmin
            .from(regTable)
            .select('phone')
            .eq('id', regId)
            .maybeSingle();

          if (regData?.phone) {
            const { normalizePhone } = await import('@/lib/master-contacts');
            cleanPhone = normalizePhone(regData.phone);
            if (cleanPhone) {
              const { data: mc } = await supabaseAdmin
                .from('master_contacts')
                .select('id')
                .eq('phone', cleanPhone)
                .maybeSingle();
              if (mc?.id) masterId = mc.id;
            }
          }
        }
      }
    } else {
      const { data: mcPhone } = await supabaseAdmin
        .from('master_contacts')
        .select('phone')
        .eq('id', masterId)
        .maybeSingle();
      if (mcPhone?.phone) {
        const { normalizePhone } = await import('@/lib/master-contacts');
        cleanPhone = normalizePhone(mcPhone.phone);
      }
    }

    if (masterId || cleanPhone) {
      try {
        const { error: rpcErr } = await supabaseAdmin.rpc('mark_contact_not_interested_atomic', {
          p_master_contact_id: masterId || null,
          p_phone: cleanPhone || null,
          p_operator_id: session.operatorId || null,
          p_reason: (body.remarks || body.notes || 'Status changed to Not Interested') as string,
        });
        if (rpcErr) {
          console.warn('[assignments/[id]] mark_contact_not_interested_atomic error, falling back to direct update:', rpcErr);
          if (masterId) {
            await supabaseAdmin
              .from('master_contacts')
              .update({
                is_not_interested: true,
                not_interested_at: new Date().toISOString(),
                not_interested_by: session.operatorId || null,
              })
              .eq('id', masterId);
          } else if (cleanPhone) {
            await supabaseAdmin
              .from('master_contacts')
              .update({
                is_not_interested: true,
                not_interested_at: new Date().toISOString(),
                not_interested_by: session.operatorId || null,
              })
              .eq('phone', cleanPhone);
          }
        }
      } catch (err) {
        console.warn('Could not set is_not_interested on master_contacts:', err);
      }
    }
  }

  const isStatusChange = body.status !== undefined;
  await supabaseAdmin.from('audit_logs').insert({
    action: isStatusChange
      ? (body.status === 'Not Interested' ? 'CONTACT_MARKED_NOT_INTERESTED' : 'ASSIGNMENT_STATUS_UPDATED')
      : 'ASSIGNMENT_REMARKS_UPDATED',
    details: {
      assignment_id: id,
      contact_id:
        (assignment as Record<string, unknown>).master_contact_id ||
        (assignment as Record<string, unknown>).registration_id ||
        (assignment as Record<string, unknown>).feedback_contact_id,
      operator_id: session.operatorId,
      operator_name: session.name,
      source: sourceParam ?? 'master_dashboard',
      ...(body.status !== undefined ? {
        old_status: oldStatus,
        new_status: body.status,
        deactivated_assignment: body.status === 'Not Interested',
      } : {}),
      timestamp: new Date().toISOString(),
      changes: updates,
    },
  });

  return NextResponse.json({ assignment: updated });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const url = new URL(req.url);
  const sourceParam = url.searchParams.get('source') ?? 'master_dashboard';
  const assignTable = getAssignmentTable(sourceParam);

  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: adminRow } = await supabaseAdmin.from('admins').select('id').eq('id', user.id).single();
  if (!adminRow) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  let body: { status?: string; remarks?: string; notes?: string; comments?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (body.status) {
    updates.status = body.status;
    if (body.status === 'Not Interested') {
      updates.is_active = false;
    }
  }
  if (body.notes !== undefined || body.remarks !== undefined || body.comments !== undefined) {
    const textVal = body.notes !== undefined ? body.notes : body.remarks !== undefined ? body.remarks : body.comments;
    if (assignTable === 'master_contact_assignments') {
      updates.comments = textVal;
    } else {
      updates.notes = textVal;
      updates.remarks = textVal;
    }
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from(assignTable)
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  if (body.status === 'Not Interested' && updated) {
    let masterId = (updated as Record<string, unknown>).master_contact_id as string | undefined;
    if (!masterId) {
      const regId = (updated as Record<string, unknown>).registration_id || (updated as Record<string, unknown>).feedback_contact_id;
      if (regId) {
        const { data: eventMatch } = await supabaseAdmin
          .from('master_contact_events')
          .select('master_contact_id')
          .eq('event_record_id', String(regId))
          .maybeSingle();

        if (eventMatch?.master_contact_id) {
          masterId = eventMatch.master_contact_id;
        } else {
          const regTable = assignTable === 'feedback_contact_assignments'
            ? 'feedback_contacts'
            : assignTable === 'krishnashtami_contact_assignments'
            ? 'krishnashtami_registrations'
            : 'registrations';

          const { data: regData } = await supabaseAdmin
            .from(regTable)
            .select('phone')
            .eq('id', regId)
            .maybeSingle();

          if (regData?.phone) {
            const { normalizePhone } = await import('@/lib/master-contacts');
            const cleanPhone = normalizePhone(regData.phone);
            if (cleanPhone) {
              const { data: mc } = await supabaseAdmin
                .from('master_contacts')
                .select('id')
                .eq('phone', cleanPhone)
                .maybeSingle();
              if (mc?.id) masterId = mc.id;
            }
          }
        }
      }
    }

    if (masterId) {
      try {
        await supabaseAdmin
          .from('master_contacts')
          .update({
            is_not_interested: true,
            not_interested_at: new Date().toISOString(),
          })
          .eq('id', masterId);
      } catch (err) {
        console.warn('Could not set is_not_interested on master_contacts in admin PUT:', err);
      }
    }
  }
  return NextResponse.json({ assignment: updated });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const url = new URL(req.url);
  const sourceParam = url.searchParams.get('source') ?? 'master_dashboard';
  const assignTable = getAssignmentTable(sourceParam);

  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: adminRow } = await supabaseAdmin.from('admins').select('id').eq('id', user.id).single();
  if (!adminRow) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;

  const { data: updatedRows, error: updateError } = await supabaseAdmin
    .from(assignTable)
    .update({
      is_active: false,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  if (!updatedRows || updatedRows.length === 0) {
    const fkCol = assignTable === 'master_contact_assignments' ? 'master_contact_id' : assignTable === 'feedback_contact_assignments' ? 'feedback_contact_id' : 'registration_id';
    const { data: updatedByReg, error: regUpdateErr } = await supabaseAdmin
      .from(assignTable)
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq(fkCol, id)
      .eq('is_active', true)
      .select();

    if (regUpdateErr) return NextResponse.json({ error: regUpdateErr.message }, { status: 500 });
    if (!updatedByReg || updatedByReg.length === 0) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }

    const updated = updatedByReg[0];
    await supabaseAdmin.from('audit_logs').insert({
      admin_id: user.id,
      action: 'ASSIGNMENT_DEACTIVATED',
      details: {
        assignment_id: updated.id,
        contact_id: id,
        source: sourceParam,
        operator_id: (updated as { operator_id?: string }).operator_id
      },
    });

    return NextResponse.json({ message: 'Assignment deactivated successfully', assignment: updated });
  }

  const updated = updatedRows[0];
  await supabaseAdmin.from('audit_logs').insert({
    admin_id: user.id,
    action: 'ASSIGNMENT_DEACTIVATED',
    details: {
      assignment_id: id,
      source: sourceParam ?? 'rathayatra',
      operator_id: (updated as { operator_id?: string }).operator_id
    },
  });

  return NextResponse.json({ message: 'Assignment deactivated successfully', assignment: updated });
}
