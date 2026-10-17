import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { normalizePhone } from '@/lib/master-contacts';
import { getCurrentWeeklyPeriod, getNextResetTimestamp, formatWeeklyPeriodLabel } from '@/lib/weekly-period';
import { getLevelFromClassesAttended } from '@/lib/level-mapping';

// Require Admin Helper
async function requireAdmin(req: Request): Promise<{ admin: { id: string; email: string } | null; error: NextResponse | null }> {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return { admin: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return { admin: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const { data: adminRow } = await supabaseAdmin
    .from('admins')
    .select('id, email')
    .eq('id', user.id)
    .single();

  if (!adminRow) return { admin: null, error: NextResponse.json({ error: 'Forbidden: Not an admin' }, { status: 403 }) };

  return { admin: adminRow, error: null };
}

/**
 * GET /api/visitor/lookup?phone=... or ?q=... or ?id=...
 *
 * Phone-number-first and partial digit search strictly from Master Contacts.
 * Supports:
 * - Direct lookup by Master Contact ID (?id=...)
 * - Partial digit search (?q=... or ?phone=...) with 2–9 digits
 * - Canonical 10-digit Indian Mobile lookup (?phone=... or ?q=...)
 */
export async function GET(req: NextRequest) {
  const { error: authError } = await requireAdmin(req);
  if (authError) return authError;

  const currentPeriod = getCurrentWeeklyPeriod();
  const nextReset = getNextResetTimestamp();
  const periodLabel = formatWeeklyPeriodLabel(currentPeriod);

  // 1. Direct Contact ID lookup branch (?id=...)
  const directId = req.nextUrl.searchParams.get('id');
  if (directId) {
    const { data: contact, error: idErr } = await supabaseAdmin
      .from('master_contacts')
      .select('id, phone, name, age, gender, area_of_stay, company_college, level, classes_attended, chanting, created_at')
      .eq('id', directId)
      .maybeSingle();

    if (idErr || !contact) {
      return NextResponse.json({ error: 'Master contact not found' }, { status: 404 });
    }

    const normPhone = normalizePhone(contact.phone);
    const { data: existingCheckin } = await supabaseAdmin
      .from('master_contact_checkins')
      .select('id, weekly_period, checked_in_at, approved_by, admin_email')
      .eq('weekly_period', currentPeriod)
      .or(`master_contact_id.eq.${contact.id}${normPhone ? `,phone.eq.${normPhone}` : ''}`)
      .maybeSingle();

    const classesAttended = typeof contact.classes_attended === 'number' ? contact.classes_attended : 0;
    const levelInfo = getLevelFromClassesAttended(classesAttended);

    return NextResponse.json({
      found: true,
      is_partial: false,
      contact: {
        id: contact.id,
        name: contact.name || 'Anonymous Visitor',
        phone: contact.phone,
        age: contact.age,
        gender: contact.gender || '—',
        area_of_stay: contact.area_of_stay || '—',
        company_college: contact.company_college || '—',
        current_level: levelInfo.code,
        descriptive_level_name: levelInfo.displayLabel,
        level_badge_class: levelInfo.badgeClass,
        classes_attended: classesAttended,
        chanting: typeof contact.chanting === 'number' ? contact.chanting : 0,
        is_approved_this_week: !!existingCheckin,
        checked_in_at: existingCheckin?.checked_in_at || null,
        approved_by_email: existingCheckin?.admin_email || null,
      },
      weekly_period: currentPeriod,
      weekly_period_label: periodLabel,
      next_reset: nextReset.toISOString(),
    });
  }

  // 2. Extract and inspect phone search query
  const rawQuery = req.nextUrl.searchParams.get('phone') ?? req.nextUrl.searchParams.get('q') ?? '';
  const digits = rawQuery.replace(/\D/g, '');

  if (digits.length < 2) {
    return NextResponse.json(
      { error: 'Enter at least 2 digits to search contacts' },
      { status: 400 }
    );
  }

  // ── Helper: Map check-in status and level metadata for contact list ──────────
  async function formatAndAttachCheckins(contactsList: Array<{
    id: string;
    phone: string;
    name?: string | null;
    age?: number | null;
    gender?: string | null;
    area_of_stay?: string | null;
    company_college?: string | null;
    level?: string | null;
    classes_attended?: number | null;
    chanting?: number | null;
  }>) {
    if (!contactsList || contactsList.length === 0) return [];

    const contactIds = contactsList.map(c => c.id).filter(Boolean);
    const contactPhones = Array.from(new Set(
      contactsList.map(c => normalizePhone(c.phone)).filter((p): p is string => !!p && p.length === 10)
    ));

    const checkinsMap = new Map<string, { id: string; checked_in_at: string; admin_email: string | null }>();

    if (contactIds.length > 0) {
      const orClauses: string[] = [`master_contact_id.in.(${contactIds.join(',')})`];
      if (contactPhones.length > 0) {
        orClauses.push(`phone.in.(${contactPhones.join(',')})`);
      }

      const { data: checkinRows } = await supabaseAdmin
        .from('master_contact_checkins')
        .select('id, master_contact_id, phone, checked_in_at, approved_by, admin_email')
        .eq('weekly_period', currentPeriod)
        .or(orClauses.join(','));

      if (checkinRows) {
        for (const row of checkinRows) {
          if (row.master_contact_id) {
            checkinsMap.set(row.master_contact_id, {
              id: row.id,
              checked_in_at: row.checked_in_at,
              admin_email: row.admin_email,
            });
          }
          if (row.phone) {
            checkinsMap.set(`phone:${row.phone}`, {
              id: row.id,
              checked_in_at: row.checked_in_at,
              admin_email: row.admin_email,
            });
          }
        }
      }
    }

    return contactsList.map(c => {
      const normPhone = normalizePhone(c.phone);
      const existingCheckin = checkinsMap.get(c.id) || (normPhone ? checkinsMap.get(`phone:${normPhone}`) : undefined);
      const classesAttended = typeof c.classes_attended === 'number' ? c.classes_attended : 0;
      const levelInfo = getLevelFromClassesAttended(classesAttended);

      return {
        id: c.id,
        name: c.name || 'Anonymous Visitor',
        phone: c.phone,
        age: c.age,
        gender: c.gender || '—',
        area_of_stay: c.area_of_stay || '—',
        company_college: c.company_college || '—',
        current_level: levelInfo.code,
        descriptive_level_name: levelInfo.displayLabel,
        level_badge_class: levelInfo.badgeClass,
        classes_attended: classesAttended,
        chanting: typeof c.chanting === 'number' ? c.chanting : 0,
        is_approved_this_week: !!existingCheckin,
        checked_in_at: existingCheckin?.checked_in_at || null,
        approved_by_email: existingCheckin?.admin_email || null,
      };
    });
  }

  // ── BRANCH A: Partial Search (2 to 9 digits) ─────────────────────────────────
  if (digits.length < 10) {
    // Generate candidate search patterns taking +91 country prefix and 0 trunk into account
    let stripped = digits;
    if (stripped.startsWith('91') && stripped.length > 2) {
      stripped = stripped.slice(2);
    } else if (stripped.startsWith('0') && stripped.length > 1) {
      stripped = stripped.slice(1);
    }

    const candidateTerms = Array.from(new Set([digits, stripped])).filter(t => t.length >= 2);
    const orPattern = candidateTerms.map(t => `phone.ilike.%${t}%`).join(',');

    const { data: partialContacts, error: partialErr } = await supabaseAdmin
      .from('master_contacts')
      .select('id, phone, name, age, gender, area_of_stay, company_college, level, classes_attended, chanting, created_at')
      .or(orPattern)
      .order('classes_attended', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(25);

    if (partialErr) {
      console.error('[GET /api/visitor/lookup - Partial Search DB Error]:', partialErr);
      return NextResponse.json({ error: 'Database error searching contacts' }, { status: 500 });
    }

    const formatted = await formatAndAttachCheckins(partialContacts || []);

    return NextResponse.json({
      found: formatted.length > 0,
      is_partial: true,
      count: formatted.length,
      contacts: formatted,
      weekly_period: currentPeriod,
      weekly_period_label: periodLabel,
      next_reset: nextReset.toISOString(),
    });
  }

  // ── BRANCH B: Complete 10-Digit Mobile Lookup ───────────────────────────────
  const cleanPhone = normalizePhone(rawQuery);

  if (!cleanPhone || cleanPhone.length !== 10 || !/^[6-9]\d{9}$/.test(cleanPhone)) {
    return NextResponse.json(
      { error: 'Valid 10-digit Indian mobile number (starting with 6, 7, 8, or 9) is required' },
      { status: 400 }
    );
  }

  const phoneVariants = [cleanPhone, `+91${cleanPhone}`, `91${cleanPhone}`, `0${cleanPhone}`];
  const { data: exactContacts, error: contactErr } = await supabaseAdmin
    .from('master_contacts')
    .select('id, phone, name, age, gender, area_of_stay, company_college, level, classes_attended, chanting, created_at')
    .in('phone', phoneVariants)
    .order('classes_attended', { ascending: false })
    .order('created_at', { ascending: false });

  if (contactErr) {
    console.error('[GET /api/visitor/lookup - 10-Digit DB Error]:', contactErr);
    return NextResponse.json(
      { error: 'Database error searching master contact' },
      { status: 500 }
    );
  }

  // If no contact found for exact 10 digits, return required registration message
  if (!exactContacts || exactContacts.length === 0) {
    return NextResponse.json({
      found: false,
      is_partial: false,
      count: 0,
      message: 'Not Found, kindly register here',
      register_url: '/contacts-register',
      weekly_period: currentPeriod,
      weekly_period_label: periodLabel,
      next_reset: nextReset.toISOString(),
    });
  }

  const formatted = await formatAndAttachCheckins(exactContacts);

  return NextResponse.json({
    found: true,
    is_partial: false,
    count: formatted.length,
    contact: formatted[0],
    contacts: formatted,
    weekly_period: currentPeriod,
    weekly_period_label: periodLabel,
    next_reset: nextReset.toISOString(),
  });
}
