/**
 * GET  /api/operators   — Admin: list all operators with stats (scoped by source/festival)
 * POST /api/operators   — Admin: create new operator
 */
import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { hashPassword } from '@/lib/operator-auth';
import { computeOperatorStats, formatOperatorDisplayName } from '@/lib/status-normalizer';
import { getCurrentWeeklyPeriod } from '@/lib/weekly-period';

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
export async function GET(req: NextRequest) {
  const { error: authError } = await requireAdmin(req);
  if (authError) return authError;

  // Contact Operators active metrics and assignments are strictly locked to Master Dashboard.
  // Historical festival records are preserved in their respective tables and never counted here.
  const source = 'master_dashboard';
  const assignTable = 'master_contact_assignments';

  // Concurrently fetch operators and active contact assignments in parallel
  const currentWeeklyPeriod = getCurrentWeeklyPeriod();

  interface RawOperator {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    is_active: boolean;
    operator_type: string;
    capacity?: number | null;
    last_login_at?: string | null;
    created_at: string;
    updated_at: string;
  }

  type AssignmentRow = {
    id: string;
    operator_id: string;
    status: string;
    status_weekly_period?: string | null;
    updated_at?: string | null;
  };

  const operatorsPromise = (async () => {
    const res = await supabaseAdmin
      .from('contact_operators')
      .select('id, name, email, phone, is_active, operator_type, capacity, last_login_at, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (res.error && (res.error.code === '42703' || res.error.message?.includes('capacity'))) {
      const fallback = await supabaseAdmin
        .from('contact_operators')
        .select('id, name, email, phone, is_active, operator_type, last_login_at, created_at, updated_at')
        .order('created_at', { ascending: false });
      return { data: (fallback.data as unknown as RawOperator[]) || [], error: fallback.error };
    }
    return { data: (res.data as unknown as RawOperator[]) || [], error: res.error };
  })();

  const assignmentsPromise = (async () => {
    const res = await supabaseAdmin
      .from(assignTable)
      .select('id, operator_id, status, status_weekly_period, updated_at')
      .eq('is_active', true);

    if (res.error && (res.error.code === '42703' || res.error.message?.includes('status_weekly_period'))) {
      const fallback = await supabaseAdmin
        .from(assignTable)
        .select('id, operator_id, status, updated_at')
        .eq('is_active', true);
      return { data: (fallback.data as unknown as AssignmentRow[]) || [], error: fallback.error };
    }
    return { data: (res.data as unknown as AssignmentRow[]) || [], error: res.error };
  })();

  const [opRes, assignRes] = await Promise.all([operatorsPromise, assignmentsPromise]);

  if (opRes.error) return NextResponse.json({ error: opRes.error.message }, { status: 500 });
  const operators: RawOperator[] = opRes.data ?? [];
  const assignments: AssignmentRow[] = assignRes.data ?? [];

  const assignmentsByOp = new Map<string, Array<AssignmentRow>>();
  assignments.forEach((fa) => {
    if (!fa.operator_id) return;
    const list = assignmentsByOp.get(fa.operator_id) || [];
    list.push(fa);
    assignmentsByOp.set(fa.operator_id, list);
  });

  const withStats = operators.map((op) => {
    const activeList = assignmentsByOp.get(op.id) || [];
    // Enforces weekly counter reset for status buckets while permanently preserving total assigned
    const stats = computeOperatorStats(activeList, { currentWeeklyPeriod });

    return {
      ...op,
      name: formatOperatorDisplayName(op.name),
      capacity: op.capacity ?? 40,
      total_assigned: stats.assigned, // Permanently retained across weekly transitions
      total_pending: stats.pending,   // Weekly counter (resets on Friday 00:00 IST)
      total_coming: stats.coming,     // Weekly counter (resets on Friday 00:00 IST)
      total_not_coming: stats.notComing, // Weekly counter (resets on Friday 00:00 IST)
      total_not_answered: stats.notAnswered, // Weekly counter (resets on Friday 00:00 IST)
      total_next_week: stats.nextWeek,       // Weekly counter (resets on Friday 00:00 IST)
      total_not_in_hyderabad: stats.notInHyderabad,
      total_not_connected: stats.notAnswered,
      total_completed: stats.coming,
      total_called: stats.coming + stats.notComing + stats.notAnswered + stats.nextWeek + stats.notInHyderabad,
      call_success_pct: stats.assigned > 0 ? Math.round((stats.coming / stats.assigned) * 100) : 0,
    };
  });

  // Default ordering: Highest assigned count first, then deterministic secondary sort by name, then ID
  withStats.sort((a, b) => {
    if (b.total_assigned !== a.total_assigned) {
      return b.total_assigned - a.total_assigned;
    }
    const nameComp = (a.name || '').localeCompare(b.name || '');
    if (nameComp !== 0) return nameComp;
    return (a.id || '').localeCompare(b.id || '');
  });

  return NextResponse.json({ operators: withStats, source, weekly_period: currentWeeklyPeriod });
}

// ─── POST /api/operators ────────────────────────────────────────────────────
export async function POST(req: Request) {
  const { error: authError } = await requireAdmin(req);
  if (authError) return authError;

  let body: {
    name?: string;
    email?: string;
    phone?: string;
    password?: string;
    is_active?: boolean;
    operator_type?: string;
    capacity?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { name, email, phone, password, is_active = true, operator_type = 'operator', capacity = 40 } = body;

  if (!name || !email || !password) {
    return NextResponse.json({ error: 'name, email and password are required' }, { status: 400 });
  }

  const numCapacity = Number(capacity);
  if (!Number.isInteger(numCapacity) || numCapacity < 1 || numCapacity > 500) {
    return NextResponse.json({ error: 'Capacity must be an integer between 1 and 500' }, { status: 400 });
  }

  if (!['operator', 'coordinator'].includes(operator_type)) {
    return NextResponse.json({ error: 'Invalid operator_type' }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin
    .from('contact_operators')
    .select('id')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: 'An operator with this email already exists' }, { status: 409 });
  }

  const password_hash = await hashPassword(password);

  let { data: operator, error } = await supabaseAdmin
    .from('contact_operators')
    .insert({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password_hash,
      phone: phone?.trim() || null,
      is_active,
      operator_type,
      capacity: numCapacity,
    })
    .select('id, name, email, phone, is_active, operator_type, capacity, created_at, updated_at')
    .single();

  // Graceful fallback if 'capacity' column does not exist yet (error 42703)
  if (error && (error.code === '42703' || error.message?.includes('capacity'))) {
    const fallback = await supabaseAdmin
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
    operator = fallback.data ? { ...fallback.data, capacity: numCapacity } as typeof operator : null;
    error = fallback.error;
  }

  if (error || !operator) return NextResponse.json({ error: error?.message || 'Failed to create operator' }, { status: 500 });

  await supabaseAdmin.from('audit_logs').insert({
    action: 'OPERATOR_CREATED',
    details: { operator_id: operator.id, name: operator.name, email: operator.email },
  });

  return NextResponse.json({ operator }, { status: 201 });
}
