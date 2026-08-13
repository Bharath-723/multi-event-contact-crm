import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

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

  // festival_event_id is required — reject global (unscoped) log requests.
  if (!festivalEventId) {
    return NextResponse.json(
      { error: 'festival_event_id is required' },
      { status: 400 }
    );
  }

  // Step 1: Resolve registration IDs for this festival.
  // Using .eq('registrations.festival_event_id') on embedded joins is silently
  // dropped in count/head queries. Use a direct .in() instead.
  const { data: regRows, error: regErr } = await supabaseAdmin
    .from('registrations')
    .select('id')
    .eq('festival_event_id', festivalEventId);

  if (regErr) {
    return NextResponse.json({ error: regErr.message }, { status: 500 });
  }

  const registrationIds = (regRows ?? []).map((r) => r.id);

  // If festival has no registrations yet, return empty logs immediately.
  if (registrationIds.length === 0) {
    return NextResponse.json({ logs: [] });
  }

  // Step 2: Fetch visitor visits scoped to those registration IDs.
  const { data: logs, error: logsErr } = await supabaseAdmin
    .from('visitor_visits')
    .select(`
      id,
      visited_at,
      visit_method,
      visited_by_admin,
      remarks,
      registration_id,
      registrations!inner (
        registration_no,
        full_name,
        phone,
        festival_event_id
      ),
      contact_operators (
        name
      )
    `)
    .in('registration_id', registrationIds)
    .order('visited_at', { ascending: false })
    .limit(limit);

  if (logsErr) {
    return NextResponse.json({ error: logsErr.message }, { status: 500 });
  }

  const formatted = (logs ?? []).map((row) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const regRaw = row.registrations as any;
    const reg = Array.isArray(regRaw) ? regRaw[0] : regRaw;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opRaw = row.contact_operators as any;
    const operator = Array.isArray(opRaw) ? opRaw[0] : opRaw;
    return {
      id: row.id,
      visited_at: row.visited_at,
      visit_method: row.visit_method,
      registration_no: reg?.registration_no ?? '—',
      full_name: reg?.full_name ?? '—',
      phone: reg?.phone ?? '—',
      checked_in_by: operator?.name ?? (row.visited_by_admin ? 'Admin' : 'System'),
      status: 'Visited'
    };
  });

  return NextResponse.json({ logs: formatted });
}
