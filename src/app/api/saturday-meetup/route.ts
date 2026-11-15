import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { normalizePhone } from '@/lib/master-contacts';
import { normalizeAssignmentStatus, computeOperatorStats } from '@/lib/status-normalizer';
import {
  getCurrentWeeklyPeriod,
  getCurrentVisitorWeeklyPeriod,
  getNextVisitorResetTimestamp,
  formatVisitorWeeklyPeriodLabel,
} from '@/lib/weekly-period';
import { getLevelFromClassesAttended } from '@/lib/level-mapping';
import { archiveAndGetVisitorHistory } from '@/lib/visitor-history';

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
  attendance_type: 'Operator Coming + Admin Approved' | 'Admin Approved' | 'Approved Visitor';
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
  const activeVisitorPeriod = getCurrentVisitorWeeklyPeriod();
  const nextReset = getNextVisitorResetTimestamp();
  const periodLabel = formatVisitorWeeklyPeriodLabel(activeVisitorPeriod);

  type CheckinRow = {
    id: string;
    master_contact_id: string;
    phone: string;
    weekly_period: string;
    checked_in_at: string;
    approved_by: string | null;
    admin_email: string | null;
  };

  try {
    // ── High-Speed Batched Query Execution ──────────────────────────────────
    // 1. Fetch All Active Assignments across all 1000-record batches without truncation
    const fetchAllActiveAssignments = async (): Promise<Array<{
      id: string;
      master_contact_id: string;
      status: string;
      operator_id?: string;
      is_active?: boolean;
      status_weekly_period?: string | null;
      updated_at?: string | null;
      contact_operators?: { id?: string; name?: string } | null;
    }>> => {
      const pageSize = 1000;
      let fromIdx = 0;
      const allRows: Array<{
        id: string;
        master_contact_id: string;
        status: string;
        operator_id?: string;
        is_active?: boolean;
        status_weekly_period?: string | null;
        updated_at?: string | null;
        contact_operators?: { id?: string; name?: string } | null;
      }> = [];
      while (true) {
        const res = await supabaseAdmin
          .from('master_contact_assignments')
          .select('id, master_contact_id, status, operator_id, is_active, updated_at, contact_operators(id, name)')
          .eq('is_active', true)
          .range(fromIdx, fromIdx + pageSize - 1);
        if (res.error) throw res.error;
        if (!res.data || res.data.length === 0) break;
        allRows.push(...(res.data as typeof allRows));
        if (res.data.length < pageSize) break;
        fromIdx += pageSize;
      }
      return allRows;
    };

    // 2. Fetch All Approved Check-Ins for the Active Weekly Period across all 1000-record batches
    const fetchAllWeeklyCheckins = async (): Promise<CheckinRow[]> => {
      const pageSize = 1000;
      let fromIdx = 0;
      const allRows: CheckinRow[] = [];
      while (true) {
        const res = await supabaseAdmin
          .from('master_contact_checkins')
          .select('id, master_contact_id, phone, weekly_period, checked_in_at, approved_by, admin_email')
          .eq('weekly_period', activeVisitorPeriod)
          .order('checked_in_at', { ascending: false })
          .range(fromIdx, fromIdx + pageSize - 1);
        if (res.error) throw res.error;
        if (!res.data || res.data.length === 0) break;
        allRows.push(...(res.data as CheckinRow[]));
        if (res.data.length < pageSize) break;
        fromIdx += pageSize;
      }
      return allRows;
    };

    // 3. Visitor History: Archival and historical tracking
    const historyPromise = archiveAndGetVisitorHistory(currentPeriod);

    // Concurrently execute independent queries
    const [rawAssignments, rawCheckins, visitorHistory] = await Promise.all([
      fetchAllActiveAssignments(),
      fetchAllWeeklyCheckins(),
      historyPromise,
    ]);

    // ── Compute Operator Calling Statistics (Strictly Aligned with Admin Contact Operators) ──
    const callingStats = computeOperatorStats(rawAssignments, { currentWeeklyPeriod: currentPeriod });
    const assignedCallsCount = callingStats.assigned;
    const comingCount = callingStats.coming;
    const pendingCallsCount = callingStats.pending;

    // ── Deduplicate Approved Check-ins by Canonical Master Contact ID & Normalized Phone ─
    const uniqueCheckins: CheckinRow[] = [];
    const seenMasterIds = new Set<string>();
    const seenPhones = new Set<string>();

    for (const c of (rawCheckins || []) as CheckinRow[]) {
      const normPhone = normalizePhone(c.phone) || c.phone;
      const mId = c.master_contact_id ? String(c.master_contact_id) : null;

      const duplicateById = Boolean(mId && seenMasterIds.has(mId));
      const duplicateByPhone = Boolean(normPhone && seenPhones.has(normPhone));

      if (duplicateById || duplicateByPhone) {
        continue;
      }

      if (mId) seenMasterIds.add(mId);
      if (normPhone) seenPhones.add(normPhone);
      uniqueCheckins.push(c);
    }

    const visitorsCount = uniqueCheckins.length;

    // ── Map Operator Assignment Context from In-Memory Active Assignments ────
    const assignmentMap = new Map<string, {
      operator_name: string | null;
      operator_status: string | null;
      operator_bucket: string | null;
      status_period: string | null;
    }>();

    for (const a of rawAssignments) {
      if (!a.master_contact_id) continue;
      const opName = (a.contact_operators as { name?: string } | null)?.name || null;
      const opBucket = normalizeAssignmentStatus(a.status);
      const statusPeriod =
        ((a as unknown as Record<string, unknown>).status_weekly_period as string | undefined) ||
        (a.updated_at ? getCurrentWeeklyPeriod(new Date(a.updated_at as string)) : null);

      assignmentMap.set(String(a.master_contact_id), {
        operator_name: opName,
        operator_status: a.status || null,
        operator_bucket: opBucket,
        status_period: statusPeriod,
      });
    }

    // ── Fetch Details for Verified Attendees ─────────────────────────────────
    const contactIds = Array.from(
      new Set(uniqueCheckins.map((c) => c.master_contact_id).filter(Boolean))
    );

    const masterContactMap = new Map<string, {
      id: string;
      phone: string;
      name: string | null;
      gender: string | null;
      classes_attended: number;
      chanting: number;
      level: string | null;
    }>();

    if (contactIds.length > 0) {
      // Chunk contact details queries safely in batches of 200
      const CHUNK_SIZE = 200;
      const contactChunkPromises = [];

      for (let i = 0; i < contactIds.length; i += CHUNK_SIZE) {
        const chunk = contactIds.slice(i, i + CHUNK_SIZE);
        contactChunkPromises.push(
          supabaseAdmin
            .from('master_contacts')
            .select('id, phone, name, gender, classes_attended, chanting, level')
            .in('id', chunk)
        );
      }

      const contactChunks = await Promise.all(contactChunkPromises);

      for (const res of contactChunks) {
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
    }

    // ── Build Attendance Roster (Strictly matches Visitors count) ────────────
    const attendanceList: SaturdayAttendanceItem[] = [];

    for (const checkin of uniqueCheckins) {
      const contact = masterContactMap.get(checkin.master_contact_id);
      const assignment = assignmentMap.get(checkin.master_contact_id);
      const classesAttended = contact?.classes_attended ?? 1;
      const levelInfo = getLevelFromClassesAttended(classesAttended);

      const isCurrentWeekStatus = assignment?.status_period === currentPeriod;
      const isOperatorComing = assignment?.operator_bucket === 'coming' && isCurrentWeekStatus;

      let attType: SaturdayAttendanceItem['attendance_type'] = 'Approved Visitor';
      if (assignment) {
        if (isOperatorComing) {
          attType = 'Operator Coming + Admin Approved';
        } else {
          attType = 'Admin Approved';
        }
      }

      attendanceList.push({
        id: contact?.id || checkin.master_contact_id,
        name: contact?.name || 'Visitor',
        phone: checkin.phone,
        gender: contact?.gender || '—',
        level: levelInfo.displayLabel,
        level_badge_class: levelInfo.badgeClass,
        classes_attended: classesAttended,
        chanting: contact?.chanting ?? 0,
        attendance_type: attType,
        operator_name: assignment?.operator_name || null,
        operator_status: assignment?.operator_status || null,
        admin_approved: true,
        checked_in_at: checkin.checked_in_at,
        approved_by_email: checkin.admin_email,
      });
    }

    // Sort attendance roster: Most recent check-in first, then name alphabetical
    attendanceList.sort((a, b) => {
      if (a.checked_in_at && b.checked_in_at) {
        return new Date(b.checked_in_at).getTime() - new Date(a.checked_in_at).getTime();
      }
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({
      metrics: {
        assigned_calls: assignedCallsCount,
        coming: comingCount,
        pending_calls: pendingCallsCount,
        visitors: visitorsCount,
        total_attendance: visitorsCount,
      },
      attendance: attendanceList,
      weekly_period: activeVisitorPeriod,
      weekly_period_label: periodLabel,
      next_reset: nextReset.toISOString(),
      visitor_history: visitorHistory,
    });
  } catch (err: unknown) {
    console.error('[Saturday Meet-up] GET Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load meet-up data' },
      { status: 500 }
    );
  }
}
