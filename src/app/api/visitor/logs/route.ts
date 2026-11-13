import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getRegistrationSource } from '@/lib/source-resolver';

export async function GET(req: Request) {
  // Check authorization
  const authHeader = req.headers.get('Authorization') || '';
  let isAdmin = false;

  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (!error && user) {
      const { data: adminRow } = await supabaseAdmin
        .from('admins')
        .select('id')
        .eq('id', user.id)
        .single();
      if (adminRow) {
        isAdmin = true;
      }
    }
  }

  // Also verify operator session just for authorization
  const cookieHeader = req.headers.get('cookie') || '';
  const hasSession = cookieHeader.includes('operator-session=') || isAdmin;

  if (!hasSession) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Math.min(100, parseInt(url.searchParams.get('limit') ?? '50', 10));
  const festivalEventId = url.searchParams.get('festival_event_id');

  if (!festivalEventId) {
    return NextResponse.json(
      { error: 'festival_event_id is required' },
      { status: 400 }
    );
  }

  const sourceConfig = getRegistrationSource(festivalEventId);
  const regTable = sourceConfig.regTable;
  const visitsTable = sourceConfig.visitsTable;

  // Primary strategy: Query visits with inner join on registration table filtered by festival_event_id
  let query = supabaseAdmin
    .from(visitsTable)
    .select(`
      id,
      visited_at,
      visit_method,
      visited_by,
      visited_by_admin,
      remarks,
      registration_id,
      ${regTable}!inner (
        registration_no,
        full_name,
        phone,
        festival_event_id
      )
    `);

  if (!sourceConfig.isKrishnashtami) {
    query = query.eq(`${regTable}.festival_event_id`, festivalEventId);
  }

  let { data: logs, error: logsErr } = await query
    .order('visited_at', { ascending: false })
    .limit(limit);

  // Fallback strategy if inner-join filtering fails on PostgREST schema cache
  if (logsErr) {
    console.warn('[GET /api/visitor/logs] Primary query error, attempting fallback:', logsErr.message);

    // Fetch the latest visits directly (bounded by limit)
    const fallbackVisitsRes = await supabaseAdmin
      .from(visitsTable)
      .select('id, visited_at, visit_method, visited_by, visited_by_admin, remarks, registration_id')
      .order('visited_at', { ascending: false })
      .limit(limit);

    if (fallbackVisitsRes.error) {
      console.error('[GET /api/visitor/logs] Fallback DB Error:', fallbackVisitsRes.error);
      return NextResponse.json({ error: fallbackVisitsRes.error.message }, { status: 500 });
    }

    const rawVisits = fallbackVisitsRes.data ?? [];
    const visitRegIds = Array.from(new Set(rawVisits.map((v) => v.registration_id).filter(Boolean)));

    let regMap: Record<string, { registration_no: string; full_name: string; phone: string; festival_event_id: string }> = {};
    if (visitRegIds.length > 0) {
      const { data: regRows } = await supabaseAdmin
        .from(regTable)
        .select('id, registration_no, full_name, phone, festival_event_id')
        .in('id', visitRegIds);
      if (regRows) {
        for (const r of regRows) {
          regMap[r.id] = r;
        }
      }
    }

    // Filter to festival if required
    const filteredVisits = rawVisits.filter((v) => {
      if (sourceConfig.isKrishnashtami) return true;
      const reg = regMap[v.registration_id];
      return reg && reg.festival_event_id === festivalEventId;
    });

    logs = filteredVisits.map((v) => ({
      ...v,
      [regTable]: regMap[v.registration_id] || null,
    })) as unknown as typeof logs;
    logsErr = null;
  }

  // Resolve operator names for checked_in_by
  const visitedByIds = Array.from(
    new Set(
      (logs ?? [])
        .map((r) => (r as { visited_by?: string | null })?.visited_by)
        .filter((id): id is string => Boolean(id))
    )
  );

  let opNameMap: Record<string, string> = {};
  if (visitedByIds.length > 0) {
    const { data: opRows } = await supabaseAdmin
      .from('contact_operators')
      .select('id, name')
      .in('id', visitedByIds);
    if (opRows) {
      for (const op of opRows) {
        opNameMap[op.id] = op.name;
      }
    }
  }

  const formatted = ((logs ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const regRaw = row[regTable] as unknown;
    const reg = Array.isArray(regRaw) ? regRaw[0] : regRaw;
    const visitedBy = String(row.visited_by ?? '');
    const opName = opNameMap[visitedBy];

    return {
      id: String(row.id ?? ''),
      visited_at: String(row.visited_at ?? ''),
      visit_method: String(row.visit_method ?? 'MANUAL_SEARCH'),
      registration_no: (reg as { registration_no?: string })?.registration_no ?? '—',
      full_name: (reg as { full_name?: string })?.full_name ?? '—',
      phone: (reg as { phone?: string })?.phone ?? '—',
      checked_in_by: opName ?? (row.visited_by_admin ? 'Admin' : 'System'),
      status: 'Visited'
    };
  });

  return NextResponse.json({ logs: formatted });
}
