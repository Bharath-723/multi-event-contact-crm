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
    }

    const { data: registrationId, error } = await supabase.rpc(rpcName, rpcParams);

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

    // 7. Attempt automatic operator assignment (DO NOT block or fail registration if this fails)
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
