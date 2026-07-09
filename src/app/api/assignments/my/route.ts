/**
 * GET /api/assignments/my
 * Operator-only: returns paginated, searchable list of their own assigned contacts.
 * Auth: httpOnly JWT cookie (operator-session).
 * Security: All queries hard-filtered by operator_id from JWT — never trusts URL params.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getOperatorSessionFromRequest } from '@/lib/operator-auth';

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
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, parseInt(url.searchParams.get('limit') ?? '30', 10));
  const search = (url.searchParams.get('search') ?? '').trim();
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let matchedIds: string[] = [];
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(search);

  if (search) {
    const { data: matchedRegs, error: matchError } = await supabaseAdmin
      .from('registrations')
      .select('id')
      .or(`full_name.ilike.%${search}%,phone.ilike.%${search}%`);

    if (!matchError && matchedRegs) {
      matchedIds = matchedRegs.map((r) => r.id);
    }
  }

  // Build query — ALWAYS filter by session operator_id
  let query = supabaseAdmin
    .from('contact_assignments')
    .select(`
      id, registration_id, operator_id, assigned_at, called_at,
      status, remarks, is_active, created_at, updated_at,
      registrations!registration_id (*)
    `, { count: 'exact' })
    .eq('operator_id', session.operatorId)  // CRITICAL security filter
    .eq('is_active', true)
    .order('assigned_at', { ascending: false })
    .range(from, to);

  // Search filter applied on registration fields
  if (search) {
    if (matchedIds.length === 0 && !isUuid) {
      const { data: statsData } = await supabaseAdmin.rpc('get_operator_stats', {
        p_operator_id: session.operatorId,
      });
      const stats = statsData?.[0] ?? {};
      return NextResponse.json({
        assignments: [],
        total: 0,
        page,
        limit,
        stats: {
          total_assigned:   Number(stats.total_assigned   ?? 0),
          total_pending:    Number(stats.total_pending    ?? 0),
          total_completed:  Number(stats.total_completed  ?? 0),
          total_called:     Number(stats.total_called     ?? 0),
          call_success_pct: Number(stats.call_success_pct ?? 0),
        },
      });
    }

    if (isUuid) {
      if (matchedIds.length > 0) {
        query = query.or(`registration_id.eq.${search},registration_id.in.(${matchedIds.join(',')})`);
      } else {
        query = query.eq('registration_id', search);
      }
    } else {
      query = query.in('registration_id', matchedIds);
    }
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Compute stats for the operator dashboard header
  const { data: statsData } = await supabaseAdmin.rpc('get_operator_stats', {
    p_operator_id: session.operatorId,
  });
  const stats = statsData?.[0] ?? {};

  return NextResponse.json({
    assignments: data,
    total: count ?? 0,
    page,
    limit,
    stats: {
      total_assigned:   Number(stats.total_assigned   ?? 0),
      total_pending:    Number(stats.total_pending    ?? 0),
      total_completed:  Number(stats.total_completed  ?? 0),
      total_called:     Number(stats.total_called     ?? 0),
      call_success_pct: Number(stats.call_success_pct ?? 0),
    },
  });
}
