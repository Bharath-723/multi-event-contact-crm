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
  const { operator_id } = body;
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
    const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('assign_contact_atomic', {
      p_contact_id: regId,
      p_operator_id: operator.id,
      p_source: source,
      p_assigned_by: userId || null,
      p_max_capacity: 40,
    });

    if (rpcErr || !rpcRes?.success) {
      const code = rpcRes?.code || 'ERROR';
      const msg = rpcRes?.message || rpcErr?.message || 'Assignment failed';

      if (regIds.length === 1) {
        return NextResponse.json({ error: code, message: msg }, { status: 400 });
      }

      results.push({
        registration_id: regId,
        status: code.toLowerCase(),
        message: msg,
      });
      continue;
    }

    results.push({
      registration_id: regId,
      status: 'assigned',
      message: `Assigned to ${operator.name}`,
      assignment: rpcRes,
    });

    // Audit log
    await supabaseAdmin.from('audit_logs').insert({
      admin_id: userId,
      action: 'CONTACT_ASSIGNED',
      details: {
        source,
        registration_id: regId,
        operator_id: operator.id,
        operator_name: operator.name,
      },
    });
  }

  const assignedCount = results.filter((r) => r.status === 'assigned').length;
  return NextResponse.json({
    success: assignedCount > 0,
    assigned_count: assignedCount,
    results,
    source,
  });
}
