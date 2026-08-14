import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getOperatorSessionFromRequest } from '@/lib/operator-auth';

// Helper to authenticate Admin, Operator, or Public client
async function authenticateUser(req: Request): Promise<{
  role: 'admin' | 'operator' | 'public';
  id: string; // admin user.id, operator.id, or 'public'
  name?: string;
}> {
  const authHeader = req.headers.get('Authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (!error && user) {
      const { data: adminRow } = await supabaseAdmin
        .from('admins')
        .select('id, email')
        .eq('id', user.id)
        .single();
      if (adminRow) {
        return { role: 'admin', id: user.id, name: adminRow.email };
      }
    }
  }

  // Check operator session
  const opSession = getOperatorSessionFromRequest(req);
  if (opSession) {
    return { role: 'operator', id: opSession.operatorId, name: opSession.name };
  }

  // Return public role for public visitor page access
  return { role: 'public', id: 'public', name: 'Public Check-In Center' };
}

export async function GET(req: Request) {
  const auth = await authenticateUser(req);

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const festivalEventId = url.searchParams.get('festival_event_id');

  if (!q) {
    return NextResponse.json({ error: 'Search query parameter "q" is required' }, { status: 400 });
  }

  // festival_event_id required for admin and public roles.
  // Operators are scoped by assigned contacts, but we still require it for consistency.
  if (!festivalEventId) {
    return NextResponse.json(
      { error: 'festival_event_id is required' },
      { status: 400 }
    );
  }


  const isKrishnashtami = festivalEventId === '7852cff8-e784-4e91-b990-a9838ea59ff1';
  const regTable = isKrishnashtami ? 'krishnashtami_registrations' : 'registrations';
  const caTable = isKrishnashtami ? 'krishnashtami_contact_assignments' : 'contact_assignments';
  const vvTable = isKrishnashtami ? 'krishnashtami_visitor_visits' : 'visitor_visits';

  let assignedIds: string[] = [];

  // If Operator, fetch only their assigned registrations
  if (auth.role === 'operator') {
    const { data: assignedRows, error: assignedErr } = await supabaseAdmin
      .from(caTable)
      .select('registration_id')
      .eq('operator_id', auth.id)
      .eq('is_active', true);

    if (assignedErr) {
      return NextResponse.json({ error: 'Failed to fetch operator assignments' }, { status: 500 });
    }

    assignedIds = (assignedRows ?? []).map((r) => r.registration_id);
    if (assignedIds.length === 0) {
      return NextResponse.json({ registrations: [] });
    }
  }

  // Build Registrations Query
  let query = supabaseAdmin
    .from(regTable)
    .select(`
      id,
      full_name,
      phone,
      age,
      gender,
      occupation,
      area_of_stay,
      company_college,
      pg_name,
      interested_to_volunteer,
      interested_to_dinner,
      transportation_required,
      created_at,
      registration_no,
      festival_event_id,
      volunteer_slots:volunteer_slot_id (slot_time),
      ${caTable} (
        id,
        operator_id,
        is_active,
        status,
        contact_operators (id, name, email, phone)
      ),
      ${vvTable} (
        id,
        visited_at,
        visit_method,
        visited_by,
        visited_by_admin,
        remarks,
        contact_operators:visited_by (id, name)
      )
    `);

  if (!isKrishnashtami && festivalEventId) {
    query = query.eq('festival_event_id', festivalEventId);
  }

  // Apply operator restriction
  if (auth.role === 'operator') {
    query = query.in('id', assignedIds);
  }

  // Search Priority Logic (Flexible across Name, Phone, and Registration Number)
  const searchClean = q.trim().replace(/\s+/g, ' ');
  const searchDigits = searchClean.replace(/\D/g, '');

  let orFilter = `full_name.ilike.%${searchClean}%,registration_no.ilike.%${searchClean}%`;
  if (searchDigits) {
    orFilter += `,phone.ilike.%${searchDigits}%`;
  }
  query = query.or(orFilter);

  const { data: registrations, error: fetchErr } = await query.limit(20);

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  // Format response details and filter contact assignments to only active ones
  const formatted = (registrations ?? []).map((reg) => {
    const rawReg = reg as Record<string, unknown>;
    const assignmentsList = (rawReg[caTable] || []) as Record<string, unknown>[];
    const visitsList = (rawReg[vvTable] || []) as Record<string, unknown>[];

    const activeAssignments = assignmentsList.filter(
      (a: { is_active?: boolean }) => a.is_active
    );
    const assignedOpRaw = activeAssignments[0]?.contact_operators as unknown;
    const assignedOp = Array.isArray(assignedOpRaw) ? assignedOpRaw[0] : assignedOpRaw;
    const visitRecord = visitsList[0] as Record<string, unknown> | undefined;

    return {
      id: reg.id,
      registration_no: reg.registration_no,
      full_name: reg.full_name,
      phone: reg.phone,
      age: reg.age,
      gender: reg.gender,
      occupation: reg.occupation,
      area_of_stay: reg.area_of_stay,
      company_college: reg.company_college,
      interested_to_volunteer: reg.interested_to_volunteer,
      interested_to_dinner: reg.interested_to_dinner,
      transportation_required: reg.transportation_required,
      operator_status: (activeAssignments[0] as { status?: string })?.status ?? 'Pending',
      created_at: reg.created_at,
      volunteer_slot_time: (() => {
        const slotRaw = reg.volunteer_slots as unknown;
        const slot = Array.isArray(slotRaw) ? slotRaw[0] : slotRaw;
        return (slot as { slot_time?: string })?.slot_time ?? null;
      })(),
      assigned_operator: assignedOp ? {
        id: (assignedOp as { id: string }).id,
        name: (assignedOp as { name: string }).name,
      } : null,
      visit: visitRecord ? {
        id: visitRecord.id,
        visited_at: visitRecord.visited_at,
        visit_method: visitRecord.visit_method,
        visited_by_admin: visitRecord.visited_by_admin,
        remarks: visitRecord.remarks,
        operator_name: (() => {
          const opRaw = visitRecord.contact_operators as unknown;
          const op = Array.isArray(opRaw) ? opRaw[0] : opRaw;
          return (op as { name?: string })?.name ?? (visitRecord.visited_by_admin ? 'Admin' : 'System');
        })(),
      } : null,
    };
  });

  return NextResponse.json({ registrations: formatted });
}
