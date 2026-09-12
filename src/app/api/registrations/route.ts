import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { registrationSchema } from '@/lib/validation';
import { assignOperator } from '@/lib/assignment-engine';
import { REGISTRATION_STATUS } from '@/lib/constants/app-status';
import { arePrasadamSelectionsValidForSlot } from '@/lib/constants/prasadam-rules';
import { resolveFestivalDetailsFromHost } from '@/lib/festival-resolver';

// Basic in-memory rate limiting
const rateLimitMap = new Map<string, { count: number; lastReset: number }>();
const LIMIT = 5; // Allow maximum 5 registration submissions per minute per IP
const WINDOW_MS = 60 * 1000; // 1 minute window

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record) {
    rateLimitMap.set(ip, { count: 1, lastReset: now });
    return true;
  }

  if (now - record.lastReset > WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, lastReset: now });
    return true;
  }

  if (record.count >= LIMIT) {
    return false;
  }

  record.count += 1;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    // 0. Registration Status Protection
    if (REGISTRATION_STATUS !== 'OPEN') {
      return NextResponse.json(
        {
          success: false,
          message: 'Registrations for Krishnashtami 2026 have been closed. Thank you for your support.',
        },
        { status: 403 }
      );
    }
    // 1. Rate Limiting Check
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'anonymous';
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Too many registration attempts. Please wait a minute and try again.' },
        { status: 429 }
      );
    }

    // 2. Parse and Validate Request Body
    const body = await request.json();
    const validationResult = registrationSchema.safeParse(body);

    if (!validationResult.success) {
      const errorMessages = validationResult.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      return NextResponse.json(
        { error: 'Validation failed', details: errorMessages },
        { status: 400 }
      );
    }

    const {
      fullName,
      phone,
      age,
      gender,
      occupation,
      standard,
      areaOfStay,
      companyCollege,
      pgName,
      interestedToVolunteer,
      volunteerSlotId,
      volunteerSlotTime,
      interestedToDinner,
      prasadamSelections,
      wantsToDonate,
      transportationRequired,
      skills,
    } = validationResult.data;

    // 3. Strict Backend Validation: Validate ALL Prasadam Selections Against Time Slot
    // This cannot be bypassed by the frontend — backend is the authoritative validator.
    if (interestedToDinner === 'Yes' && prasadamSelections && prasadamSelections.length > 0 && volunteerSlotTime) {
      const { valid, invalidItems } = arePrasadamSelectionsValidForSlot(volunteerSlotTime, prasadamSelections);
      if (!valid) {
        return NextResponse.json(
          { error: `The following prasadam option(s) are not permitted for slot (${volunteerSlotTime}): ${invalidItems.join(', ')}` },
          { status: 400 }
        );
      }
    }

    // 4. Resolve festival details from Host header
    const hostHeader = request.headers.get('host');
    const { id: festivalEventId, slug: festivalSlug } = await resolveFestivalDetailsFromHost(hostHeader);

    const isKrishnashtami = festivalSlug === 'krishnashtami-2026';
    const rpcName = isKrishnashtami ? 'register_krishnashtami_volunteer' : 'register_volunteer';
    const prasadamTable = isKrishnashtami ? 'krishnashtami_registration_prasadam' : 'registration_prasadam';
    const targetRegTable = isKrishnashtami ? 'krishnashtami_registrations' : 'registrations';

    const cleanStandard = isKrishnashtami && occupation === 'Student' ? (standard || null) : null;

    // 5. Database operation calling the dedicated atomic Postgres RPC
    const rpcParams: Record<string, unknown> = {
      p_full_name: fullName,
      p_phone: phone,
      p_age: age,
      p_gender: gender,
      p_area_of_stay: gender === 'Male' ? areaOfStay || null : null,
      p_company_college: companyCollege,
      p_pg_name: pgName || null,
      p_interested_to_volunteer: interestedToVolunteer === 'Yes',
      p_volunteer_slot_id: interestedToVolunteer === 'Yes' && volunteerSlotId ? volunteerSlotId : null,
      p_interested_to_dinner: interestedToDinner === 'Yes',
      p_wants_to_donate: wantsToDonate === 'Yes',
      p_donation_status: wantsToDonate === 'Yes' ? 'User Opted to Donate' : 'Pending',
      p_skill_ids: skills,
      p_occupation: occupation || null,
      p_transportation_required: gender === 'Male' ? transportationRequired || 'No' : 'No',
      p_festival_event_id: festivalEventId,
    };

    if (isKrishnashtami) {
      rpcParams.p_prasadam_types = interestedToDinner === 'Yes' ? (prasadamSelections || []) : [];
      rpcParams.p_standard = cleanStandard;
    }

    let { data: registrationId, error } = await supabase.rpc(rpcName, rpcParams);

    // Fallback: If 18-param RPC signature is not present yet, call 17-param signature
    if (error && isKrishnashtami && error.message.includes('p_standard')) {
      delete rpcParams.p_standard;
      const fallbackRes = await supabase.rpc(rpcName, rpcParams);
      registrationId = fallbackRes.data;
      error = fallbackRes.error;
    }

    if (!error && isKrishnashtami && registrationId) {
      try {
        await supabaseAdmin
          .from('krishnashtami_registrations')
          .update({ standard: cleanStandard })
          .eq('id', registrationId);
      } catch (colErr) {
        console.warn('Post-insert standard update warning:', colErr);
      }
    }

    if (error) {
      console.error('Database insertion error:', error);
      
      // Handle Postgres unique constraint violation or custom RAISE EXCEPTION
      if (error.code === '23505' || error.message.includes('already registered')) {
        return NextResponse.json(
          { error: 'This phone number has already been registered for the event.' },
          { status: 400 }
        );
      }
      
      return NextResponse.json(
        { 
          error: 'Database insertion failed. Please try again later.',
          details: {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint
          }
        },
        { status: 500 }
      );
    }

    // 6. For Rathayatra legacy RPC: insert prasadam selections into registration_prasadam table
    if (!isKrishnashtami && interestedToDinner === 'Yes' && prasadamSelections && prasadamSelections.length > 0 && registrationId) {
      try {
        const prasadamRows = prasadamSelections.map((meal) => ({
          registration_id: registrationId,
          festival_event_id: festivalEventId,
          prasadam_type: meal,
        }));

        const { error: prasadamError } = await supabaseAdmin
          .from(prasadamTable)
          .insert(prasadamRows);

        if (prasadamError) {
          console.error(`Failed to insert prasadam selections into ${prasadamTable}, rolling back registration:`, prasadamError);
          await supabaseAdmin.from(targetRegTable).delete().eq('id', registrationId);
          return NextResponse.json(
            { error: 'Failed to record prasadam options. Registration rolled back. Please try again.' },
            { status: 500 }
          );
        }
      } catch (prasadamInsertErr) {
        console.error(`Unexpected error during prasadam insert into ${prasadamTable}, rolling back registration:`, prasadamInsertErr);
        await supabaseAdmin.from(targetRegTable).delete().eq('id', registrationId);
        return NextResponse.json(
          { error: 'An error occurred while saving prasadam options. Registration rolled back. Please try again.' },
          { status: 500 }
        );
      }
    }

    // 7. Sync to Master Contacts Global Directory
    try {
      const { syncMasterContact } = await import('@/lib/master-contacts');
      await syncMasterContact({
        source: isKrishnashtami ? 'krishnashtami' : 'rathayatra',
        event_display_name: isKrishnashtami ? 'Krishnashtami 2026' : 'Rathayatra 2026',
        event_record_id: String(registrationId),
        phone,
        name: fullName,
        age,
        gender,
        area_of_stay: gender === 'Male' ? areaOfStay || null : null,
        company_college: companyCollege,
        occupation: occupation || null,
        standard: cleanStandard,
        interested_to_volunteer: interestedToVolunteer === 'Yes' ? 'Yes' : 'No',
      });
    } catch (masterSyncErr) {
      console.warn('Master contact sync warning:', masterSyncErr);
    }

    // 8. Attempt automatic operator assignment (DO NOT block or fail registration if this fails)
    try {
      await assignOperator(registrationId, isKrishnashtami ? 'krishnashtami' : 'rathayatra');
    } catch (assignError) {
      console.error('Failed to automatically assign operator to registration:', assignError);
    }

    return NextResponse.json(
      { success: true, registrationId },
      { status: 201 }
    );
  } catch (error) {
    console.error('Internal server error in registration:', error);
    return NextResponse.json(
      { error: 'An unexpected server error occurred. Please try again.' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized: Missing token' }, { status: 401 });
    }
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
    }
    const { data: adminRow } = await supabaseAdmin.from('admins').select('id').eq('id', user.id).single();
    if (!adminRow) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const {
      id,
      source: sourceParam,
      full_name,
      phone,
      age,
      gender,
      area_of_stay,
      company_college,
      pg_name,
      interested_to_volunteer,
      volunteer_slot_id,
      interested_to_dinner,
      wants_to_donate,
      donation_status,
      occupation,
      transportation_required,
      standard,
      skill_ids,
    } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid registration id' }, { status: 400 });
    }

    const { normalizeSource } = await import('@/lib/source-resolver');
    const normalized = normalizeSource(sourceParam);

    if (normalized === 'krishnashtami') {
      const updateData: Record<string, unknown> = {
        full_name: full_name?.trim(),
        phone: phone?.trim(),
        age: Number(age),
        gender,
        area_of_stay: gender === 'Male' ? area_of_stay?.trim() : null,
        company_college: company_college?.trim(),
        pg_name: pg_name ? pg_name.trim() : null,
        interested_to_volunteer: Boolean(interested_to_volunteer),
        volunteer_slot_id: interested_to_volunteer ? (volunteer_slot_id || null) : null,
        interested_to_dinner: Boolean(interested_to_dinner),
        wants_to_donate: Boolean(wants_to_donate),
        donation_status: wants_to_donate ? donation_status : 'Pending',
        occupation: occupation || null,
        transportation_required: transportation_required || 'No',
        standard: occupation === 'Student' ? (standard || null) : null,
        updated_at: new Date().toISOString(),
      };

      const { error: updateErr } = await supabaseAdmin
        .from('krishnashtami_registrations')
        .update(updateData)
        .eq('id', id);

      if (updateErr) {
        return NextResponse.json({ error: `Update failed: ${updateErr.message}`, details: updateErr }, { status: 500 });
      }

      // Sync skills
      await supabaseAdmin.from('krishnashtami_registration_skills').delete().eq('registration_id', id);
      if (Array.isArray(skill_ids) && skill_ids.length > 0) {
        const skillInserts = skill_ids.map((sid: string) => ({ registration_id: id, skill_id: sid }));
        await supabaseAdmin.from('krishnashtami_registration_skills').insert(skillInserts);
      }

      return NextResponse.json({ success: true, message: 'Krishnashtami record updated successfully' });
    } else if (normalized === 'rathayatra') {
      const updateData: Record<string, unknown> = {
        full_name: full_name?.trim(),
        phone: phone?.trim(),
        age: Number(age),
        gender,
        area_of_stay: gender === 'Male' ? area_of_stay?.trim() : null,
        company_college: company_college?.trim(),
        pg_name: pg_name ? pg_name.trim() : null,
        interested_to_volunteer: Boolean(interested_to_volunteer),
        volunteer_slot_id: interested_to_volunteer ? (volunteer_slot_id || null) : null,
        interested_to_dinner: Boolean(interested_to_dinner),
        wants_to_donate: Boolean(wants_to_donate),
        donation_status: wants_to_donate ? donation_status : 'Pending',
        occupation: occupation || null,
        transportation_required: transportation_required || 'No',
        updated_at: new Date().toISOString(),
      };

      const { error: updateErr } = await supabaseAdmin
        .from('registrations')
        .update(updateData)
        .eq('id', id);

      if (updateErr) {
        return NextResponse.json({ error: `Update failed: ${updateErr.message}`, details: updateErr }, { status: 500 });
      }

      // Sync skills
      await supabaseAdmin.from('registration_skills').delete().eq('registration_id', id);
      if (Array.isArray(skill_ids) && skill_ids.length > 0) {
        const skillInserts = skill_ids.map((sid: string) => ({ registration_id: id, skill_id: sid }));
        await supabaseAdmin.from('registration_skills').insert(skillInserts);
      }

      return NextResponse.json({ success: true, message: 'Rathayatra record updated successfully' });
    } else {
      return NextResponse.json({ error: 'Unsupported source for registration edit' }, { status: 400 });
    }
  } catch (err) {
    console.error('Error in PATCH /api/registrations:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error during edit update' }, { status: 500 });
  }
}


export async function DELETE(request: NextRequest) {
  try {
    let registrationId: string | null = null;
    let sourceParam: string | null = null;

    // Support both JSON body and searchParams
    const url = new URL(request.url);
    const searchId = url.searchParams.get('id') || url.searchParams.get('registrationId');
    const searchSource = url.searchParams.get('source');

    if (searchId) {
      registrationId = searchId;
      sourceParam = searchSource;
    } else {
      try {
        const body = await request.json();
        registrationId = body?.registrationId || body?.id || null;
        sourceParam = body?.source || null;
      } catch {
        // body parsing failed or empty
      }
    }

    if (!registrationId || typeof registrationId !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid registrationId' },
        { status: 400 }
      );
    }

    const { normalizeSource } = await import('@/lib/source-resolver');
    const normalized = normalizeSource(sourceParam);
    if (normalized !== 'krishnashtami' && normalized !== 'rathayatra') {
      return NextResponse.json(
        { error: 'Invalid or unsupported source for registration delete' },
        { status: 400 }
      );
    }

    const isKrishnashtami = normalized === 'krishnashtami';
    const regTable = isKrishnashtami ? 'krishnashtami_registrations' : 'registrations';
    const prasadamTable = isKrishnashtami ? 'krishnashtami_registration_prasadam' : 'registration_prasadam';
    const skillsTable = isKrishnashtami ? 'krishnashtami_registration_skills' : 'registration_skills';
    const assignmentsTable = isKrishnashtami ? 'krishnashtami_contact_assignments' : 'contact_assignments';
    const visitsTable = isKrishnashtami ? 'krishnashtami_visitor_visits' : 'visitor_visits';

    // 1. Server-side verification: Check if registration exists in target table
    const { data: existingReg, error: findError } = await supabaseAdmin
      .from(regTable)
      .select('id')
      .eq('id', registrationId)
      .maybeSingle();

    if (findError) {
      console.error(`Error checking registration in ${regTable}:`, findError);
      return NextResponse.json(
        { error: `Database check failed: ${findError.message}` },
        { status: 500 }
      );
    }

    if (!existingReg) {
      return NextResponse.json(
        { error: `Registration not found in ${regTable}` },
        { status: 404 }
      );
    }

    // 2. Explicitly delete child/dependent records using supabaseAdmin for clean cascade
    await supabaseAdmin.from(prasadamTable).delete().eq('registration_id', registrationId);
    await supabaseAdmin.from(skillsTable).delete().eq('registration_id', registrationId);
    await supabaseAdmin.from(assignmentsTable).delete().eq('registration_id', registrationId);
    await supabaseAdmin.from(visitsTable).delete().eq('registration_id', registrationId);

    if (isKrishnashtami) {
      await supabaseAdmin.from('notifications').delete().eq('krishnashtami_registration_id', registrationId);
    } else {
      await supabaseAdmin.from('notifications').delete().eq('registration_id', registrationId);
    }

    // 3. Delete parent record from source-specific registration table
    const { error: deleteError } = await supabaseAdmin
      .from(regTable)
      .delete()
      .eq('id', registrationId);

    if (deleteError) {
      console.error(`Failed to delete registration from ${regTable}:`, deleteError);
      return NextResponse.json(
        { error: `Failed to delete registration from ${regTable}: ${deleteError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Registration ${registrationId} deleted successfully from ${regTable}`,
      deletedId: registrationId,
      source: normalized,
    });
  } catch (error) {
    console.error('Error in DELETE /api/registrations:', error);
    return NextResponse.json(
      { error: 'An unexpected server error occurred during deletion' },
      { status: 500 }
    );
  }
}

