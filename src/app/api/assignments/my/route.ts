import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getOperatorSessionFromRequest } from '@/lib/operator-auth';
import { normalizeSource } from '@/lib/source-resolver';
import { computeOperatorStats } from '@/lib/status-normalizer';

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
  const statusFilter = (url.searchParams.get('status') ?? '').trim();

  if (source === 'master_dashboard') {
    let q = supabaseAdmin
      .from('master_contact_assignments')
      .select(`
        id, master_contact_id, operator_id, assigned_at,
        status, comments, is_active, updated_at,
        master_contacts!master_contact_id (*)
      `)
      .eq('operator_id', session.operatorId)
      .eq('is_active', true);

    if (statusFilter && statusFilter !== 'ALL') {
      q = q.eq('status', statusFilter);
    }

    const { data, error } = await q.order('assigned_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rawList = (data as unknown as Record<string, unknown>[]) ?? [];
    const normalizedAssignments = rawList.map((row) => {
      const mc = (row.master_contacts as Record<string, unknown> | null) || {};
      const contactObj = {
        ...mc,
        full_name: mc.name || mc.full_name || '—',
        phone: mc.phone || '',
        college_name: mc.company_college || mc.college_name || '',
        company_college: mc.company_college || '',
        branch: mc.occupation || mc.branch || '',
        occupation: mc.occupation || '',
        area_of_stay: mc.area_of_stay || '',
        current_stay: mc.area_of_stay || '',
      };

      return {
        ...row,
        notes: row.comments || row.notes || '',
        remarks: row.comments || row.remarks || '',
        master_contacts: contactObj,
        master_contact: contactObj,
        feedback_contact: contactObj,
      };
    });

    const { data: activeAssignments } = await supabaseAdmin
      .from('master_contact_assignments')
      .select('id, status, is_active')
      .eq('operator_id', session.operatorId)
      .eq('is_active', true);

    const statsObj = computeOperatorStats(activeAssignments ?? []);

    return NextResponse.json({
      assignments: normalizedAssignments,
      stats: {
        total_assigned: statsObj.assigned,
        total_coming: statsObj.coming,
        total_not_coming: statsObj.notComing,
        total_not_answered: statsObj.notAnswered,
        total_next_week: statsObj.nextWeek,
        total_not_connected: statsObj.notAnswered,
      },
      source,
    });
  }

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
      status, notes, remarks, is_active, created_at, updated_at,
      krishnashtami_registrations!registration_id (*)
    `;
  } else if (source === 'feedback_contacts') {
    selectQuery = `
      id, feedback_contact_id, operator_id, assigned_at,
      status, notes, remarks, is_active, created_at, updated_at,
      feedback_contacts!feedback_contact_id (*)
    `;
  } else {
    selectQuery = `
      id, registration_id, operator_id, assigned_at, called_at,
      status, notes, remarks, is_active, created_at, updated_at,
      registrations!registration_id (*)
    `;
  }

  let query = supabaseAdmin
    .from(assignTable)
    .select(selectQuery)
    .eq('operator_id', session.operatorId)
    .eq('is_active', true);

  if (statusFilter && statusFilter !== 'ALL') {
    query = query.eq('status', statusFilter);
  }

  const { data, error } = await query.order('assigned_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rawList = (data as unknown as Record<string, unknown>[]) ?? [];
  const normalizedAssignments = rawList.map((row) => {
    const contactObj = row.feedback_contacts || row.feedback_contact || row.krishnashtami_registrations || row.registrations;
    const noteText = (row.notes as string) || (row.remarks as string) || (row.comments as string) || '';
    return {
      ...row,
      notes: noteText,
      remarks: noteText,
      feedback_contact: contactObj,
    };
  });

  const { data: activeAssignments } = await supabaseAdmin
    .from(assignTable)
    .select('id, status, is_active')
    .eq('operator_id', session.operatorId)
    .eq('is_active', true);

  const statsObj = computeOperatorStats(activeAssignments ?? []);

  const stats = {
    total_assigned: statsObj.assigned,
    total_coming: statsObj.coming,
    total_not_coming: statsObj.notComing,
    total_not_answered: statsObj.notAnswered,
    total_next_week: statsObj.nextWeek,
    total_not_connected: statsObj.notAnswered,
  };

  return NextResponse.json({
    assignments: normalizedAssignments,
    stats,
    source,
  });
}
