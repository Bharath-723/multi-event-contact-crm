import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { registrationSchema } from '@/lib/validation';
import { assignOperator } from '@/lib/assignment-engine';
import { REGISTRATION_STATUS } from '@/lib/constants/app-status';
import { isPrasadamAllowedForSlot } from '@/lib/constants/prasadam-rules';
import { resolveFestivalEventFromHost } from '@/lib/festival-resolver';

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
      prasadamOption,
      wantsToDonate,
      transportationRequired,
      skills,
    } = validationResult.data;

    // Strict Backend Validation: Validate Prasadam Selection Against Time Slot
    if (interestedToDinner === 'Yes' && prasadamOption && volunteerSlotTime) {
      if (!isPrasadamAllowedForSlot(volunteerSlotTime, prasadamOption)) {
        return NextResponse.json(
          { error: `Selected prasadam option (${prasadamOption}) is not permitted for slot (${volunteerSlotTime}).` },
          { status: 400 }
        );
      }
    }

    // 3. Resolve festival_event_id from Host header
    const hostHeader = request.headers.get('host');
    const festivalEventId = await resolveFestivalEventFromHost(hostHeader);

    // 4. Database operation calling the atomic Postgres function 'register_volunteer'
    const { data: registrationId, error } = await supabase.rpc('register_volunteer', {
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
    });

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

    // Attempt automatic operator assignment (DO NOT block or fail registration if this fails)
    try {
      await assignOperator(registrationId);
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
