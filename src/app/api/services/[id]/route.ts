import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getRegistrationSource } from '@/lib/source-resolver';

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
// Delete a service safely for the selected festival.
// 1. Clears service assignments for the selected festival (no orphaned FKs).
// 2. Deletes or deactivates the service in public.services if safe across festivals.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAdmin(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const festivalEventId = req.nextUrl.searchParams.get('festival_event_id');
    const sourceConfig = getRegistrationSource(festivalEventId);

    // Fetch service for audit logging and ownership check
    const { data: service } = await supabaseAdmin
      .from('services')
      .select('name, festival_event_id')
      .eq('id', id)
      .maybeSingle();

    if (!service) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 });
    }

    // 1. Clear service_id assignments for the selected festival's registrations table
    const targetTable = sourceConfig.isKrishnashtami ? 'krishnashtami_registrations' : 'registrations';
    
    let clearQuery = supabaseAdmin
      .from(targetTable)
      .update({ service_id: null })
      .eq('service_id', id);

    if (!sourceConfig.isKrishnashtami && festivalEventId) {
      clearQuery = clearQuery.eq('festival_event_id', festivalEventId);
    }

    const { error: clearErr } = await clearQuery;
    if (clearErr) throw clearErr;

    // 2. Also check whether service record can be safely deleted or preserved for other festival
    if (sourceConfig.isKrishnashtami) {
      const { count: rathCount } = await supabaseAdmin
        .from('registrations')
        .select('id', { count: 'exact', head: true })
        .eq('service_id', id);

      if ((rathCount ?? 0) === 0) {
        await supabaseAdmin.from('services').delete().eq('id', id);
      }
    } else {
      const { count: krishCount } = await supabaseAdmin
        .from('krishnashtami_registrations')
        .select('id', { count: 'exact', head: true })
        .eq('service_id', id);

      if ((krishCount ?? 0) === 0) {
        await supabaseAdmin.from('registrations').update({ service_id: null }).eq('service_id', id);
        await supabaseAdmin.from('services').delete().eq('id', id);
      } else {
        await supabaseAdmin.from('registrations').update({ service_id: null }).eq('service_id', id);
      }
    }

    // Audit log
    await supabaseAdmin.from('audit_logs').insert({
      admin_id: user.id,
      action: 'SERVICE_DELETED',
      details: {
        service_id: id,
        service_name: service?.name ?? 'unknown',
        festival_event_id: festivalEventId,
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

