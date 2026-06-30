import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { registrationSchema } from '@/lib/validation';

// Basic in-memory rate limiting (Note: in serverless environments, this is per-instance. 
// For distributed rate-limiting, Vercel KV or Upstash Redis is recommended).
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
      interestedToDinner,
      wantsToDonate,
      skills,
    } = validationResult.data;

    // 3. Database operation calling the atomic Postgres function 'register_volunteer'
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
        { error: 'Database insertion failed. Please try again later.' },
        { status: 500 }
      );
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
