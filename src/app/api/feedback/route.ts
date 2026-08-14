import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { feedbackSchema } from '@/lib/validation';
import { autoAssignFeedbackContact } from '@/lib/assignment-engine-feedback';

const CREATE_FEEDBACK_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS feedback_contacts (
    id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name                  TEXT NOT NULL,
    phone                      TEXT NOT NULL,
    college_name               TEXT NOT NULL,
    branch                     TEXT NOT NULL,
    gender                     TEXT NOT NULL CHECK (gender IN ('Male', 'Female')),
    current_stay               TEXT NOT NULL CHECK (current_stay IN ('With Parents', 'In Hostel')),
    skills                     TEXT[] NOT NULL DEFAULT '{}',
    feedback                   TEXT NOT NULL CHECK (feedback IN ('Excellent', 'Good', 'Not Applicable')),
    interested_online_workshop BOOLEAN NOT NULL DEFAULT FALSE,
    interested_online_work     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at                 TIMESTAMPTZ DEFAULT NOW(),
    updated_at                 TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure missing columns are added to pre-existing tables
ALTER TABLE feedback_contacts ADD COLUMN IF NOT EXISTS interested_online_workshop BOOLEAN DEFAULT FALSE;
ALTER TABLE feedback_contacts ADD COLUMN IF NOT EXISTS interested_online_work BOOLEAN DEFAULT FALSE;
ALTER TABLE feedback_contacts ADD COLUMN IF NOT EXISTS college_name TEXT;
ALTER TABLE feedback_contacts ADD COLUMN IF NOT EXISTS branch TEXT;
ALTER TABLE feedback_contacts ADD COLUMN IF NOT EXISTS current_stay TEXT;
ALTER TABLE feedback_contacts ADD COLUMN IF NOT EXISTS skills TEXT[] DEFAULT '{}';
ALTER TABLE feedback_contacts ADD COLUMN IF NOT EXISTS feedback TEXT;

CREATE INDEX IF NOT EXISTS idx_feedback_contacts_phone ON feedback_contacts(phone);
CREATE INDEX IF NOT EXISTS idx_feedback_contacts_created_at ON feedback_contacts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_contacts_college ON feedback_contacts(college_name);
CREATE INDEX IF NOT EXISTS idx_feedback_contacts_branch ON feedback_contacts(branch);

ALTER TABLE feedback_contacts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'feedback_contacts' AND policyname = 'feedback_contacts_insert_public'
  ) THEN
    CREATE POLICY "feedback_contacts_insert_public" ON feedback_contacts FOR INSERT WITH CHECK (TRUE);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'feedback_contacts' AND policyname = 'feedback_contacts_read_authenticated'
  ) THEN
    CREATE POLICY "feedback_contacts_read_authenticated" ON feedback_contacts FOR SELECT USING (TRUE);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'feedback_contacts' AND policyname = 'feedback_contacts_admin_all'
  ) THEN
    CREATE POLICY "feedback_contacts_admin_all" ON feedback_contacts FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
  END IF;
END$$;

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
`;

// Rate Limiter for feedback submission
const rateLimitMap = new Map<string, { count: number; lastReset: number }>();
const LIMIT = 5; // max 5 submissions per minute per IP
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

// ── Helper: Require Admin Authorization for GET ──────────────────────────────
async function requireAdmin(req: Request): Promise<{ error: NextResponse | null; userId?: string }> {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { data: adminRow } = await supabaseAdmin.from('admins').select('id').eq('id', user.id).single();
  if (!adminRow) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { error: null, userId: user.id };
}

// ─── POST /api/feedback ──────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'anonymous';
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Too many feedback attempts. Please wait a minute and try again.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const validationResult = feedbackSchema.safeParse(body);

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
      branch,
      gender,
      currentStay,
      skills,
      feedback,
      interestedOnlineWork,
    } = validationResult.data;

    const cleanPhone = phone.replace(/\D/g, '').slice(-10);

    // Enforce Backend Mobile Uniqueness for Feedback Submissions
    const { data: existingFeedback } = await supabaseAdmin
      .from('feedback_contacts')
      .select('id')
      .ilike('phone', `%${cleanPhone}`)
      .maybeSingle();

    if (existingFeedback) {
      return NextResponse.json(
        { error: 'Feedback has already been submitted for this mobile number.' },
        { status: 409 }
      );
    }

    const payloadWorkshop = {
      full_name: fullName,
      phone,
      college_name: collegeName,
      branch,
      gender,
      current_stay: currentStay,
      skills: skills || [],
      feedback,
      interested_online_workshop: interestedOnlineWork === 'Yes',
    };

    const payloadWork = {
      ...payloadWorkshop,
      interested_online_work: interestedOnlineWork === 'Yes',
    };

    // 1. First attempt inserting payload containing both column variants
    let { data: inserted, error } = await supabaseAdmin
      .from('feedback_contacts')
      .insert(payloadWork)
      .select('id')
      .single();

    // 2. Self-healing: if error, execute DDL to ensure both columns exist and reload PostgREST schema cache
    if (error) {
      console.warn('[POST /api/feedback] Initial insert error:', error.message);
      try {
        await supabaseAdmin.rpc('exec_sql', { sql: CREATE_FEEDBACK_TABLE_SQL });
      } catch (e) {
        console.error('[POST /api/feedback] RPC exec_sql error:', e);
      }

      // Retry with payloadWorkshop
      let retry = await supabaseAdmin
        .from('feedback_contacts')
        .insert(payloadWorkshop)
        .select('id')
        .single();

      if (retry.error) {
        // Fallback retry with payloadWork
        retry = await supabaseAdmin
          .from('feedback_contacts')
          .insert({
            full_name: fullName,
            phone,
            college_name: collegeName,
            branch,
            gender,
            current_stay: currentStay,
            skills: skills || [],
            feedback,
            interested_online_work: interestedOnlineWork === 'Yes',
          })
          .select('id')
          .single();
      }

      inserted = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error('[POST /api/feedback] Database error:', error);
      return NextResponse.json(
        { error: `Database error: ${error.message}` },
        { status: 500 }
      );
    }

    if (inserted?.id) {
      try {
        await autoAssignFeedbackContact(inserted.id, 'system_auto');
      } catch (assignErr) {
        console.warn('[POST /api/feedback] Auto-assign error:', assignErr);
      }
    }

    return NextResponse.json(
      { success: true, id: inserted?.id },
      { status: 201 }
    );
  } catch (err) {
    console.error('[POST /api/feedback] Exception:', err);
    return NextResponse.json(
      { error: 'An unexpected server error occurred.' },
      { status: 500 }
    );
  }
}

// ─── GET /api/feedback ───────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const { error: authError } = await requireAdmin(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const search = url.searchParams.get('search') || '';
  const gender = url.searchParams.get('gender') || '';
  const college = url.searchParams.get('college') || '';
  const branch = url.searchParams.get('branch') || '';
  const currentStay = url.searchParams.get('current_stay') || '';
  const feedback = url.searchParams.get('feedback') || '';
  const interestedOnlineWork = url.searchParams.get('interested_online_work') || url.searchParams.get('interested_online_workshop') || '';
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const limit = parseInt(url.searchParams.get('limit') || '20', 10);

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  try {
    // 1. Fetch Global Summary Stats across ALL feedback_contacts
    let { data: allRows, error: statsError } = await supabaseAdmin
      .from('feedback_contacts')
      .select('*');

    if (statsError) {
      try {
        await supabaseAdmin.rpc('exec_sql', { sql: CREATE_FEEDBACK_TABLE_SQL });
        const retryStats = await supabaseAdmin
          .from('feedback_contacts')
          .select('*');
        allRows = retryStats.data;
        statsError = retryStats.error;
      } catch (e) {
        console.error('[GET /api/feedback] Auto-migration error:', e);
      }
    }

    if (statsError) {
      return NextResponse.json({ error: statsError.message }, { status: 500 });
    }

interface RawFeedbackRow {
  gender?: string;
  current_stay?: string;
  feedback?: string;
  interested_online_workshop?: boolean;
  interested_online_work?: boolean;
  [key: string]: unknown;
}

    const rows = (allRows || []) as RawFeedbackRow[];

    const stats = {
      total_responses: rows.length,
      total_male: rows.filter((r) => r.gender === 'Male').length,
      total_female: rows.filter((r) => r.gender === 'Female').length,
      total_excellent: rows.filter((r) => r.feedback === 'Excellent').length,
      total_good: rows.filter((r) => r.feedback === 'Good').length,
      total_not_applicable: rows.filter((r) => r.feedback === 'Not Applicable').length,
      total_online_work: rows.filter((r) => r.interested_online_workshop === true || r.interested_online_work === true).length,
      total_with_parents: rows.filter((r) => r.current_stay === 'With Parents').length,
      total_in_hostel: rows.filter((r) => r.current_stay === 'In Hostel').length,
    };

    // 2. Build filtered Query
    let query = supabaseAdmin
      .from('feedback_contacts')
      .select('*', { count: 'exact' });

    if (gender) query = query.eq('gender', gender);
    if (currentStay) query = query.eq('current_stay', currentStay);
    if (feedback) query = query.eq('feedback', feedback);
    if (college) query = query.ilike('college_name', `%${college}%`);
    if (branch) query = query.ilike('branch', `%${branch}%`);

    if (search.trim()) {
      const s = `%${search.trim()}%`;
      query = query.or(`full_name.ilike.${s},phone.ilike.${s},college_name.ilike.${s},branch.ilike.${s}`);
    }

    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data: contacts, count, error: fetchError } = await query;

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    // Process contacts to ensure interested_online_workshop field is normalized
    const rawContacts = (contacts || []) as RawFeedbackRow[];
    const normalizedContacts = rawContacts.map((c) => ({
      ...c,
      interested_online_workshop: Boolean(c.interested_online_workshop ?? c.interested_online_work),
    }));

    // Filter by online workshop interest if specified
    let filteredContacts = normalizedContacts;
    if (interestedOnlineWork === 'Yes') {
      filteredContacts = normalizedContacts.filter((c) => c.interested_online_workshop === true);
    } else if (interestedOnlineWork === 'No') {
      filteredContacts = normalizedContacts.filter((c) => c.interested_online_workshop === false);
    }

    return NextResponse.json({
      success: true,
      contacts: filteredContacts,
      total: count ?? 0,
      stats,
      page,
      limit,
    });
  } catch (err) {
    console.error('[GET /api/feedback] Exception:', err);
    return NextResponse.json({ error: 'Failed to fetch feedback contacts.' }, { status: 500 });
  }
}
