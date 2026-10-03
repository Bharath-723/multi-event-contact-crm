import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { normalizePhone, syncMasterContact } from '@/lib/master-contacts';

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

// ─── PATCH /api/contacts-register/[id] (Admin Edit) ────────────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error: authError } = await requireAdmin(request);
  if (authError) return authError;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Missing registration ID' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const {
      full_name,
      phone,
      college_name,
      area_of_stay,
      gender,
      current_stay,
      pg_name,
      skills,
      interested_online_workshop,
    } = body;

    // Basic Field Validations
    if (!full_name || full_name.trim().length < 2) {
      return NextResponse.json({ error: 'Full name must be at least 2 characters' }, { status: 400 });
    }
    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone || cleanPhone.length !== 10) {
      return NextResponse.json({ error: 'Please enter a valid 10-digit mobile number' }, { status: 400 });
    }
    if (!['Male', 'Female'].includes(gender)) {
      return NextResponse.json({ error: 'Gender must be Male or Female' }, { status: 400 });
    }
    const isMale = gender === 'Male';
    if (isMale && !['With Parents', 'In Hostel'].includes(current_stay)) {
      return NextResponse.json({ error: 'Current stay must be With Parents or In Hostel' }, { status: 400 });
    }

    const finalCurrentStay = isMale ? current_stay : null;
    const finalPgName = (isMale && current_stay === 'In Hostel') ? pg_name?.trim() || null : null;
    if (isMale && current_stay === 'In Hostel' && (!finalPgName || finalPgName.length < 2)) {
      return NextResponse.json({ error: 'PG Name is required when staying in hostel' }, { status: 400 });
    }

    const updatePayload = {
      full_name: full_name.trim(),
      phone: cleanPhone,
      college_name: college_name ? college_name.trim() : 'Other',
      area_of_stay: area_of_stay ? area_of_stay.trim() : '',
      gender,
      current_stay: finalCurrentStay,
      pg_name: finalPgName,
      skills: Array.isArray(skills) ? skills : [],
      interested_online_workshop: Boolean(interested_online_workshop),
      updated_at: new Date().toISOString(),
    };

    const { data: updated, error } = await supabaseAdmin
      .from('contacts_register')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'This mobile number is already registered for another contact.' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Trigger Master Contact Sync Reconciliation
    try {
      await syncMasterContact({
        source: 'contacts_register',
        event_display_name: 'Contacts Register',
        event_record_id: String(id),
        phone: cleanPhone,
        name: full_name.trim(),
        gender,
        area_of_stay: area_of_stay?.trim(),
        company_college: college_name?.trim(),
      });
    } catch (masterErr) {
      console.warn('[PATCH /api/contacts-register/[id]] Master sync warning:', masterErr);
    }

    await supabaseAdmin.from('audit_logs').insert({
      action: 'CONTACTS_REGISTER_UPDATED',
      details: { registration_id: id, updated_fields: Object.keys(updatePayload) },
    });

    return NextResponse.json({ success: true, registration: updated });
  } catch (err) {
    console.error('PATCH /api/contacts-register/[id] error:', err);
    return NextResponse.json({ error: 'An unexpected server error occurred.' }, { status: 500 });
  }
}

// ─── DELETE /api/contacts-register/[id] (Admin Source-Only Delete) ─────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error: authError } = await requireAdmin(request);
  if (authError) return authError;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Missing registration ID' }, { status: 400 });
  }

  try {
    // Delete ONLY from contacts_register source table.
    // Master contacts and assignments remain untouched.
    const { error } = await supabaseAdmin
      .from('contacts_register')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabaseAdmin.from('audit_logs').insert({
      action: 'CONTACTS_REGISTER_DELETED',
      details: { registration_id: id },
    });

    return NextResponse.json({ success: true, message: 'Record deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/contacts-register/[id] error:', err);
    return NextResponse.json({ error: 'An unexpected server error occurred.' }, { status: 500 });
  }
}
