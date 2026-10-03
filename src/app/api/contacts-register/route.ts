import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { contactsRegisterSchema } from '@/lib/validation';
import { normalizePhone, syncMasterContact } from '@/lib/master-contacts';
import { calculateNameSimilarity } from '@/lib/name-similarity';

// ─── Rate Limiter (in-process, per-serverless-instance) ──────────────────────
const rateLimitMap = new Map<string, { count: number; lastReset: number }>();
const LIMIT = 5;
const WINDOW_MS = 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record || now - record.lastReset > WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, lastReset: now });
    return true;
  }
  if (record.count >= LIMIT) return false;
  record.count += 1;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    // 1. Rate limiting
    const ip =
      request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      'anonymous';
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Too many registration attempts. Please wait a minute and try again.' },
        { status: 429 }
      );
    }

    // 2. Validate request body
    const body = await request.json();
    const validationResult = contactsRegisterSchema.safeParse(body);

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
      collegeName,
      customCollegeName,
      areaOfStay,
      gender,
      currentStay,
      pgName,
      skills,
      interestedOnlineWork,
    } = validationResult.data;

    // 3. Phone normalization
    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone || cleanPhone.length !== 10) {
      return NextResponse.json(
        { error: 'Please enter a valid 10-digit mobile number.' },
        { status: 400 }
      );
    }

    // 4. Authoritative duplicate check — master_contacts first (exact normalized match)
    const { data: masterContact } = await supabaseAdmin
      .from('master_contacts')
      .select('id, name, phone')
      .eq('phone', cleanPhone)
      .maybeSingle();

    if (masterContact) {
      const matchPercentage = calculateNameSimilarity(fullName, masterContact.name);
      const isSubstantiallyDifferent =
        fullName.trim().length >= 2 && matchPercentage < 40;

      const warningMsg = isSubstantiallyDifferent
        ? 'This mobile number is already registered under another name. Please contact the administrator if you believe this is incorrect.'
        : `Contact already exists with approximately ${matchPercentage}% name match.`;

      return NextResponse.json(
        { error: warningMsg, isDuplicate: true, matchPercentage },
        { status: 409 }
      );
    }

    // 5. Secondary duplicate check — contacts_register table (exact normalized match)
    //    Uses eq() on the raw phone column; the DB unique index on normalize_phone(phone)
    //    provides the final concurrency guarantee against simultaneous submissions.
    const { data: existingRegister } = await supabaseAdmin
      .from('contacts_register')
      .select('id, full_name, phone')
      .eq('phone', cleanPhone)
      .maybeSingle();

    if (existingRegister) {
      const matchPercentage = calculateNameSimilarity(fullName, existingRegister.full_name);
      const isSubstantiallyDifferent =
        fullName.trim().length >= 2 && matchPercentage < 40;

      const warningMsg = isSubstantiallyDifferent
        ? 'This mobile number is already registered under another name. Please contact the administrator if you believe this is incorrect.'
        : `Contact already exists with approximately ${matchPercentage}% name match.`;

      return NextResponse.json(
        { error: warningMsg, isDuplicate: true, matchPercentage },
        { status: 409 }
      );
    }

    // 6. Prepare insert payload
    const finalCollegeName =
      collegeName === 'Other'
        ? customCollegeName?.trim() || 'Other'
        : collegeName.trim();

    const finalPgName =
      currentStay === 'In Hostel' ? pgName?.trim() || null : null;

    const insertPayload = {
      full_name: fullName.trim(),
      phone: cleanPhone,
      college_name: finalCollegeName,
      area_of_stay: areaOfStay.trim(),
      gender,
      current_stay: currentStay,
      pg_name: finalPgName,
      skills: skills || [],
      interested_online_workshop: interestedOnlineWork === 'Yes',
    };

    // 7. Insert — NO self-healing DDL. If the table is missing, the approved
    //    migration (20261003000000_contacts_register_schema.sql) must be applied
    //    first. A missing table returns a clear 500 with the DB error message.
    const { data: inserted, error } = await supabaseAdmin
      .from('contacts_register')
      .insert(insertPayload)
      .select('id')
      .single();

    if (error) {
      console.error('[POST /api/contacts-register] Insertion error:', error);

      // Surface a clear configuration error if the table itself is missing.
      if (error.code === '42P01') {
        return NextResponse.json(
          {
            error:
              'Server configuration error: contacts_register table not found. ' +
              'The approved database migration must be applied before accepting registrations.',
          },
          { status: 503 }
        );
      }

      // Unique constraint violation — concurrent duplicate submission.
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'This mobile number was just registered. Duplicate submission rejected.' },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: `Database error: ${error.message}` },
        { status: 500 }
      );
    }

    // 8. Master contact sync (non-blocking — failure does not fail the registration)
    if (inserted?.id) {
      try {
        await syncMasterContact({
          source: 'contacts_register',
          event_display_name: 'Contacts Register',
          event_record_id: String(inserted.id),
          phone: cleanPhone,
          name: fullName.trim(),
          gender,
          area_of_stay: areaOfStay.trim(),
          company_college: finalCollegeName,
        });
      } catch (masterErr) {
        // Log but do not fail the user-facing response.
        console.warn('[POST /api/contacts-register] Master sync warning:', masterErr);
      }
    }

    return NextResponse.json({ success: true, id: inserted?.id }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/contacts-register] Exception:', err);
    return NextResponse.json(
      { error: 'An unexpected server error occurred.' },
      { status: 500 }
    );
  }
}
