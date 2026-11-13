/**
 * POST /api/assignments/auto
 *
 * Phase 3B — Batch Auto-Assignment Engine V2 (7-Filter & Selected-Operator Aware)
 *
 * Modes:
 *   dry_run=true  → Returns an authoritative summary (unassigned, eligible, skipped, capacity, filter options, operator breakdown) WITHOUT assigning.
 *   dry_run=false → Revalidates DB state and executes assignment dynamically via atomic RPC assign_contact_atomic.
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { MAX_CONTACTS_PER_OPERATOR } from '@/lib/assignment-engine';
import { formatOperatorDisplayName } from '@/lib/status-normalizer';

// ─── Concurrency Lock ─────────────────────────────────────────────────────────
let isBatchRunning = false;

// ─── Admin Auth Guard ─────────────────────────────────────────────────────────
async function requireAdmin(
  req: Request
): Promise<{ error: NextResponse | null; userId?: string }> {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const { data: adminRow } = await supabaseAdmin
    .from('admins')
    .select('id')
    .eq('id', user.id)
    .single();
  if (!adminRow) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };

  return { error: null, userId: user.id };
}

// ─── Helper Utilities for Filter Evaluation ──────────────────────────────────
import {
  isFilterActive,
  parseFilterValues,
  mapLevelCodeToNumber,
  matchesClassesAttended,
  matchesLevelNumber,
  matchesChanting,
  isFemale,
  isGenderEligible,
  normalizeOccupationCategory,
  parseToYMD,
} from '@/lib/auto-assign-filter-helpers';

export {
  isFilterActive,
  parseFilterValues,
  mapLevelCodeToNumber,
  matchesClassesAttended,
  matchesLevelNumber,
  matchesChanting,
};

// Helper: Fetch all rows for any table using 1000-row pagination loop
async function fetchAllRowsFromTable(tableName: string): Promise<Array<Record<string, unknown>>> {
  let allRows: Array<Record<string, unknown>> = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from(tableName)
      .select('*')
      .order('created_at', { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw new Error(`Failed to fetch ${tableName}: ${error.message}`);
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data as Array<Record<string, unknown>>);
    if (data.length < pageSize) break;
    page++;
  }
  return allRows;
}

// ─── GET /api/assignments/auto (status check) ────────────────────────────────
export async function GET(req: Request) {
  const { error: authError } = await requireAdmin(req);
  if (authError) return authError;

  return NextResponse.json({ is_running: isBatchRunning });
}

// ─── POST /api/assignments/auto ───────────────────────────────────────────────
export async function POST(req: Request) {
  const { error: authError, userId } = await requireAdmin(req);
  if (authError) return authError;

  let body: {
    dry_run?: boolean;
    source?: string;
    area_of_stay?: string;
    areas?: string[];
    company_college?: string;
    colleges?: string[];
    occupation?: string;
    occupations?: string[];
    standard?: string;
    standards?: string[];
    service_id?: string;
    services?: string[];
    service_ids?: string[];
    date?: string;
    dates?: string[];
    volunteer?: string;
    volunteers?: string[];
    selected_operator_ids?: string[];
    reassign?: boolean;
    rebalance?: boolean;
    classes_attended?: string | number | string[];
    level_number?: string | number;
    level_numbers?: (string | number)[];
    chanting?: string | number | string[];
  } = {};

  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const isDryRun = body.dry_run !== false;
  // Master Dashboard is the only active source for operator assignments
  const source = 'master_dashboard';
  const isFeedback = false;
  const isMaster = true;
  const isKrishnashtami = false;

  // 10 Filters (parsed as validated string arrays for multi-selection)
  const filterAreas = parseFilterValues(body.areas ?? body.area_of_stay);
  const filterColleges = parseFilterValues(body.colleges ?? body.company_college);
  const filterOccupations = parseFilterValues(body.occupations ?? body.occupation);
  const filterStandards = parseFilterValues(body.standards ?? body.standard);
  const filterServiceIds = parseFilterValues(body.service_ids ?? body.services ?? body.service_id);
  const filterDates = parseFilterValues(body.dates ?? body.date);
  const filterVolunteers = parseFilterValues(body.volunteers ?? body.volunteer);
  const filterClassesAttended = parseFilterValues(body.classes_attended);
  const filterLevelNumbers = parseFilterValues(body.level_numbers ?? body.level_number);
  const filterChanting = parseFilterValues(body.chanting);

  const selectedOpIds = Array.isArray(body.selected_operator_ids)
    ? body.selected_operator_ids.filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
    : [];

  const targetRegTable = 'master_contacts';
  const assignTable = 'master_contact_assignments';
  const fkCol = 'master_contact_id';

  // ── 1. Fetch active operators ────────────────────────────────────────────────
  let { data: operators, error: opsError } = await supabaseAdmin
    .from('contact_operators')
    .select('id, name, is_active, operator_type, capacity')
    .eq('is_active', true)
    .eq('operator_type', 'operator')
    .order('created_at', { ascending: true });

  // Graceful fallback if 'capacity' column does not exist yet (error 42703)
  if (opsError && (opsError.code === '42703' || opsError.message?.includes('capacity'))) {
    const fallback = await supabaseAdmin
      .from('contact_operators')
      .select('id, name, is_active, operator_type')
      .eq('is_active', true)
      .eq('operator_type', 'operator')
      .order('created_at', { ascending: true });
    operators = (fallback.data ?? []).map((op) => ({
      ...op,
      capacity: MAX_CONTACTS_PER_OPERATOR,
    })) as typeof operators;
    opsError = fallback.error;
  }

  if (opsError) {
    return NextResponse.json({ error: 'Failed to fetch operators: ' + opsError.message }, { status: 500 });
  }

  const activeOperators = operators ?? [];

  // ── 2. Fetch current active assignment counts per operator for this source ──
  const { data: assignmentCounts, error: countError } = await supabaseAdmin
    .from(assignTable)
    .select('operator_id')
    .eq('is_active', true);

  if (countError) {
    return NextResponse.json({ error: 'Failed to fetch assignment counts: ' + countError.message }, { status: 500 });
  }

  const countMap: Record<string, number> = {};
  for (const row of (assignmentCounts ?? []) as Array<Record<string, unknown>>) {
    const opId = String(row.operator_id || '');
    if (opId) {
      countMap[opId] = (countMap[opId] ?? 0) + 1;
    }
  }

  // ── 3. Fetch all registrations for target table using pagination ───────────
  let allRegs: Array<Record<string, unknown>> = [];
  try {
    allRegs = await fetchAllRowsFromTable(targetRegTable);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }

  // If Master Dashboard, fetch master_contact_events for event-specific filter evaluation
  const masterEventsMap = new Map<string, Array<Record<string, unknown>>>();
  if (isMaster) {
    try {
      const allEvents = await fetchAllRowsFromTable('master_contact_events');
      for (const e of allEvents) {
        const mcId = String(e.master_contact_id || '');
        if (mcId) {
          if (!masterEventsMap.has(mcId)) masterEventsMap.set(mcId, []);
          masterEventsMap.get(mcId)!.push(e);
        }
      }
    } catch (err) {
      console.warn('[auto-assign] Warning fetching master_contact_events:', err);
    }
  }

  // Get currently assigned contact IDs from assignTable (only active assignments count as assigned)
  const { data: assignedRows } = await supabaseAdmin
    .from(assignTable)
    .select(fkCol)
    .eq('is_active', true);

  const assignedSet = new Set(((assignedRows ?? []) as Array<Record<string, unknown>>).map((r) => String(r[fkCol])));

  // ── Fetch all permanently excluded Not Interested contacts from ALL sources ──
  const notInterestedSet = new Set<string>();

  // 1. From master_contacts column flag
  for (const reg of allRegs) {
    if (reg.is_not_interested === true) {
      notInterestedSet.add(String(reg.id));
    }
  }

  // 2. From master_contact_assignments (canonical status)
  const { data: mcNiRows } = await supabaseAdmin
    .from('master_contact_assignments')
    .select('master_contact_id, status');
  for (const row of (mcNiRows ?? []) as Array<Record<string, unknown>>) {
    const s = String(row.status || '').toLowerCase().trim();
    if (s === 'not interested' || s === 'not_interested') {
      if (row.master_contact_id) notInterestedSet.add(String(row.master_contact_id));
    }
  }

  // 3. From other source assignment tables linked via master_contact_events (canonical status)
  const [caRes, kcaRes, fcaRes] = await Promise.allSettled([
    supabaseAdmin.from('contact_assignments').select('registration_id, status'),
    supabaseAdmin.from('krishnashtami_contact_assignments').select('registration_id, status'),
    supabaseAdmin.from('feedback_contact_assignments').select('feedback_contact_id, status'),
  ]);

  const niEventRecordIds = new Set<string>();

  if (caRes.status === 'fulfilled' && caRes.value.data) {
    for (const row of caRes.value.data) {
      const s = String(row.status || '').toLowerCase().trim();
      if (s === 'not interested' || s === 'not_interested') {
        if (row.registration_id) niEventRecordIds.add(String(row.registration_id));
      }
    }
  }

  if (kcaRes.status === 'fulfilled' && kcaRes.value.data) {
    for (const row of kcaRes.value.data) {
      const s = String(row.status || '').toLowerCase().trim();
      if (s === 'not interested' || s === 'not_interested') {
        if (row.registration_id) niEventRecordIds.add(String(row.registration_id));
      }
    }
  }

  if (fcaRes.status === 'fulfilled' && fcaRes.value.data) {
    for (const row of fcaRes.value.data) {
      const s = String(row.status || '').toLowerCase().trim();
      if (s === 'not interested' || s === 'not_interested') {
        if (row.feedback_contact_id) niEventRecordIds.add(String(row.feedback_contact_id));
      }
    }
  }

  if (niEventRecordIds.size > 0) {
    masterEventsMap.forEach((events, masterContactId) => {
      if (events.some((e) => niEventRecordIds.has(String(e.event_record_id)))) {
        notInterestedSet.add(masterContactId);
      }
    });
  }

  // ── 4. Filter unassigned registrations using 7-Filter AND-Semantics Pipeline ──
  const unassignedBeforeFilter = allRegs.filter((r) => !assignedSet.has(String(r.id)));

  const unassigned = unassignedBeforeFilter.filter((r) => {
    // 1. Area of Stay (OR across selected areas)
    if (filterAreas.length > 0) {
      const candArea = isFeedback ? r.current_stay : r.area_of_stay;
      if (!candArea) return false;
      const candAreaNorm = String(candArea).trim().toLowerCase();
      const matchesAny = filterAreas.some((fa) => fa.trim().toLowerCase() === candAreaNorm);
      if (!matchesAny) return false;
    }

    // 2. College / Company (OR across selected colleges)
    if (filterColleges.length > 0) {
      const candCollege = isFeedback ? r.college_name : r.company_college;
      if (!candCollege) return false;
      const candColNorm = String(candCollege).trim().toLowerCase();
      const matchesAny = filterColleges.some((fc) => fc.trim().toLowerCase() === candColNorm);
      if (!matchesAny) return false;
    }

    // 3. Occupation (OR across selected occupations)
    if (filterOccupations.length > 0) {
      let candOcc = isFeedback ? r.branch : r.occupation;
      if (isMaster) {
        const events = masterEventsMap.get(String(r.id)) || [];
        candOcc = events.map((e) => e.occupation).find(Boolean) || candOcc;
      }
      const candNorm = normalizeOccupationCategory(candOcc) || String(candOcc || '').trim().toLowerCase();
      const matchesAny = filterOccupations.some((fo) => {
        const targetNorm = normalizeOccupationCategory(fo) || String(fo).trim().toLowerCase();
        return candNorm === targetNorm;
      });
      if (!matchesAny) return false;
    }

    // 4. Standard (Krishnashtami & Master Dashboard, OR across selected standards)
    if (filterStandards.length > 0 && (isKrishnashtami || isMaster)) {
      let candStd = r.standard;
      if (isMaster) {
        const events = masterEventsMap.get(String(r.id)) || [];
        candStd = events.map((e) => e.standard).find(Boolean) || candStd;
      }
      if (!candStd) return false;
      const candStdNorm = String(candStd).trim().toLowerCase();
      const matchesAny = filterStandards.some((fs) => fs.trim().toLowerCase() === candStdNorm);
      if (!matchesAny) return false;
    }

    // 5. Service ID (Rathayatra, Krishnashtami, Master Dashboard, OR across selected services)
    if (filterServiceIds.length > 0 && !isFeedback) {
      let candService = r.service_id;
      if (isMaster) {
        const events = masterEventsMap.get(String(r.id)) || [];
        candService = events.map((e) => e.service_id).find(Boolean) || candService;
      }
      if (!candService) return false;
      const candServiceNorm = String(candService).trim();
      const matchesAny = filterServiceIds.some((fid) => fid.trim() === candServiceNorm);
      if (!matchesAny) return false;
    }

    // 6. Date (YYYY-MM-DD comparison, OR across selected dates)
    if (filterDates.length > 0) {
      const candDate = r.created_at || r.latest_registration_at;
      const candYMD = parseToYMD(candDate);
      if (!candYMD) return false;
      const matchesAny = filterDates.some((fd) => {
        const targetYMD = parseToYMD(fd);
        return targetYMD === candYMD;
      });
      if (!matchesAny) return false;
    }

    // 7. Volunteer Interest (OR across selected volunteer options)
    if (filterVolunteers.length > 0) {
      let isVolBool = false;
      if (isFeedback) {
        isVolBool = Boolean(r.interested_online_workshop || r.interested_online_work);
      } else {
        let isVol = r.interested_to_volunteer;
        if (isMaster) {
          const events = masterEventsMap.get(String(r.id)) || [];
          const volVal = events.map((e) => e.interested_to_volunteer).find((v) => v !== undefined && v !== null);
          if (volVal !== undefined) isVol = volVal === 'Yes' || volVal === true;
        }
        isVolBool = isVol === true || isVol === 'Yes';
      }

      const matchesAny = filterVolunteers.some((fv) => {
        const targetVol = String(fv).trim().toLowerCase();
        const wantVol = targetVol === 'volunteer' || targetVol === 'yes' || targetVol === 'true';
        const wantNonVol = targetVol === 'non-volunteer' || targetVol === 'no' || targetVol === 'false';
        if (wantVol && isVolBool) return true;
        if (wantNonVol && !isVolBool) return true;
        return false;
      });
      if (!matchesAny) return false;
    }

    // 8. No. of Classes Attended (Authoritative field: classes_attended, OR across selected ranges)
    if (filterClassesAttended.length > 0) {
      const matchesAny = filterClassesAttended.some((fc) => matchesClassesAttended(r.classes_attended, fc));
      if (!matchesAny) return false;
    }

    // 9. Level Number (Authoritative field: level mapped to 0..4, OR across selected levels)
    if (filterLevelNumbers.length > 0) {
      const matchesAny = filterLevelNumbers.some((fl) => matchesLevelNumber(r.level, fl));
      if (!matchesAny) return false;
    }

    // 10. Chanting Count (Authoritative field: chanting, OR across selected ranges)
    if (filterChanting.length > 0) {
      const matchesAny = filterChanting.some((fch) => matchesChanting(r.chanting, fch));
      if (!matchesAny) return false;
    }

    return true;
  });

  // ── 5. Extract Filter Options dynamically from source records ──────────────
  const areasSet = new Set<string>();
  const collegesSet = new Set<string>();
  const occupationsSet = new Set<string>(['Student', 'Employee', 'Working', 'Business', 'Others']);
  const standardsSet = new Set<string>(['1st Year', '2nd Year', '3rd Year', '4th Year']);
  const datesSet = new Set<string>();

  allRegs.forEach((r) => {
    const area = isFeedback ? r.current_stay : r.area_of_stay;
    if (area && String(area).trim()) areasSet.add(String(area).trim());

    const col = isFeedback ? r.college_name : r.company_college;
    if (col && String(col).trim()) collegesSet.add(String(col).trim());

    const occ = isFeedback ? r.branch : r.occupation;
    if (occ && String(occ).trim()) {
      const norm = normalizeOccupationCategory(occ) || String(occ).trim();
      occupationsSet.add(norm);
    }

    if (r.standard && String(r.standard).trim()) {
      standardsSet.add(String(r.standard).trim());
    }

    const dVal = r.created_at || r.latest_registration_at;
    const ymd = parseToYMD(dVal);
    if (ymd) datesSet.add(ymd);
  });

  if (isMaster) {
    masterEventsMap.forEach((events) => {
      events.forEach((e) => {
        if (e.occupation && String(e.occupation).trim()) {
          const norm = normalizeOccupationCategory(e.occupation) || String(e.occupation).trim();
          occupationsSet.add(norm);
        }
        if (e.standard && String(e.standard).trim()) {
          standardsSet.add(String(e.standard).trim());
        }
        const ymd = parseToYMD(e.event_date);
        if (ymd) datesSet.add(ymd);
      });
    });
  }

  const { data: servicesData } = await supabaseAdmin
    .from('services')
    .select('id, name')
    .order('name', { ascending: true });

  const filterOptions = {
    areas: Array.from(areasSet).sort((a, b) => a.localeCompare(b)),
    colleges: Array.from(collegesSet).sort((a, b) => a.localeCompare(b)),
    occupations: Array.from(occupationsSet),
    standards: Array.from(standardsSet),
    services: (servicesData || []).map((s) => ({ id: String(s.id), name: String(s.name) })),
    dates: Array.from(datesSet).sort(),
    volunteers: ['Volunteer', 'Non-Volunteer'],
    classes_attended_options: ['All', '0', '1-10', '11-20', '21+'],
    level_number_options: [
      { label: 'All Levels', value: '' },
      { label: 'Level 0 (level-0)', value: '0' },
      { label: 'Level 1 (level-1)', value: '1' },
      { label: 'Level 2 (level-2)', value: '2' },
      { label: 'Level 3 (level-3)', value: '3' },
      { label: 'Level 4 (level-4)', value: '4' },
    ],
    chanting_options: [
      { label: 'All Chanting Counts', value: '' },
      { label: '0 rounds', value: '0' },
      { label: '1+ rounds', value: '1+' },
      { label: '4+ rounds', value: '4+' },
      { label: '8+ rounds', value: '8+' },
      { label: '16+ rounds', value: '16+' },
    ],
  };

  // ── 6. Capacity & Eligibility Calculations ─────────────────────────────────
  const hasSelectedOps = selectedOpIds.length > 0;
  const selectedSet = new Set(selectedOpIds);

  const operatorSummaries = activeOperators.map((op) => {
    const current = countMap[op.id] ?? 0;
    const rawCapacity = (op as { capacity?: number }).capacity ?? MAX_CONTACTS_PER_OPERATOR;
    const isValidCap = typeof rawCapacity === 'number' && Number.isInteger(rawCapacity) && rawCapacity >= 1 && rawCapacity <= 500;
    const opCapacity = isValidCap ? rawCapacity : 0;
    const available = isValidCap ? Math.max(0, opCapacity - current) : 0;
    const isSelected = hasSelectedOps ? selectedSet.has(op.id) : false;
    const isFull = !isValidCap || current >= opCapacity;
    return {
      id: op.id,
      name: formatOperatorDisplayName(op.name),
      current,
      capacity: opCapacity,
      available,
      is_selected: isSelected,
      is_full: isFull,
      can_receive: isValidCap && !isFull && (hasSelectedOps ? isSelected : true),
      is_invalid_capacity: !isValidCap,
    };
  });

  const targetOperators = hasSelectedOps
    ? operatorSummaries.filter((op) => selectedSet.has(op.id))
    : operatorSummaries;

  const availableSlots = targetOperators.reduce((acc, op) => acc + op.available, 0);

  // ── Mutually Exclusive Classification ────────────────────────────────────
  // Equation: Unassigned = Eligible (Male) + Skipped (Female) + Not Interested
  // Mutually exclusive: Not Interested female contacts counted ONLY under Not Interested, not Skipped Female.
  // Not Interested contacts are NEVER counted in Eligible Male or Available Slots.
  let notInterestedCount = 0;
  let skippedFemaleCount = 0;
  let skippedUnknownGenderCount = 0;
  let eligibleCount = 0;

  for (const r of unassigned) {
    if (notInterestedSet.has(String(r.id))) {
      notInterestedCount++;
    } else if (isFemale(r.gender)) {
      skippedFemaleCount++;
    } else if (!isGenderEligible(r.gender)) {
      skippedUnknownGenderCount++;
      // Counted with skipped female / ineligible so partition reconciles exactly
      skippedFemaleCount++;
    } else {
      eligibleCount++;
    }
  }

  const willAssign = Math.min(eligibleCount, Math.max(0, availableSlots));
  const willSkipCapacity = Math.max(0, eligibleCount - availableSlots);

  const dryRunSummary = {
    source,
    total_unassigned: unassigned.length,
    unfiltered_unassigned: unassignedBeforeFilter.length,
    filtered_candidates: unassigned.length,
    eligible_male: eligibleCount,
    eligible_candidates: eligibleCount,
    skipped_female: skippedFemaleCount,
    not_interested: notInterestedCount,
    skipped_unknown_gender: skippedUnknownGenderCount,
    active_operators: targetOperators.length,
    available_slots: availableSlots,
    will_assign: willAssign,
    will_skip_capacity: willSkipCapacity,
    reconciliation_verified: unassigned.length === (eligibleCount + skippedFemaleCount + notInterestedCount),
    operator_breakdown: operatorSummaries,
    filter_options: filterOptions,
    filters: {
      areas: filterAreas,
      colleges: filterColleges,
      occupations: filterOccupations,
      standards: filterStandards,
      service_ids: filterServiceIds,
      dates: filterDates,
      volunteers: filterVolunteers,
      classes_attended: filterClassesAttended,
      level_numbers: filterLevelNumbers,
      chanting: filterChanting,
    },
  };

  if (isDryRun) {
    return NextResponse.json({ dry_run: true, summary: dryRunSummary });
  }

  if (isBatchRunning) {
    return NextResponse.json({ error: 'Batch assignment already in progress.' }, { status: 409 });
  }

  isBatchRunning = true;

  const allowReassign = body.reassign === true || body.rebalance === true;

  let assigned = 0;
  let skippedNotInterested = 0;
  let skippedFemale = 0;
  let skippedUnknownGender = 0;
  let skippedCapacity = 0;
  let skippedAlreadyAssigned = 0;
  let failed = 0;
  const distribution: Record<string, { name: string; assigned_in_batch: number }> = {};

  const liveCountMap: Record<string, number> = {};
  activeOperators.forEach((op) => {
    liveCountMap[op.id] = countMap[op.id] ?? 0;
  });

  try {
    for (const reg of unassigned) {
      // ── Not Interested contacts are permanently excluded from auto-assign ──
      if (notInterestedSet.has(String(reg.id))) {
        skippedNotInterested++;
        continue;
      }

      // ── Universal female restriction — applies to every source ────────────
      if (isFemale(reg.gender)) {
        skippedFemale++;
        continue;
      }
      // ── Missing / unknown gender → fail-closed, do not assign ─────────────
      if (!isGenderEligible(reg.gender)) {
        skippedUnknownGender++;
        continue;
      }

      const eligibleOps = activeOperators.filter((op) => {
        if (hasSelectedOps && !selectedSet.has(op.id)) return false;
        const opCap = (op as { capacity?: number }).capacity ?? MAX_CONTACTS_PER_OPERATOR;
        if (!opCap || !Number.isInteger(opCap) || opCap < 1 || opCap > 500) return false;
        return (liveCountMap[op.id] ?? 0) < opCap;
      });

      if (eligibleOps.length === 0) {
        skippedCapacity++;
        continue;
      }

      eligibleOps.sort((a, b) => (liveCountMap[a.id] ?? 0) - (liveCountMap[b.id] ?? 0));
      const chosenOp = eligibleOps[0];
      const chosenOpCapacity = (chosenOp as { capacity?: number }).capacity ?? MAX_CONTACTS_PER_OPERATOR;

      try {
        if (isMaster) {
          const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('assign_master_contact_atomic', {
            p_master_contact_id: String(reg.id),
            p_operator_id: chosenOp.id,
            p_assigned_by: userId ?? null,
            p_max_capacity: chosenOpCapacity,
            p_allow_reassign: allowReassign,
          });

          if (rpcErr || !rpcRes?.success) {
            if (rpcRes?.code === 'CONTACT_ALREADY_ASSIGNED' || rpcRes?.code === 'ALREADY_ASSIGNED') {
              skippedAlreadyAssigned++;
            } else if (rpcRes?.code === 'OPERATOR_CAPACITY_EXCEEDED') {
              skippedCapacity++;
            } else {
              failed++;
            }
            continue;
          }
        } else {
          const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('assign_contact_atomic', {
            p_contact_id: String(reg.id),
            p_operator_id: chosenOp.id,
            p_source: source,
            p_assigned_by: userId ?? null,
            p_max_capacity: chosenOpCapacity,
            p_allow_reassign: allowReassign,
          });

          if (rpcErr || !rpcRes?.success) {
            if (rpcRes?.code === 'CONTACT_ALREADY_ASSIGNED' || rpcRes?.code === 'ALREADY_ASSIGNED') {
              skippedAlreadyAssigned++;
            } else if (rpcRes?.code === 'OPERATOR_CAPACITY_EXCEEDED') {
              skippedCapacity++;
            } else {
              failed++;
            }
            continue;
          }
        }

        liveCountMap[chosenOp.id] = (liveCountMap[chosenOp.id] ?? 0) + 1;
        assigned++;

        const opId = chosenOp.id;
        const formattedName = formatOperatorDisplayName(chosenOp.name);
        if (!distribution[opId]) {
          distribution[opId] = { name: formattedName, assigned_in_batch: 0 };
        }
        distribution[opId].assigned_in_batch++;
      } catch (err) {
        console.error(`[auto-assign] Unexpected error for ${reg.id} (${source}):`, err);
        failed++;
      }
    }
  } finally {
    isBatchRunning = false;
  }

  return NextResponse.json({
    dry_run: false,
    report: {
      source,
      total_unassigned: unassigned.length,
      unfiltered_unassigned: unassignedBeforeFilter.length,
      filtered_candidates: unassigned.length,
      successfully_assigned: assigned,
      skipped_not_interested: skippedNotInterested,
      skipped_already_assigned: skippedAlreadyAssigned,
      skipped_female: skippedFemale,
      skipped_unknown_gender: skippedUnknownGender,
      skipped_no_capacity: skippedCapacity,
      failed,
      distribution: Object.entries(distribution).map(([id, d]) => ({
        operator_id: id,
        operator_name: d.name,
        assigned_in_batch: d.assigned_in_batch,
      })),
    },
  });
}
