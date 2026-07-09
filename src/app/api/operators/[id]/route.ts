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

  let body: { name?: string; phone?: string; is_active?: boolean; password?: string };
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

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { data: operator, error } = await supabaseAdmin
    .from('contact_operators')
    .update(updates)
    .eq('id', id)
    .select('id, name, email, phone, is_active, updated_at')
    .single();

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

  // Step 1: Detach assignments by setting operator_id to NULL and is_active to false
  const { error: updateError } = await supabaseAdmin
    .from('contact_assignments')
    .update({
      operator_id: null,
      is_active: false,
    })
    .eq('operator_id', id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

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
