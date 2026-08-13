import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// ─── PATCH /api/registrations/[id]/service ───────────────────────────────────
// Assigns or clears a service for a volunteer registration.
// Body: { service_id: string | null }
// Validation:
//   - Registration must have interested_to_volunteer === true
//   - Service (if provided) must exist and be active
//   - Only authenticated admins can perform this action
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const token = (req.headers.get('authorization') || '').replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: adminRecord } = await supabaseAdmin
      .from('admins')
      .select('id')
      .eq('id', user.id)
      .single();

    if (!adminRecord) {
      return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });
    }

    const { id: registrationId } = await params;
    const body = await req.json();
    const serviceId: string | null = body.service_id ?? null;

    // ── Fetch Registration ────────────────────────────────────────────────────
    const { data: registration, error: regError } = await supabaseAdmin
      .from('registrations')
      .select('id, full_name, phone, interested_to_volunteer, service_id')
      .eq('id', registrationId)
      .single();

    if (regError || !registration) {
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
    }

    // ── Volunteer Check ───────────────────────────────────────────────────────
    if (!registration.interested_to_volunteer) {
      return NextResponse.json(
        { error: 'Service assignment is only allowed for volunteers' },
        { status: 422 }
      );
    }

    const previousServiceId = registration.service_id;

    // ── Service Validation (when assigning) ──────────────────────────────────
    let serviceName: string | null = null;

    if (serviceId !== null) {
      const { data: service, error: svcError } = await supabaseAdmin
        .from('services')
        .select('id, name, is_active')
        .eq('id', serviceId)
        .single();

      if (svcError || !service) {
        return NextResponse.json({ error: 'Service not found' }, { status: 404 });
      }

      if (!service.is_active) {
        return NextResponse.json(
          { error: 'Cannot assign to an inactive service' },
          { status: 422 }
        );
      }

      serviceName = service.name;
    }

    // ── Perform Update ────────────────────────────────────────────────────────
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('registrations')
      .update({ service_id: serviceId })
      .eq('id', registrationId)
      .select(`
        *,
        services (
          id,
          name,
          is_active
        )
      `)
      .single();

    if (updateError) throw updateError;

    // ── Audit Log ─────────────────────────────────────────────────────────────
    const action = serviceId === null
      ? 'SERVICE_CHANGED'
      : previousServiceId === null
        ? 'SERVICE_ASSIGNED'
        : 'SERVICE_CHANGED';

    await supabaseAdmin.from('audit_logs').insert({
      admin_id: user.id,
      action,
      details: {
        registration_id: registrationId,
        registration_name: registration.full_name,
        registration_phone: registration.phone,
        previous_service_id: previousServiceId,
        new_service_id: serviceId,
        service_name: serviceName,
        admin_email: user.email,
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({ registration: updated });
  } catch (err) {
    console.error('[PATCH /api/registrations/[id]/service]', err);
    return NextResponse.json({ error: 'Failed to update service assignment' }, { status: 500 });
  }
}
