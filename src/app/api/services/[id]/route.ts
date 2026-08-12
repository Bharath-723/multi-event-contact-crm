import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Auth helper ─────────────────────────────────────────────────────────────
async function requireAdmin(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '');
  if (!token) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  const { data: adminRecord } = await supabaseAdmin
    .from('admins')
    .select('id, email')
    .eq('id', user.id)
    .single();
  if (!adminRecord) return null;
  return user;
}

// ─── PUT /api/services/[id] ──────────────────────────────────────────────────
// Update service name, description, or is_active.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAdmin(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await req.json();

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.description !== undefined) updates.description = body.description?.trim() || null;
    if (body.is_active !== undefined) updates.is_active = Boolean(body.is_active);

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data: service, error: updateError } = await supabaseAdmin
      .from('services')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      if (updateError.code === '23505') {
        return NextResponse.json({ error: `Service name already exists` }, { status: 409 });
      }
      if (updateError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Service not found' }, { status: 404 });
      }
      throw updateError;
    }

    // Audit log
    const action = updates.is_active === false ? 'SERVICE_DISABLED' : 'SERVICE_UPDATED';
    await supabaseAdmin.from('audit_logs').insert({
      admin_id: user.id,
      action,
      details: {
        service_id: id,
        service_name: service.name,
        updates,
        admin_email: user.email,
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({ service });
  } catch (err) {
    console.error('[PUT /api/services/[id]]', err);
    return NextResponse.json({ error: 'Failed to update service' }, { status: 500 });
  }
}

// ─── DELETE /api/services/[id] ───────────────────────────────────────────────
// Soft-delete (disable) a service.
// Hard-delete is only allowed when no volunteers are assigned.
// Soft-delete (is_active=false) is always safe.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAdmin(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    // Check for existing volunteer assignments
    const { count } = await supabaseAdmin
      .from('registrations')
      .select('id', { count: 'exact', head: true })
      .eq('service_id', id);

    if ((count ?? 0) > 0) {
      // Cannot delete — volunteers still assigned — soft-disable instead
      return NextResponse.json(
        {
          error: `Cannot delete: ${count} volunteer(s) currently assigned. Disable the service instead.`,
          has_assignments: true,
        },
        { status: 409 }
      );
    }

    // Fetch service name for audit log
    const { data: service } = await supabaseAdmin
      .from('services')
      .select('name')
      .eq('id', id)
      .single();

    const { error: deleteError } = await supabaseAdmin
      .from('services')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    // Audit log
    await supabaseAdmin.from('audit_logs').insert({
      admin_id: user.id,
      action: 'SERVICE_DELETED',
      details: {
        service_id: id,
        service_name: service?.name ?? 'unknown',
        admin_email: user.email,
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/services/[id]]', err);
    return NextResponse.json({ error: 'Failed to delete service' }, { status: 500 });
  }
}
