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

  const opSession = getOperatorSessionFromRequest(req);
  if (opSession) {
    return { role: 'operator', id: opSession.operatorId, name: opSession.name };
  }

  // Return public role for public visitor page access
  return { role: 'public', id: 'public', name: 'Public Check-In Center' };
}

export async function POST(req: Request) {
  const auth = await authenticateUser(req);

  let body: { registration_id?: string; remarks?: string; festival_event_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { registration_id, remarks = '', festival_event_id } = body;

  if (!registration_id) {
    return NextResponse.json({ error: 'registration_id is required' }, { status: 400 });
  }

  if (!festival_event_id) {
    return NextResponse.json({ error: 'festival_event_id is required' }, { status: 400 });
  }

  const isKrishnashtami = festival_event_id === '7852cff8-e784-4e91-b990-a9838ea59ff1';
  const regTable = isKrishnashtami ? 'krishnashtami_registrations' : 'registrations';
  const caTable = isKrishnashtami ? 'krishnashtami_contact_assignments' : 'contact_assignments';
  const vvTable = isKrishnashtami ? 'krishnashtami_visitor_visits' : 'visitor_visits';

  // 1. Fetch the registration — verify it exists
  const { data: reg, error: regErr } = await supabaseAdmin
    .from(regTable)
    .select('id, registration_no, full_name, festival_event_id')
    .eq('id', registration_id)
    .single();

  if (regErr || !reg) {
    return NextResponse.json({ error: 'Registration record not found' }, { status: 404 });
  }

  // Festival isolation check (for main registrations table)
  if (!isKrishnashtami && reg.festival_event_id !== festival_event_id) {
    return NextResponse.json(
      { error: 'Forbidden: This registration does not belong to the selected festival.' },
      { status: 403 }
    );
  }

  // Security constraint: If Operator, ensure they only check in a contact assigned to them
  if (auth.role === 'operator') {
    const { data: assignment, error: assignErr } = await supabaseAdmin
      .from(caTable)
      .select('id')
      .eq('registration_id', registration_id)
      .eq('operator_id', auth.id)
      .eq('is_active', true)
      .maybeSingle();

    if (assignErr || !assignment) {
      return NextResponse.json({ error: 'Forbidden: This contact is not assigned to you.' }, { status: 403 });
    }
  }

  // 2. Check if a visit already exists in target visit table
  const { data: existingVisit } = await supabaseAdmin
    .from(vvTable)
    .select(`
      id,
      visited_at,
      visit_method,
      visited_by_admin
    `)
    .eq('registration_id', registration_id)
    .maybeSingle();

  if (existingVisit) {
    return NextResponse.json({
      error: 'Already Checked In',
      details: {
        visited_at: existingVisit.visited_at,
        visit_method: existingVisit.visit_method,
        checked_in_by: existingVisit.visited_by_admin ? 'Admin' : 'Operator',
      }
    }, { status: 409 });
  }

  // 3. Insert visit record into target visit table
  const { data: newVisit, error: insertErr } = await supabaseAdmin
    .from(vvTable)
    .insert({
      registration_id,
      visited_by: auth.role === 'operator' ? auth.id : null,
      visited_by_admin: auth.role === 'admin',
      visit_method: 'MANUAL_SEARCH',
      remarks: remarks.trim() || null,
    })
    .select()
    .single();

  if (insertErr) {
    if (insertErr.code === '23505') {
      return NextResponse.json({ error: 'Already Checked In (Race Condition)' }, { status: 409 });
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // 4. Log Audit Trail
  await supabaseAdmin.from('audit_logs').insert({
    action: 'VISITOR_CHECK_IN',
    details: {
      registration_no: reg.registration_no,
      registration_id: reg.id,
      operator_id: auth.role === 'operator' ? auth.id : null,
      operator_name: auth.name ?? 'Admin',
      method: 'MANUAL_SEARCH',
      timestamp: new Date().toISOString(),
      remarks,
      visit_id: newVisit.id
    }
  });

  return NextResponse.json({
    success: true,
    message: 'Visitor Checked In Successfully',
    visit: {
      id: newVisit.id,
      registration_no: reg.registration_no,
      full_name: reg.full_name,
      checked_in_by: auth.name ?? 'Admin',
      visited_at: newVisit.visited_at
    }
  });
}
