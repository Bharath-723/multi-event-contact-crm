import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getOperatorSessionFromRequest } from '@/lib/operator-auth';

// Helper to authenticate Admin or Operator
async function authenticateUser(req: Request): Promise<{
  role: 'admin' | 'operator';
  id: string; // admin user.id or operator.id
  name?: string;
} | null> {
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

  return null;
}

export async function GET(req: Request) {
  const auth = await authenticateUser(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();

  if (!q) {
    return NextResponse.json({ error: 'Search query parameter "q" is required' }, { status: 400 });
  }

  let assignedIds: string[] = [];

  // If Operator, fetch only their assigned registrations
  if (auth.role === 'operator') {
    const { data: assignedRows, error: assignedErr } = await supabaseAdmin
      .from('contact_assignments')
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
    .from('registrations')
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
      created_at,
      registration_no,
      volunteer_slots:volunteer_slot_id (slot_time),
      contact_assignments (
        id,
        operator_id,
        is_active,
        contact_operators (id, name, email, phone)
      ),
      visitor_visits (
        id,
        visited_at,
        visit_method,
        visited_by,
        visited_by_admin,
        remarks,
        contact_operators:visited_by (id, name)
      )
    `);

  // Apply operator restriction
  if (auth.role === 'operator') {
    query = query.in('id', assignedIds);
  }

  // Search Priority Logic (Flexible across Name, Phone, and Registration Number)
  const searchClean = q.trim();
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
    // Only return active assignments
    const activeAssignments = (reg.contact_assignments ?? []).filter(
      (a: { is_active: boolean }) => a.is_active
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const assignedOpRaw = activeAssignments[0]?.contact_operators as any;
    const assignedOp = Array.isArray(assignedOpRaw) ? assignedOpRaw[0] : assignedOpRaw;
    
    // Visit Status info
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const visitRecord = reg.visitor_visits?.[0] as any;

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
      created_at: reg.created_at,
      volunteer_slot_time: (() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const slotRaw = reg.volunteer_slots as any;
        const slot = Array.isArray(slotRaw) ? slotRaw[0] : slotRaw;
        return slot?.slot_time ?? null;
      })(),
      assigned_operator: assignedOp ? {
        id: assignedOp.id,
        name: assignedOp.name,
      } : null,
      visit: visitRecord ? {
        id: visitRecord.id,
        visited_at: visitRecord.visited_at,
        visit_method: visitRecord.visit_method,
        visited_by_admin: visitRecord.visited_by_admin,
        remarks: visitRecord.remarks,
        operator_name: (() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const opRaw = visitRecord.contact_operators as any;
          const op = Array.isArray(opRaw) ? opRaw[0] : opRaw;
          return op?.name ?? (visitRecord.visited_by_admin ? 'Admin' : 'System');
        })(),
      } : null,
    };
  });

  return NextResponse.json({ registrations: formatted });
}
