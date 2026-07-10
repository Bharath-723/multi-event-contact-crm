/**
 * GET  /api/operators   — Admin: list all operators with stats
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

  // Fetch all operators
  const { data: operators, error } = await supabaseAdmin
    .from('contact_operators')
    .select('id, name, email, phone, is_active, last_login_at, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch assignment stats for each operator via RPC
  const withStats = await Promise.all(
    (operators ?? []).map(async (op) => {
      const { data: stats } = await supabaseAdmin.rpc('get_operator_stats', {
        p_operator_id: op.id,
      });
      const s = stats?.[0] ?? {};
      return {
        ...op,
        total_assigned:   Number(s.total_assigned   ?? 0),
        total_pending:    Number(s.total_pending    ?? 0),
        total_coming:     Number(s.total_coming     ?? 0),
        total_not_coming: Number(s.total_not_coming ?? 0),
        total_completed:  Number(s.total_coming     ?? 0),  // legacy
        total_called:     Number(s.total_called     ?? 0),
        total_confirmed:  Number(s.total_coming     ?? 0),  // legacy
        call_success_pct: Number(s.call_success_pct ?? 0),
      };
    })
  );

  return NextResponse.json({ operators: withStats });
}

// ─── POST /api/operators ────────────────────────────────────────────────────
export async function POST(req: Request) {
  const { error: authError } = await requireAdmin(req);
  if (authError) return authError;

  let body: { name?: string; email?: string; phone?: string; password?: string; is_active?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { name, email, phone, password, is_active = true } = body;

  if (!name || !email || !password) {
    return NextResponse.json({ error: 'name, email and password are required' }, { status: 400 });
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
    })
    .select('id, name, email, phone, is_active, created_at, updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit log
  await supabaseAdmin.from('audit_logs').insert({
    action: 'OPERATOR_CREATED',
    details: { operator_id: operator.id, name: operator.name, email: operator.email },
  });

  return NextResponse.json({ operator }, { status: 201 });
}
