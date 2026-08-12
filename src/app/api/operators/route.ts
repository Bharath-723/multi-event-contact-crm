/**
 * GET  /api/operators   — Admin: list all operators with stats (from feedback_contact_assignments)
 * POST /api/operators   — Admin: create new operator
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { hashPassword } from '@/lib/operator-auth';

// ─── Guard: Validate admin session from Supabase Auth header ────────────────
async function requireAdmin(req: Request): Promise<{ error: NextResponse | null }> {
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

  return { error: null };
}

// ─── GET /api/operators ─────────────────────────────────────────────────────
export async function GET(req: Request) {
  const { error: authError } = await requireAdmin(req);
  if (authError) return authError;

  // 1. Fetch all operators
  const { data: operators, error } = await supabaseAdmin
    .from('contact_operators')
    .select('id, name, email, phone, is_active, operator_type, last_login_at, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 2. Fetch feedback assignments for all operators to compute workload stats
  const { data: feedbackAssignments } = await supabaseAdmin
    .from('feedback_contact_assignments')
    .select('id, operator_id, status, is_active');

  const assignmentsByOp = new Map<string, typeof feedbackAssignments>();
  (feedbackAssignments || []).forEach((fa) => {
    if (!fa.operator_id) return;
    const list = assignmentsByOp.get(fa.operator_id) || [];
    list.push(fa);
    assignmentsByOp.set(fa.operator_id, list);
  });

  const withStats = (operators ?? []).map((op) => {
    const list = assignmentsByOp.get(op.id) || [];
    const activeList = list.filter((a) => a.is_active);
    const total_assigned = activeList.length;
    const total_pending = activeList.filter((a) => a.status === 'Assigned' || a.status === 'Contacted').length;
    const total_coming = activeList.filter((a) => a.status === 'Interested' || a.status === 'Completed').length;
    const total_not_coming = list.filter((a) => a.status === 'Not Coming').length;

    return {
      ...op,
      total_assigned,
      total_pending,
      total_coming,
      total_not_coming,
      total_completed: total_coming,
      total_called: activeList.filter((a) => a.status !== 'Assigned').length,
      call_success_pct: total_assigned > 0 ? Math.round((total_coming / total_assigned) * 100) : 0,
    };
  });

  return NextResponse.json({ operators: withStats });
}

// ─── POST /api/operators ────────────────────────────────────────────────────
export async function POST(req: Request) {
  const { error: authError } = await requireAdmin(req);
  if (authError) return authError;

  let body: { name?: string; email?: string; phone?: string; password?: string; is_active?: boolean; operator_type?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { name, email, phone, password, is_active = true, operator_type = 'operator' } = body;

  if (!name || !email || !password) {
    return NextResponse.json({ error: 'name, email and password are required' }, { status: 400 });
  }

  if (!['operator', 'coordinator'].includes(operator_type)) {
    return NextResponse.json({ error: 'Invalid operator_type' }, { status: 400 });
  }

  // Check duplicate email
  const { data: existing } = await supabaseAdmin
    .from('contact_operators')
    .select('id')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: 'An operator with this email already exists' }, { status: 409 });
  }

  const password_hash = await hashPassword(password);

  const { data: operator, error } = await supabaseAdmin
    .from('contact_operators')
    .insert({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password_hash,
      phone: phone?.trim() || null,
      is_active,
      operator_type,
    })
    .select('id, name, email, phone, is_active, operator_type, created_at, updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit log
  await supabaseAdmin.from('audit_logs').insert({
    action: 'OPERATOR_CREATED',
    details: { operator_id: operator.id, name: operator.name, email: operator.email },
  });

  return NextResponse.json({ operator }, { status: 201 });
}
