import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getOperatorSessionFromRequest } from '@/lib/operator-auth';
import { normalizeSource } from '@/lib/source-resolver';

export async function GET(req: Request) {
  const session = getOperatorSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Re-validate that operator is still active
  const { data: op } = await supabaseAdmin
    .from('contact_operators')
    .select('id, is_active')
    .eq('id', session.operatorId)
    .single();

  if (!op || !op.is_active) {
    return NextResponse.json({ error: 'Account disabled' }, { status: 403 });
  }

  const url = new URL(req.url);
  const rawSource = url.searchParams.get('source') ?? url.searchParams.get('contact_source');
  const source = normalizeSource(rawSource);
  const isActiveParam = url.searchParams.get('is_active');
  const statusFilter = (url.searchParams.get('status') ?? '').trim();

  const assignTable =
    source === 'krishnashtami'
      ? 'krishnashtami_contact_assignments'
      : source === 'feedback_contacts'
      ? 'feedback_contact_assignments'
      : 'contact_assignments';

  let selectQuery = '';
  if (source === 'krishnashtami') {
    selectQuery = `
      id, registration_id, operator_id, assigned_at, called_at,
      status, remarks, is_active, created_at, updated_at,
      krishnashtami_registrations!registration_id (*)
    `;
  } else if (source === 'feedback_contacts') {
    selectQuery = `
      id, feedback_contact_id, operator_id, assigned_at,
      status, notes, is_active, created_at, updated_at,
      feedback_contacts!feedback_contact_id (*)
    `;
  } else {
    selectQuery = `
      id, registration_id, operator_id, assigned_at, called_at,
      status, remarks, is_active, created_at, updated_at,
      registrations!registration_id (*)
    `;
  }

  let query = supabaseAdmin
    .from(assignTable)
    .select(selectQuery)
    .eq('operator_id', session.operatorId);

  if (isActiveParam !== null && isActiveParam !== undefined) {
    const isActive = isActiveParam === 'true';
    query = query.eq('is_active', isActive);
  }

  if (statusFilter && statusFilter !== 'ALL') {
    query = query.eq('status', statusFilter);
  }

  const { data, error } = await query.order('assigned_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Compute stats across all assignments for this operator in this source
  const { data: allSourceAssignments } = await supabaseAdmin
    .from(assignTable)
    .select('id, status, is_active')
    .eq('operator_id', session.operatorId);

  const allList = allSourceAssignments ?? [];
  const activeList = allList.filter((a) => a.is_active);

  const stats = {
    total_assigned: activeList.length,
    total_coming: allList.filter((a) => a.status === 'Coming' || a.status === 'Interested' || a.status === 'Confirmed' || a.status === 'Completed').length,
    total_not_coming: allList.filter((a) => a.status === 'Not Coming').length,
    total_not_connected: allList.filter((a) => a.status === 'Not Connected' || a.status === 'Callback Required' || a.status === 'Pending').length,
  };

  return NextResponse.json({
    assignments: data ?? [],
    stats,
    source,
  });
}
