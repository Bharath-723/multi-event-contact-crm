import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { normalizeSource } from '@/lib/source-resolver';

async function requireAdmin(
  req: Request
): Promise<{ error: NextResponse | null; userId?: string }> {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const { data: adminRow } = await supabaseAdmin
    .from('admins')
    .select('id')
    .eq('id', user.id)
    .single();
  if (!adminRow) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };

  return { error: null, userId: user.id };
}

export async function POST(request: NextRequest) {
  const { error: authError, userId } = await requireAdmin(request);
  if (authError) return authError;

  try {
    let body: { source?: string; operator_id?: string } = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const source = normalizeSource(body.source ?? 'rathayatra');
    const operatorId = body.operator_id ? String(body.operator_id) : null;

    if (source === 'master_dashboard') {
      let countQuery = supabaseAdmin
        .from('master_contact_assignments')
        .select('id', { count: 'exact', head: true });

      if (operatorId) countQuery = countQuery.eq('operator_id', operatorId);

      const { count: activeCount } = await countQuery;
      const totalToUnassign = activeCount ?? 0;

      if (totalToUnassign === 0) {
        return NextResponse.json({
          success: true,
          affected_count: 0,
          message: 'No active Master Dashboard contacts to unassign.',
          source,
        });
      }

      let deleteQuery = supabaseAdmin
        .from('master_contact_assignments')
        .delete();

      if (operatorId) deleteQuery = deleteQuery.eq('operator_id', operatorId);
      else deleteQuery = deleteQuery.neq('id', '00000000-0000-0000-0000-000000000000');

      const { error: delErr } = await deleteQuery;

      if (delErr) {
        return NextResponse.json({ error: `Failed to unassign master contacts: ${delErr.message}` }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        affected_count: totalToUnassign,
        message: `Successfully unassigned ${totalToUnassign} Master Dashboard contact${totalToUnassign === 1 ? '' : 's'}.`,
        source,
      });
    }

    const assignTable =
      source === 'krishnashtami'
        ? 'krishnashtami_contact_assignments'
        : source === 'feedback_contacts'
        ? 'feedback_contact_assignments'
        : 'contact_assignments';

    // 1. Query current active count to unassign
    let countQuery = supabaseAdmin
      .from(assignTable)
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true);

    if (operatorId) {
      countQuery = countQuery.eq('operator_id', operatorId);
    }

    const { count: activeCount, error: countErr } = await countQuery;

    if (countErr) {
      return NextResponse.json({ error: `Failed to count active assignments: ${countErr.message}` }, { status: 500 });
    }

    const totalToUnassign = activeCount ?? 0;

    if (totalToUnassign === 0) {
      return NextResponse.json({
        success: true,
        affected_count: 0,
        message: 'No active contacts to unassign.',
        source,
      });
    }

    // 2. Perform bulk update setting is_active = FALSE
    let updateQuery = supabaseAdmin
      .from(assignTable)
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('is_active', true);

    if (operatorId) {
      updateQuery = updateQuery.eq('operator_id', operatorId);
    }

    const { error: updateErr } = await updateQuery;

    if (updateErr) {
      return NextResponse.json({ error: `Failed to unassign contacts: ${updateErr.message}` }, { status: 500 });
    }

    // 3. Write audit log
    await supabaseAdmin.from('audit_logs').insert({
      admin_id: userId ?? null,
      action: operatorId ? 'OPERATOR_UNASSIGN_ALL' : 'GLOBAL_UNASSIGN_ALL',
      details: {
        source,
        operator_id: operatorId,
        unassigned_count: totalToUnassign,
      },
    });

    return NextResponse.json({
      success: true,
      affected_count: totalToUnassign,
      message: `Successfully unassigned ${totalToUnassign} active contact${totalToUnassign === 1 ? '' : 's'}.`,
      source,
    });
  } catch (err) {
    console.error('[POST /api/assignments/unassign-all] Exception:', err);
    return NextResponse.json({ error: 'An unexpected server error occurred.' }, { status: 500 });
  }
}
