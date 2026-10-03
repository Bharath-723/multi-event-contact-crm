import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { contactsRegisterSchema } from '@/lib/validation';
import { normalizePhone, syncMasterContact } from '@/lib/master-contacts';
import { calculateNameSimilarity } from '@/lib/name-similarity';

const CREATE_CONTACTS_REGISTER_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS contacts_register (
    id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name                  TEXT NOT NULL,
    phone                      TEXT NOT NULL,
    college_name               TEXT NOT NULL,
    area_of_stay               TEXT NOT NULL,
    gender                     TEXT NOT NULL CHECK (gender IN ('Male', 'Female')),
    current_stay               TEXT NOT NULL CHECK (current_stay IN ('With Parents', 'In Hostel')),
    pg_name                    TEXT,
    skills                     TEXT[] NOT NULL DEFAULT '{}',
    interested_online_workshop BOOLEAN NOT NULL DEFAULT FALSE,
    created_at                 TIMESTAMPTZ DEFAULT NOW(),
    updated_at                 TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_register_phone ON contacts_register(phone);
CREATE INDEX IF NOT EXISTS idx_contacts_register_created_at ON contacts_register(created_at DESC);

ALTER TABLE contacts_register ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'contacts_register' AND policyname = 'contacts_register_insert_public'
  ) THEN
    CREATE POLICY "contacts_register_insert_public" ON contacts_register FOR INSERT WITH CHECK (TRUE);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'contacts_register' AND policyname = 'contacts_register_read_authenticated'
  ) THEN
    CREATE POLICY "contacts_register_read_authenticated" ON contacts_register FOR SELECT USING (TRUE);
  END IF;
END$$;

NOTIFY pgrst, 'reload schema';
`;

// Rate Limiter
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
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'anonymous';
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Too many registration attempts. Please wait a minute and try again.' },
        { status: 429 }
      );
    }

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

    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone || cleanPhone.length !== 10) {
      return NextResponse.json(
        { error: 'Please enter a valid 10-digit mobile number.' },
        { status: 400 }
      );
    }

    // 1. Authoritative Duplicate Protection: Check Master Contacts FIRST
    const { data: masterContact } = await supabaseAdmin
      .from('master_contacts')
      .select('id, name, phone')
      .eq('phone', cleanPhone)
      .maybeSingle();

    if (masterContact) {
      const matchPercentage = calculateNameSimilarity(fullName, masterContact.name);
      const isSubstantiallyDifferent = fullName.trim().length >= 2 && matchPercentage < 40;

      const warningMsg = isSubstantiallyDifferent
        ? 'This mobile number is already registered under another name. Please contact the administrator if you believe this is incorrect.'
        : `Contact already exists with approximately ${matchPercentage}% name match.`;

      return NextResponse.json(
        { error: warningMsg, isDuplicate: true, matchPercentage },
        { status: 409 }
      );
    }

    // 2. Check contacts_register table
    const { data: existingRegister } = await supabaseAdmin
      .from('contacts_register')
      .select('id, full_name, phone')
      .ilike('phone', `%${cleanPhone}`)
      .maybeSingle();

    if (existingRegister) {
      const matchPercentage = calculateNameSimilarity(fullName, existingRegister.full_name);
      const isSubstantiallyDifferent = fullName.trim().length >= 2 && matchPercentage < 40;

      const warningMsg = isSubstantiallyDifferent
        ? 'This mobile number is already registered under another name. Please contact the administrator if you believe this is incorrect.'
        : `Contact already exists with approximately ${matchPercentage}% name match.`;

      return NextResponse.json(
        { error: warningMsg, isDuplicate: true, matchPercentage },
        { status: 409 }
      );
    }

    // Prepare clean final payload
    const finalCollegeName = collegeName === 'Other'
      ? customCollegeName?.trim() || 'Other'
      : collegeName.trim();

    const finalPgName = currentStay === 'In Hostel' ? (pgName?.trim() || null) : null;

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

    // Insert into contacts_register table with self-healing fallback
    let { data: inserted, error } = await supabaseAdmin
      .from('contacts_register')
      .insert(insertPayload)
      .select('id')
      .single();

    if (error) {
      console.warn('[POST /api/contacts-register] Initial insert error:', error.message);
      try {
        await supabaseAdmin.rpc('exec_sql', { sql: CREATE_CONTACTS_REGISTER_TABLE_SQL });
      } catch (e) {
        console.error('[POST /api/contacts-register] Self-healing DDL error:', e);
      }

      // Retry insertion
      const retry = await supabaseAdmin
        .from('contacts_register')
        .insert(insertPayload)
        .select('id')
        .single();

      inserted = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error('[POST /api/contacts-register] Insertion error:', error);
      return NextResponse.json(
        { error: `Database error: ${error.message}` },
        { status: 500 }
      );
    }

    // Sync with Master Contacts Database
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
        console.warn('[POST /api/contacts-register] Master sync warning:', masterErr);
      }
    }

    return NextResponse.json(
      { success: true, id: inserted?.id },
      { status: 201 }
    );
  } catch (err) {
    console.error('[POST /api/contacts-register] Exception:', err);
    return NextResponse.json(
      { error: 'An unexpected server error occurred.' },
      { status: 500 }
    );
  }
}
