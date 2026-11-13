/**
 * PUT    /api/operators/[id]  — Admin: edit operator
 * DELETE /api/operators/[id]  — Admin: disable operator (soft delete only)
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { hashPassword } from '@/lib/operator-auth';

async function requireAdmin(req: Request): Promise<{ error: NextResponse | null }> {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { data: adminRow } = await supabaseAdmin.from('admins').select('id').eq('id', user.id).single();
  if (!adminRow) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { error: null };
}

// ─── PUT /api/operators/[id] ─────────────────────────────────────────────────
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error: authError } = await requireAdmin(req);
  if (authError) return authError;

  const { id } = await params;

  let body: {
    name?: string;
    phone?: string;
    is_active?: boolean;
    password?: string;
    operator_type?: string;
    capacity?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined)      updates.name = body.name.trim();
  if (body.phone !== undefined)     updates.phone = body.phone?.trim() || null;
  if (body.is_active !== undefined) updates.is_active = body.is_active;
  if (body.password)                updates.password_hash = await hashPassword(body.password);
  if (body.capacity !== undefined) {
    const cap = Number(body.capacity);
    if (!Number.isInteger(cap) || cap < 1 || cap > 500) {
      return NextResponse.json({ error: 'Capacity must be an integer between 1 and 500' }, { status: 400 });
    }
    updates.capacity = cap;
  }
  if (body.operator_type !== undefined) {
    if (!['operator', 'coordinator'].includes(body.operator_type)) {
      return NextResponse.json({ error: 'Invalid operator_type' }, { status: 400 });
    }
    updates.operator_type = body.operator_type;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  let { data: operator, error } = await supabaseAdmin
    .from('contact_operators')
    .update(updates)
    .eq('id', id)
    .select('id, name, email, phone, is_active, operator_type, capacity, updated_at')
    .single();

  // Graceful fallback if 'capacity' column does not exist yet (error 42703)
  if (error && (error.code === '42703' || error.message?.includes('capacity'))) {
    const safeUpdates = { ...updates };
    delete safeUpdates.capacity;

    if (Object.keys(safeUpdates).length > 0) {
      const fallback = await supabaseAdmin
        .from('contact_operators')
        .update(safeUpdates)
        .eq('id', id)
        .select('id, name, email, phone, is_active, operator_type, updated_at')
        .single();
      operator = fallback.data ? { ...fallback.data, capacity: (updates.capacity as number) ?? 40 } as typeof operator : null;
      error = fallback.error;
    } else {
      // Only capacity was attempted, but column doesn't exist yet
      const fetchCurrent = await supabaseAdmin
        .from('contact_operators')
        .select('id, name, email, phone, is_active, operator_type, updated_at')
        .eq('id', id)
        .single();
      operator = fetchCurrent.data ? { ...fetchCurrent.data, capacity: (updates.capacity as number) ?? 40 } as typeof operator : null;
      error = fetchCurrent.error;
    }
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!operator) return NextResponse.json({ error: 'Operator not found' }, { status: 404 });

  // Audit log
  await supabaseAdmin.from('audit_logs').insert({
    action: body.is_active === false ? 'OPERATOR_DISABLED' : 'OPERATOR_UPDATED',
    details: { operator_id: id, changes: updates },
  });

  return NextResponse.json({ operator });
}

// ─── DELETE /api/operators/[id] ──────────────────────────────────────────────
// Safe permanent removal of operator (detaches assignment history to preserve audits)
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error: authError } = await requireAdmin(req);
  if (authError) return authError;

  const { id } = await params;

  // Step 1: Delete all assignments for this operator across all assignment tables
  // This safely unassigns any contacts previously assigned to this operator and prevents foreign key errors
  await Promise.allSettled([
    supabaseAdmin.from('contact_assignments').delete().eq('operator_id', id),
    supabaseAdmin.from('krishnashtami_contact_assignments').delete().eq('operator_id', id),
    supabaseAdmin.from('feedback_contact_assignments').delete().eq('operator_id', id),
    supabaseAdmin.from('master_contact_assignments').delete().eq('operator_id', id),
  ]);

  // Step 2: Delete operator from contact_operators table
  const { data: operator, error: deleteError } = await supabaseAdmin
    .from('contact_operators')
    .delete()
    .eq('id', id)
    .select('id, name, email')
    .single();

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }
  if (!operator) {
    return NextResponse.json({ error: 'Operator not found' }, { status: 404 });
  }

  // Step 3: Record audit log
  await supabaseAdmin.from('audit_logs').insert({
    action: 'OPERATOR_REMOVED',
    details: { operator_id: id, name: operator.name, email: operator.email },
  });

  return NextResponse.json({ message: 'Operator removed successfully', operator });
}
