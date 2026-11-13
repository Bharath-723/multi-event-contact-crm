import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { normalizePhone } from '@/lib/master-contacts';
import { normalizeAssignmentStatus } from '@/lib/status-normalizer';
import { getCurrentWeeklyPeriod, getNextResetTimestamp, formatWeeklyPeriodLabel } from '@/lib/weekly-period';
import { getLevelFromClassesAttended } from '@/lib/level-mapping';
import { archiveAndGetVisitorHistory, SaturdayVisitorHistoryItem } from '@/lib/visitor-history';

// Require Admin Helper
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

export interface SaturdayAttendanceItem {
  id: string;
  name: string;
  phone: string;
  gender: string;
  level: string;
  level_badge_class: string;
  classes_attended: number;
  chanting: number;
  attendance_type: 'Operator Coming + Admin Approved' | 'Operator Coming' | 'Admin Approved' | 'Approved Visitor';
  operator_name: string | null;
  operator_status: string | null;
  admin_approved: boolean;
  checked_in_at: string | null;
  approved_by_email: string | null;
}

export async function GET(req: NextRequest) {
  const { error: authError } = await requireAdmin(req);
  if (authError) return authError;

  const currentPeriod = getCurrentWeeklyPeriod();
  const nextReset = getNextResetTimestamp();
  const periodLabel = formatWeeklyPeriodLabel(currentPeriod);

  try {
    // Helper to fetch all active assignments across all 1000-record batches without truncation
    const fetchAllActiveAssignments = async (): Promise<any[]> => {
      const pageSize = 1000;
      let fromIdx = 0;
      const allRows: any[] = [];
      let isFallback = false;

      while (true) {
        const q = (supabaseAdmin.from('master_contact_assignments') as any)
          .select(
            isFallback
              ? 'id, master_contact_id, status, operator_id, is_active, updated_at, contact_operators(id, name)'
              : 'id, master_contact_id, status, operator_id, is_active, status_weekly_period, updated_at, contact_operators(id, name)'
          )
          .eq('is_active', true)
          .range(fromIdx, fromIdx + pageSize - 1);

        const res = await q;
        if (res.error) {
          if (!isFallback && (res.error.code === '42703' || res.error.message?.includes('status_weekly_period'))) {
            isFallback = true;
            fromIdx = 0;
            allRows.length = 0;
            continue;
          }
          throw res.error;
        }

        if (!res.data || res.data.length === 0) break;
        allRows.push(...res.data);
        if (res.data.length < pageSize) break;
        fromIdx += pageSize;
      }
      return allRows;
    };

    // Helper to fetch all weekly checkins across all 1000-record batches without truncation
    const fetchAllWeeklyCheckins = async (): Promise<any[]> => {
      const pageSize = 1000;
      let fromIdx = 0;
      const allRows: any[] = [];

      while (true) {
        const res = await (supabaseAdmin.from('master_contact_checkins') as any)
          .select('id, master_contact_id, phone, weekly_period, checked_in_at, approved_by, admin_email')
          .eq('weekly_period', currentPeriod)
          .range(fromIdx, fromIdx + pageSize - 1);

        if (res.error) throw res.error;
        if (!res.data || res.data.length === 0) break;
        allRows.push(...res.data);
        if (res.data.length < pageSize) break;
        fromIdx += pageSize;
      }
      return allRows;
    };

    // 1, 2 & 3. Concurrently fetch active assignments, approved check-ins, and archive/fetch visitor history
    const [activeAssignments, approvedCheckins, visitorHistory]: [any[], any[], any] = await Promise.all([
      fetchAllActiveAssignments(),
      fetchAllWeeklyCheckins(),
      archiveAndGetVisitorHistory(currentPeriod),
    ]);

    // 3. Collect all master contact IDs that need details
    const targetContactIds = new Set<string>();
    activeAssignments.forEach((a) => {
      if (a.master_contact_id) targetContactIds.add(String(a.master_contact_id));
    });
    approvedCheckins.forEach((c) => {
      if (c.master_contact_id) targetContactIds.add(String(c.master_contact_id));
    });

    const contactIdsArray = Array.from(targetContactIds);
    const masterContactMap = new Map<string, {
      id: string;
      phone: string;
      name: string | null;
      gender: string | null;
      classes_attended: number;
      chanting: number;
      level: string | null;
    }>();

    // Concurrently fetch master contact details in safe chunks of 200
    const chunkPromises = [];
    const CHUNK_SIZE = 200;
    for (let i = 0; i < contactIdsArray.length; i += CHUNK_SIZE) {
      const chunk = contactIdsArray.slice(i, i + CHUNK_SIZE);
      chunkPromises.push(
        supabaseAdmin
          .from('master_contacts')
          .select('id, phone, name, gender, classes_attended, chanting, level')
          .in('id', chunk)
      );
    }

    const chunkResults = await Promise.all(chunkPromises);
    for (const res of chunkResults) {
      (res.data || []).forEach((c) => {
        masterContactMap.set(c.id, {
          id: c.id,
          phone: c.phone,
          name: c.name,
          gender: c.gender,
          classes_attended: typeof c.classes_attended === 'number' ? c.classes_attended : 0,
          chanting: typeof c.chanting === 'number' ? c.chanting : 0,
          level: c.level,
        });
      });
    }

    // 4. Group data by normalized phone number (Identity Key)
    // Structure for deduplication:
    type ContactPerson = {
      id: string;
      name: string;
      phone: string;
      gender: string;
      classes_attended: number;
      chanting: number;
      level: string | null;
      is_assigned: boolean;
      operator_name: string | null;
      operator_status: string | null;
      operator_bucket: string | null;
      status_period: string | null;
      is_admin_approved: boolean;
      checked_in_at: string | null;
      approved_by_email: string | null;
    };

    const personByNormPhone = new Map<string, ContactPerson>();

    // Process assignments
    (activeAssignments || []).forEach((a) => {
      const contact = masterContactMap.get(a.master_contact_id);
      if (!contact) return;

      const normPhone = normalizePhone(contact.phone);
      if (!normPhone) return;

      const opName = (a.contact_operators as unknown as { name: string } | null)?.name || null;
      const opBucket = normalizeAssignmentStatus(a.status);
      const statusPeriod =
        ((a as unknown as Record<string, unknown>).status_weekly_period as string | undefined) ||
        (a.updated_at ? getCurrentWeeklyPeriod(new Date(a.updated_at as string)) : null);

      personByNormPhone.set(normPhone, {
        id: contact.id,
        name: contact.name || 'Anonymous Contact',
        phone: contact.phone,
        gender: contact.gender || '—',
        classes_attended: contact.classes_attended,
        chanting: contact.chanting,
        level: contact.level,
        is_assigned: true,
        operator_name: opName,
        operator_status: a.status || 'assigned',
        operator_bucket: opBucket,
        status_period: statusPeriod,
        is_admin_approved: false,
        checked_in_at: null,
        approved_by_email: null,
      });
    });

    // Process approved check-ins
    (approvedCheckins || []).forEach((c) => {
      const normPhone = normalizePhone(c.phone);
      if (!normPhone) return;

      const contact = masterContactMap.get(c.master_contact_id);
      const existing = personByNormPhone.get(normPhone);

      if (existing) {
        existing.is_admin_approved = true;
        existing.checked_in_at = c.checked_in_at;
        existing.approved_by_email = c.admin_email;
      } else {
        // Walk-in or unassigned visitor check-in
        personByNormPhone.set(normPhone, {
          id: contact?.id || c.master_contact_id,
          name: contact?.name || 'Visitor',
          phone: c.phone,
          gender: contact?.gender || '—',
          classes_attended: contact?.classes_attended ?? 1,
          chanting: contact?.chanting ?? 0,
          level: contact?.level || null,
          is_assigned: false,
          operator_name: null,
          operator_status: null,
          operator_bucket: null,
          status_period: null,
          is_admin_approved: true,
          checked_in_at: c.checked_in_at,
          approved_by_email: c.admin_email,
        });
      }
    });

    // 5. Compute Mutually Exclusive Categories:
    // - Assigned Calls: number of unique contacts currently assigned to operators (PERMANENTLY RETAINED)
    // - Coming: assigned contacts marked coming in current week, plus explicitly admin-approved contacts (RESETS ON FRIDAY)
    // - Pending Calls: assigned contacts explicitly pending response in current week (RESETS ON FRIDAY)
    // - Visitors: approved walk-in check-ins in current week (RESETS ON FRIDAY, PREVIOUS WEEK ARCHIVED)
    let assignedCallsCount = 0;
    let comingCount = 0;
    let pendingCallsCount = 0;
    let visitorsCount = 0;

    const attendanceList: SaturdayAttendanceItem[] = [];

    for (const person of personByNormPhone.values()) {
      const levelInfo = getLevelFromClassesAttended(person.classes_attended);

      if (person.is_assigned) {
        // Assigned Calls is permanently preserved across weekly rollovers
        assignedCallsCount++;

        const isCurrentWeekStatus = person.status_period === currentPeriod;
        const isOperatorComing = person.operator_bucket === 'coming' && isCurrentWeekStatus;
        const isApproved = person.is_admin_approved;

        if (isOperatorComing || isApproved) {
          comingCount++;

          let attType: SaturdayAttendanceItem['attendance_type'] = 'Operator Coming';
          if (isOperatorComing && isApproved) {
            attType = 'Operator Coming + Admin Approved';
          } else if (isApproved) {
            attType = 'Admin Approved';
          }

          attendanceList.push({
            id: person.id,
            name: person.name,
            phone: person.phone,
            gender: person.gender,
            level: levelInfo.displayLabel,
            level_badge_class: levelInfo.badgeClass,
            classes_attended: person.classes_attended,
            chanting: person.chanting,
            attendance_type: attType,
            operator_name: person.operator_name,
            operator_status: person.operator_status,
            admin_approved: person.is_admin_approved,
            checked_in_at: person.checked_in_at,
            approved_by_email: person.approved_by_email,
          });
        } else if (person.operator_bucket === 'pending' && isCurrentWeekStatus) {
          pendingCallsCount++;
        }
        // Completed calls (notComing, nextWeek, notAnswered) that are not approved are accounted for in Assigned Calls
      } else if (person.is_admin_approved) {
        // Walk-in / unassigned approved visitor in current week
        visitorsCount++;

        attendanceList.push({
          id: person.id,
          name: person.name,
          phone: person.phone,
          gender: person.gender,
          level: levelInfo.displayLabel,
          level_badge_class: levelInfo.badgeClass,
          classes_attended: person.classes_attended,
          chanting: person.chanting,
          attendance_type: 'Approved Visitor',
          operator_name: null,
          operator_status: null,
          admin_approved: true,
          checked_in_at: person.checked_in_at,
          approved_by_email: person.approved_by_email,
        });
      }
    }

    // Sort attendance table: Admin checked-in first, then alphabetical by name
    attendanceList.sort((a, b) => {
      if (a.checked_in_at && !b.checked_in_at) return -1;
      if (!a.checked_in_at && b.checked_in_at) return 1;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({
      metrics: {
        assigned_calls: assignedCallsCount,
        coming: comingCount,
        pending_calls: pendingCallsCount,
        visitors: visitorsCount,
        total_attendance: comingCount + visitorsCount,
      },
      weekly_period: currentPeriod,
      weekly_period_label: periodLabel,
      next_reset: nextReset.toISOString(),
      attendance: attendanceList,
      visitor_history: visitorHistory,
    });
  } catch (err: unknown) {
    console.error('[GET /api/saturday-meetup] Server exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
