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

  // Step 1: Resolve registration IDs for this festival.
  let regQuery = supabaseAdmin
    .from(regTable)
    .select('id');

  if (!sourceConfig.isKrishnashtami) {
    regQuery = regQuery.eq('festival_event_id', festivalEventId);
  }

  const { data: regRows, error: regErr } = await regQuery;

  if (regErr) {
    return NextResponse.json({ error: regErr.message }, { status: 500 });
  }

  const registrationIds = (regRows ?? []).map((r) => r.id);

  if (registrationIds.length === 0) {
    return NextResponse.json({ logs: [] });
  }

  const selectQuery = sourceConfig.isKrishnashtami
    ? `
      id,
      visited_at,
      visit_method,
      visited_by_admin,
      remarks,
      registration_id,
      ${regTable}!inner (
        registration_no,
        full_name,
        phone,
        festival_event_id
      )
    `
    : `
      id,
      visited_at,
      visit_method,
      visited_by_admin,
      remarks,
      registration_id,
      ${regTable}!inner (
        registration_no,
        full_name,
        phone,
        festival_event_id
      ),
      contact_operators (
        name
      )
    `;

  // Step 2: Fetch visitor visits from target visitsTable.
  const { data: logs, error: logsErr } = await supabaseAdmin
    .from(visitsTable)
    .select(selectQuery)
    .in('registration_id', registrationIds)
    .order('visited_at', { ascending: false })
    .limit(limit);

  if (logsErr) {
    return NextResponse.json({ error: logsErr.message }, { status: 500 });
  }

  const formatted = ((logs ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const regRaw = row[regTable] as unknown;
    const reg = Array.isArray(regRaw) ? regRaw[0] : regRaw;
    const opRaw = row.contact_operators as unknown;
    const operator = Array.isArray(opRaw) ? opRaw[0] : opRaw;
    return {
      id: String(row.id ?? ''),
      visited_at: String(row.visited_at ?? ''),
      visit_method: String(row.visit_method ?? 'MANUAL_SEARCH'),
      registration_no: (reg as { registration_no?: string })?.registration_no ?? '—',
      full_name: (reg as { full_name?: string })?.full_name ?? '—',
      phone: (reg as { phone?: string })?.phone ?? '—',
      checked_in_by: (operator as { name?: string })?.name ?? (row.visited_by_admin ? 'Admin' : 'System'),
      status: 'Visited'
    };
  });

  return NextResponse.json({ logs: formatted });
}
