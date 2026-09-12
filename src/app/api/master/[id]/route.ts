import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { normalizePhone } from '@/lib/master-contacts';

async function requireAdmin(
  req: Request
): Promise<{ error: NextResponse | null; userId?: string }> {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const { data: adminRow } = await supabaseAdmin
    .from('admins')
    .select('id')
    .eq('id', user.id)
    .single();
  if (!adminRow) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };

  return { error: null, userId: user.id };
}

// ─── PUT /api/master/[id] ─────────────────────────────────────────────────────
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error: authError } = await requireAdmin(request);
  if (authError) return authError;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Contact ID is required' }, { status: 400 });

  try {
    const body = await request.json();
    const { name, phone, age, gender, area_of_stay, company_college, occupation, standard } = body;

    const normPhone = phone ? normalizePhone(phone) : undefined;

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) updatePayload.name = name ? String(name).trim() : null;
    if (normPhone) updatePayload.phone = normPhone;
    if (age !== undefined) updatePayload.age = age !== null && age !== '' ? parseInt(String(age), 10) : null;
    if (gender !== undefined) updatePayload.gender = gender ? String(gender).trim() : null;
    if (area_of_stay !== undefined) updatePayload.area_of_stay = area_of_stay ? String(area_of_stay).trim() : null;
    if (company_college !== undefined) updatePayload.company_college = company_college ? String(company_college).trim() : null;

    const { data: updatedMaster, error: updateErr } = await supabaseAdmin
      .from('master_contacts')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ error: 'Failed to update master contact: ' + updateErr.message }, { status: 500 });
    }

    // Also update master_contact_events if occupation/standard provided
    if (occupation !== undefined || standard !== undefined) {
      const eventUpdate: Record<string, unknown> = {};
      if (occupation !== undefined) eventUpdate.occupation = occupation ? String(occupation).trim() : null;
      if (standard !== undefined) eventUpdate.standard = standard ? String(standard).trim() : null;

      await supabaseAdmin
        .from('master_contact_events')
        .update(eventUpdate)
        .eq('master_contact_id', id);
    }

    return NextResponse.json({ success: true, contact: updatedMaster });
  } catch (err) {
    console.error('PUT /api/master/[id] error:', err);
    return NextResponse.json({ error: 'Server error updating master contact' }, { status: 500 });
  }
}

// ─── DELETE /api/master/[id] ──────────────────────────────────────────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error: authError } = await requireAdmin(request);
  if (authError) return authError;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Contact ID is required' }, { status: 400 });

  try {
    // Delete ONLY from master_contacts (cascades to master_contact_assignments & master_contact_events).
    // Original festival registration tables (registrations, krishnashtami_registrations, feedback_contacts) REMAIN 100% UNTOUCHED!
    const { error: delErr } = await supabaseAdmin
      .from('master_contacts')
      .delete()
      .eq('id', id);

    if (delErr) {
      return NextResponse.json({ error: 'Failed to delete master contact: ' + delErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Master contact removed successfully.' });
  } catch (err) {
    console.error('DELETE /api/master/[id] error:', err);
    return NextResponse.json({ error: 'Server error deleting master contact' }, { status: 500 });
  }
}
