import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getOperatorSessionFromRequest } from '@/lib/operator-auth';
import { normalizePhone } from '@/lib/master-contacts';
import { getSaturdayMeetupDate } from '@/lib/weekly-period';

// Helper to authenticate active Operator or Admin
async function authenticateCaller(req: Request): Promise<{
  authorized: boolean;
  role: 'operator' | 'admin' | null;
  id?: string;
  errorResponse?: NextResponse;
}> {
  // 1. Check Operator Session
  const opSession = getOperatorSessionFromRequest(req);
  if (opSession) {
    const { data: op } = await supabaseAdmin
      .from('contact_operators')
      .select('id, is_active')
      .eq('id', opSession.operatorId)
      .single();

    if (!op || !op.is_active) {
      return {
        authorized: false,
        role: null,
        errorResponse: NextResponse.json({ error: 'Operator account disabled or invalid' }, { status: 403 }),
      };
    }

    return { authorized: true, role: 'operator', id: opSession.operatorId };
  }

  // 2. Check Admin Bearer Token
  const authHeader = req.headers.get('Authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (!error && user) {
      const { data: adminRow } = await supabaseAdmin
        .from('admins')
        .select('id')
        .eq('id', user.id)
        .single();

      if (adminRow) {
        return { authorized: true, role: 'admin', id: user.id };
      }
    }
  }

  return {
    authorized: false,
    role: null,
    errorResponse: NextResponse.json({ error: 'Unauthorized: Operator or Admin session required' }, { status: 401 }),
  };
}

/**
 * GET /api/operator/attendance-history?contact_id=...&phone=...
 *
 * Retrieves verified class attendance records for a contact.
 * Identity Matching:
 * 1. Primary: Canonical Master Contact ID (UUID)
 * 2. Fallback: Normalized Indian Mobile (10-digits)
 * Never matches by name alone.
 *
 * Source of truth: Existing Visitor Check-In table (master_contact_checkins)
 * and master_contacts.classes_attended.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateCaller(req);
  if (!auth.authorized) {
    return auth.errorResponse!;
  }

  const url = req.nextUrl;
  const rawContactId = url.searchParams.get('contact_id')?.trim() || '';
  const rawPhone = url.searchParams.get('phone')?.trim() || '';

  if (!rawContactId && !rawPhone) {
    return NextResponse.json(
      { error: 'Missing parameter: contact_id or phone is required' },
      { status: 400 }
    );
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const validContactId = uuidRegex.test(rawContactId) ? rawContactId : null;
  const cleanPhone = normalizePhone(rawPhone);

  // 1. Resolve master contact record
  let masterContact: {
    id: string;
    name: string | null;
    phone: string | null;
    classes_attended: number;
    level: string | null;
  } | null = null;

  // Primary lookup by contact UUID
  if (validContactId) {
    const { data: mc, error: mcErr } = await supabaseAdmin
      .from('master_contacts')
      .select('id, name, phone, classes_attended, level')
      .eq('id', validContactId)
      .maybeSingle();

    if (!mcErr && mc) {
      masterContact = {
        ...mc,
        classes_attended: typeof mc.classes_attended === 'number' ? mc.classes_attended : 0,
      };
    }
  }

  // Fallback lookup by normalized phone if not resolved by UUID
  const phoneToSearch = cleanPhone || (masterContact?.phone ? normalizePhone(masterContact.phone) : '');
  if (!masterContact && phoneToSearch && phoneToSearch.length === 10) {
    const { data: mcByPhone, error: mcPhoneErr } = await supabaseAdmin
      .from('master_contacts')
      .select('id, name, phone, classes_attended, level')
      .eq('phone', phoneToSearch)
      .maybeSingle();

    if (!mcPhoneErr && mcByPhone) {
      masterContact = {
        ...mcByPhone,
        classes_attended: typeof mcByPhone.classes_attended === 'number' ? mcByPhone.classes_attended : 0,
      };
    }
  }

  const resolvedContactId = masterContact?.id || validContactId;
  const resolvedPhone = phoneToSearch || (masterContact?.phone ? normalizePhone(masterContact.phone) : '');

  // 2. Fetch attendance check-in records from master_contact_checkins
  interface CheckinRow {
    id: string;
    master_contact_id: string | null;
    phone: string;
    weekly_period: string;
    checked_in_at: string;
    approved_by: string | null;
    admin_email: string | null;
  }

  let checkinRows: CheckinRow[] = [];

  if (resolvedContactId && resolvedPhone && resolvedPhone.length === 10) {
    const { data, error } = await supabaseAdmin
      .from('master_contact_checkins')
      .select('id, master_contact_id, phone, weekly_period, checked_in_at, approved_by, admin_email')
      .or(`master_contact_id.eq.${resolvedContactId},phone.eq.${resolvedPhone}`)
      .order('checked_in_at', { ascending: false });

    if (error) {
      console.error('[attendance-history] Query error:', error);
      return NextResponse.json({ error: 'Failed to fetch attendance records' }, { status: 500 });
    }
    checkinRows = (data as CheckinRow[]) || [];
  } else if (resolvedContactId) {
    const { data, error } = await supabaseAdmin
      .from('master_contact_checkins')
      .select('id, master_contact_id, phone, weekly_period, checked_in_at, approved_by, admin_email')
      .eq('master_contact_id', resolvedContactId)
      .order('checked_in_at', { ascending: false });

    if (error) {
      console.error('[attendance-history] Query error:', error);
      return NextResponse.json({ error: 'Failed to fetch attendance records' }, { status: 500 });
    }
    checkinRows = (data as CheckinRow[]) || [];
  } else if (resolvedPhone && resolvedPhone.length === 10) {
    const { data, error } = await supabaseAdmin
      .from('master_contact_checkins')
      .select('id, master_contact_id, phone, weekly_period, checked_in_at, approved_by, admin_email')
      .eq('phone', resolvedPhone)
      .order('checked_in_at', { ascending: false });

    if (error) {
      console.error('[attendance-history] Query error:', error);
      return NextResponse.json({ error: 'Failed to fetch attendance records' }, { status: 500 });
    }
    checkinRows = (data as CheckinRow[]) || [];
  }

  // Deduplicate records by ID and weekly_period
  const seenIds = new Set<string>();
  const seenPeriods = new Set<string>();
  const deduplicatedRecords: CheckinRow[] = [];

  for (const row of checkinRows) {
    if (seenIds.has(row.id)) continue;
    // Also protect against duplicate check-in entries in the same weekly period
    if (row.weekly_period && seenPeriods.has(row.weekly_period)) continue;

    seenIds.add(row.id);
    if (row.weekly_period) seenPeriods.add(row.weekly_period);
    deduplicatedRecords.push(row);
  }

  // Sort descending by checked_in_at
  deduplicatedRecords.sort((a, b) => new Date(b.checked_in_at).getTime() - new Date(a.checked_in_at).getTime());

  // Format records for display
  const formattedRecords = deduplicatedRecords.map((item) => {
    const meetup = getSaturdayMeetupDate(item.weekly_period);
    return {
      id: item.id,
      date: item.checked_in_at,
      weekly_period: item.weekly_period,
      meetup_date_str: meetup.dateStr,
      meetup_label: meetup.label,
      event_name: 'Saturday Meetup',
      status: 'Attended',
      admin_email: item.admin_email || null,
    };
  });

  const totalClassesAttended = Math.max(
    masterContact?.classes_attended ?? 0,
    formattedRecords.length
  );

  return NextResponse.json({
    success: true,
    contact: {
      id: resolvedContactId,
      name: masterContact?.name || 'Contact',
      phone: masterContact?.phone || resolvedPhone,
      classes_attended: totalClassesAttended,
    },
    records: formattedRecords,
    total_records: formattedRecords.length,
  });
}
