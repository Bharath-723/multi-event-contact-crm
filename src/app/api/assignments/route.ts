/**
 * /api/assignments
 * GET  — Admin: list assigned contacts (source-aware)
 * POST — Admin: assign or reassign contacts to operators (source-aware)
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { normalizeSource } from '@/lib/source-resolver';

// ─── Admin Auth Guard ────────────────────────────────────────────────────────
async function requireAdmin(req: Request): Promise<{ error: NextResponse | null; userId?: string }> {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const { data: adminRow } = await supabaseAdmin
    .from('admins')
    .select('id')
    .eq('id', user.id)
    .single();
  if (!adminRow) return { error: NextResponse.json({ error: 'Forbidden: Not an admin' }, { status: 403 }) };

  return { error: null, userId: user.id };
}

// ─── GET /api/assignments ────────────────────────────────────────────────────
export async function GET(req: Request) {
  const { error: authError } = await requireAdmin(req);
  if (authError) return authError;

  const url = new URL(req.url);
  const rawSource = url.searchParams.get('source');
  const source = normalizeSource(rawSource);
  const page = parseInt(url.searchParams.get('page') ?? '1', 10);
  const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);
  const operatorId = url.searchParams.get('operator_id');
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let data: unknown[] | null = null;
  let count: number | null = 0;
  let error: { message: string } | null = null;

  if (source === 'krishnashtami') {
    let q = supabaseAdmin
      .from('krishnashtami_contact_assignments')
      .select(`
        id, registration_id, operator_id, assigned_by, assigned_at, called_at,
        status, remarks, is_active, created_at, updated_at,
        contact_operators!operator_id (id, name, email, phone),
        krishnashtami_registrations!registration_id (*)
      `, { count: 'exact' })
      .eq('is_active', true)
      .neq('status', 'Not Coming')
      .order('assigned_at', { ascending: false });

    if (operatorId) q = q.eq('operator_id', operatorId);
    const res = await q.range(from, to);
    data = res.data;
    count = res.count;
    error = res.error;
  } else if (source === 'feedback_contacts') {
    let q = supabaseAdmin
      .from('feedback_contact_assignments')
      .select(`
        id, feedback_contact_id, operator_id, assigned_by, assigned_at,
        status, notes, is_active, created_at, updated_at,
        contact_operators!operator_id (id, name, email, phone),
        feedback_contacts!feedback_contact_id (*)
      `, { count: 'exact' })
      .eq('is_active', true)
      .neq('status', 'Not Coming')
      .order('assigned_at', { ascending: false });

    if (operatorId) q = q.eq('operator_id', operatorId);
    const res = await q.range(from, to);
    data = res.data;
    count = res.count;
    error = res.error;
  } else {
    let q = supabaseAdmin
      .from('contact_assignments')
      .select(`
        id, registration_id, operator_id, assigned_by, assigned_at, called_at,
        status, remarks, is_active, created_at, updated_at,
        contact_operators!operator_id (id, name, email, phone),
        registrations!registration_id (*)
      `, { count: 'exact' })
      .eq('is_active', true)
      .neq('status', 'Not Coming')
      .order('assigned_at', { ascending: false });

    if (operatorId) q = q.eq('operator_id', operatorId);
    const res = await q.range(from, to);
    data = res.data;
    count = res.count;
    error = res.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ assignments: data, total: count, page, limit, source });
}

// ─── POST /api/assignments ────────────────────────────────────────────────────
export async function POST(req: Request) {
  const { error: authError, userId } = await requireAdmin(req);
  if (authError) return authError;

  let body: {
    source?: string;
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

  const source = normalizeSource(body.source);
  const { operator_id, reassign = false } = body;
  const regIds: string[] = body.registration_ids?.length
    ? body.registration_ids
    : body.registration_id
    ? [body.registration_id]
    : [];

  if (!operator_id) return NextResponse.json({ error: 'operator_id is required' }, { status: 400 });
  if (!regIds.length) return NextResponse.json({ error: 'At least one registration_id is required' }, { status: 400 });

  const targetRegTable =
    source === 'krishnashtami'
      ? 'krishnashtami_registrations'
      : source === 'feedback_contacts'
      ? 'feedback_contacts'
      : 'registrations';

  const assignTable =
    source === 'krishnashtami'
      ? 'krishnashtami_contact_assignments'
      : source === 'feedback_contacts'
      ? 'feedback_contact_assignments'
      : 'contact_assignments';

  const fkCol = source === 'feedback_contacts' ? 'feedback_contact_id' : 'registration_id';

  // 1. Strict Server-Side Cross-Source Validation: Verify registrations exist in target source table
  const { data: verifiedRegs, error: regsFetchError } = await supabaseAdmin
    .from(targetRegTable)
    .select('id, gender')
    .in('id', regIds);

  if (regsFetchError || !verifiedRegs || verifiedRegs.length !== regIds.length) {
    return NextResponse.json(
      { error: `Cross-source assignment rejected: One or more IDs do not belong to ${source} table` },
      { status: 400 }
    );
  }

  // Check if any registration is female (for volunteer forms)
  if (source !== 'feedback_contacts') {
    const hasFemale = verifiedRegs.some(r => r.gender === 'Female');
    if (hasFemale) {
      return NextResponse.json({
        success: false,
        message: "FEMALES are NOT ALLOWED to ASSIGN"
      }, { status: 403 });
    }
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
    // Check if registration has ever been marked as Not Coming
    const { data: notComingCheck } = await supabaseAdmin
      .from(assignTable)
      .select('id')
      .eq(fkCol, regId)
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
      .from(assignTable)
      .select('id, operator_id')
      .eq(fkCol, regId)
      .eq('is_active', true)
      .maybeSingle();

    if (existing && !reassign) {
      results.push({
        registration_id: regId,
        status: 'already_assigned',
        message: `Already assigned to another operator`,
      });
      continue;
    }

    // Deactivate previous active assignment if reassigning
    if (existing && reassign) {
      await supabaseAdmin
        .from(assignTable)
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
    }

    // Insert new assignment
    const insertPayload: Record<string, unknown> = {
      [fkCol]: regId,
      operator_id: operator.id,
      assigned_by: userId,
      assigned_at: new Date().toISOString(),
      status: 'Pending',
      is_active: true,
    };

    const { data: newAssignment, error: insertErr } = await supabaseAdmin
      .from(assignTable)
      .insert(insertPayload)
      .select()
      .single();

    if (insertErr) {
      results.push({
        registration_id: regId,
        status: 'error',
        message: insertErr.message,
      });
    } else {
      results.push({
        registration_id: regId,
        status: existing ? 'reassigned' : 'assigned',
        message: existing
          ? `Reassigned to ${operator.name}`
          : `Assigned to ${operator.name}`,
        assignment: newAssignment,
      });

      // Audit log
      await supabaseAdmin.from('audit_logs').insert({
        admin_id: userId,
        action: existing ? 'CONTACT_REASSIGNED' : 'CONTACT_ASSIGNED',
        details: {
          source,
          registration_id: regId,
          operator_id: operator.id,
          operator_name: operator.name,
          previous_operator_id: existing?.operator_id ?? null,
        },
      });
    }
  }

  const assignedCount = results.filter((r) => r.status === 'assigned' || r.status === 'reassigned').length;
  return NextResponse.json({
    success: assignedCount > 0,
    assigned_count: assignedCount,
    results,
    source,
  });
}
