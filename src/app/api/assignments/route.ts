/**
 * GET  /api/assignments  — Admin: list all active assignments (paginated)
 * POST /api/assignments  — Admin: assign registration(s) to an operator
 *
 * DUPLICATE PROTECTION:
 *   A registration can have only ONE active assignment at a time.
 *   If already assigned: returns 409 with the existing operator name.
 *   Reassign flow: pass `reassign: true` to deactivate old and create new.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// ─── Admin Auth Guard ────────────────────────────────────────────────────────
async function requireAdmin(req: Request): Promise<{ error: NextResponse | null; userId?: string }> {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { data: adminRow } = await supabaseAdmin.from('admins').select('id').eq('id', user.id).single();
  if (!adminRow) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { error: null, userId: user.id };
}

// ─── GET /api/assignments ────────────────────────────────────────────────────
export async function GET(req: Request) {
  const { error: authError } = await requireAdmin(req);
  if (authError) return authError;

  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get('page') ?? '1', 10);
  const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);
  const operatorId = url.searchParams.get('operator_id');
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabaseAdmin
    .from('contact_assignments')
    .select(`
      id, registration_id, operator_id, assigned_by, assigned_at, called_at,
      status, remarks, is_active, created_at, updated_at,
      contact_operators!operator_id (id, name, email, phone),
      registrations!registration_id (*)
    `, { count: 'exact' })
    .eq('is_active', true)
    .neq('status', 'Not Coming')
    .order('assigned_at', { ascending: false })
    .range(from, to);

  if (operatorId) query = query.eq('operator_id', operatorId);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ assignments: data, total: count, page, limit });
}

// ─── POST /api/assignments ────────────────────────────────────────────────────
export async function POST(req: Request) {
  const { error: authError, userId } = await requireAdmin(req);
  if (authError) return authError;

  let body: {
    registration_ids?: string[];
    registration_id?: string;
    operator_id?: string;
    reassign?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { operator_id } = body;
  const regIds: string[] = body.registration_ids?.length
    ? body.registration_ids
    : body.registration_id
    ? [body.registration_id]
    : [];

  if (!operator_id) return NextResponse.json({ error: 'operator_id is required' }, { status: 400 });
  if (!regIds.length) return NextResponse.json({ error: 'At least one registration_id is required' }, { status: 400 });

  // Verify registrations exist and check their gender
  const { data: registrations, error: regsFetchError } = await supabaseAdmin
    .from('registrations')
    .select('id, gender')
    .in('id', regIds);

  if (regsFetchError || !registrations) {
    return NextResponse.json({ error: 'Failed to fetch registrations' }, { status: 500 });
  }

  // Check if any of the registrations is female
  const hasFemale = registrations.some(r => r.gender === 'Female');
  if (hasFemale) {
    return NextResponse.json({
      success: false,
      message: "FEMALES are NOT ALLOWED to ASSIGN"
    }, { status: 403 });
  }

  // Verify operator exists and is active
  const { data: operator } = await supabaseAdmin
    .from('contact_operators')
    .select('id, name, is_active')
    .eq('id', operator_id)
    .single();
  if (!operator) return NextResponse.json({ error: 'Operator not found' }, { status: 404 });
  if (!operator.is_active) return NextResponse.json({ error: 'Operator is currently disabled' }, { status: 400 });

  const results: Array<{ registration_id: string; status: string; message: string; assignment?: unknown }> = [];

  for (const regId of regIds) {
    // Check if registration has ever been marked as Not Coming (inactive or active)
    const { data: notComingCheck } = await supabaseAdmin
      .from('contact_assignments')
      .select('id')
      .eq('registration_id', regId)
      .eq('status', 'Not Coming')
      .limit(1)
      .maybeSingle();

    if (notComingCheck) {
      results.push({
        registration_id: regId,
        status: 'blocked',
        message: 'This registration is marked as Not Coming and cannot be assigned/reassigned.',
      });
      continue;
    }

    // Check for existing active assignment
    const { data: existing } = await supabaseAdmin
      .from('contact_assignments')
      .select('id, operator_id, status, contact_operators!operator_id(name)')
      .eq('registration_id', regId)
      .eq('is_active', true)
      .maybeSingle();

    // If already assigned to the same operator, return early to prevent duplicates
    if (existing && existing.operator_id === operator_id) {
      results.push({
        registration_id: regId,
        status: 'already_assigned',
        message: `This registration is already assigned to this operator.`,
      });
      continue;
    }

    // If reassigning (or any existing active assignment for a different operator): deactivate old assignment
    if (existing) {
      const opJoin2 = existing.contact_operators as unknown;
      const oldOpName = (Array.isArray(opJoin2) ? (opJoin2 as {name:string}[])[0]?.name : (opJoin2 as {name:string}|null)?.name) ?? 'Unknown';
      
      const { error: deactivateError } = await supabaseAdmin
        .from('contact_assignments')
        .update({ is_active: false })
        .eq('id', existing.id);

      if (deactivateError) {
        results.push({ registration_id: regId, status: 'error', message: deactivateError.message });
        continue;
      }

      // Audit reassignment with ASSIGNMENT_REASSIGNED action
      await supabaseAdmin.from('audit_logs').insert({
        admin_id: userId,
        action: 'ASSIGNMENT_REASSIGNED',
        details: {
          registration_id: regId,
          old_operator_id: existing.operator_id,
          old_operator_name: oldOpName,
          new_operator_id: operator_id,
          new_operator_name: operator.name,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Create new active assignment
    const { data: assignment, error: insertError } = await supabaseAdmin
      .from('contact_assignments')
      .insert({
        registration_id: regId,
        operator_id,
        assigned_by: userId ?? null,
        status: 'Pending',
        is_active: true,
      })
      .select()
      .single();

    if (insertError) {
      results.push({ registration_id: regId, status: 'error', message: insertError.message });
      continue;
    }

    // Audit new assignment
    await supabaseAdmin.from('audit_logs').insert({
      admin_id: userId,
      action: 'ASSIGNMENT_CREATED',
      details: {
        assignment_id: assignment.id,
        registration_id: regId,
        operator_id,
        operator_name: operator.name,
      },
    });

    results.push({ registration_id: regId, status: 'assigned', message: 'Assigned successfully', assignment });
  }

  const hasErrors = results.some((r) => r.status === 'error');
  const statusCode = hasErrors ? 207 : 200;
  return NextResponse.json({ results }, { status: statusCode });
}
