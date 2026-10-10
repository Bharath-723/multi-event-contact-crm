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
import { normalizeSource } from '@/lib/source-resolver';
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
function isFilterActive(val?: string | null): boolean {
  if (!val) return false;
  const s = String(val).trim().toLowerCase();
  if (!s || s === 'all' || s.startsWith('all ') || s === 'n/a' || s === 'none') return false;
  return true;
}

/**
 * Normalize gender to a canonical comparable string.
 * Returns 'female', 'male', or '' (unknown).
 * Gender is NEVER inferred from any other attribute.
 */
function normalizeGender(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  return String(raw).trim().toLowerCase();
}

/**
 * Returns true if the contact's gender is Female (any casing/whitespace variation).
 * Missing or unresolvable gender is NOT treated as male — returns false here so
 * callers can independently decide to fail-closed on unknown gender.
 */
function isFemale(raw: unknown): boolean {
  return normalizeGender(raw) === 'female';
}

/**
 * Returns true if gender is known and NOT female (i.e. contact is eligible).
 * Contacts with missing/unknown gender are NOT eligible for assignment.
 */
function isGenderEligible(raw: unknown): boolean {
  const g = normalizeGender(raw);
  if (!g) return false; // missing gender → fail-closed, not eligible
  return g !== 'female';
}

function normalizeOccupationCategory(raw: unknown): string | null {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  if (['student', 'studying', 'college', 'school'].some((k) => s.includes(k))) return 'Student';
  if (['employee', 'employed', 'private', 'govt', 'government'].some((k) => s.includes(k))) return 'Employee';
  if (['working', 'job', 'software', 'it', 'engineer', 'developer'].some((k) => s.includes(k))) return 'Working';
  if (['business', 'shop', 'owner', 'self'].some((k) => s.includes(k))) return 'Business';
  return null;
}

function parseToYMD(dateStr: unknown): string | null {
  if (!dateStr) return null;
  const str = String(dateStr).trim();
  if (!str) return null;

  // Handle YYYY-MM-DD directly
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.slice(0, 10);
  }

  const d = new Date(str);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

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
    company_college?: string;
    occupation?: string;
    standard?: string;
    service_id?: string;
    date?: string;
    volunteer?: string;
    selected_operator_ids?: string[];
  } = {};

  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const isDryRun = body.dry_run !== false;
  const rawSource = body.source ?? 'rathayatra';
  const source = normalizeSource(rawSource);
  const isFeedback = source === 'feedback_contacts';
  const isMaster = source === 'master_dashboard';
  const isKrishnashtami = source === 'krishnashtami';
  const isRathayatra = source === 'rathayatra';

  // 7 Filters (normalized trimmed values or null)
  const filterArea = body.area_of_stay?.trim() || null;
  const filterCollege = body.company_college?.trim() || null;
  const filterOccupation = body.occupation?.trim() || null;
  const filterStandard = body.standard?.trim() || null;
  const filterServiceId = body.service_id?.trim() || null;
  const filterDate = body.date?.trim() || null;
  const filterVolunteer = body.volunteer?.trim() || null;

  const selectedOpIds = Array.isArray(body.selected_operator_ids)
    ? body.selected_operator_ids.filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
    : [];

  const targetRegTable =
    isMaster
      ? 'master_contacts'
      : isKrishnashtami
      ? 'krishnashtami_registrations'
      : isFeedback
      ? 'feedback_contacts'
      : 'registrations';

  const assignTable =
    isMaster
      ? 'master_contact_assignments'
      : isKrishnashtami
      ? 'krishnashtami_contact_assignments'
      : isFeedback
      ? 'feedback_contact_assignments'
      : 'contact_assignments';

  const fkCol = isMaster
    ? 'master_contact_id'
    : isFeedback
    ? 'feedback_contact_id'
    : 'registration_id';

  // ── 1. Fetch active operators ────────────────────────────────────────────────
  const { data: operators, error: opsError } = await supabaseAdmin
    .from('contact_operators')
    .select('id, name, is_active, operator_type')
    .eq('is_active', true)
    .eq('operator_type', 'operator')
    .order('created_at', { ascending: true });

  if (opsError) {
    return NextResponse.json({ error: 'Failed to fetch operators: ' + opsError.message }, { status: 500 });
  }

  const activeOperators = operators ?? [];

  // ── 2. Fetch current active assignment counts per operator for this source ──
  let assignQuery = supabaseAdmin.from(assignTable).select('operator_id');
  if (!isMaster) {
    assignQuery = assignQuery.eq('is_active', true);
  }

  const { data: assignmentCounts, error: countError } = await assignQuery;

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

  // Get currently assigned contact IDs from assignTable
  let assignedQuery = supabaseAdmin.from(assignTable).select(fkCol);
  if (!isMaster) {
    assignedQuery = assignedQuery.eq('is_active', true);
  }
  const { data: assignedRows } = await assignedQuery;

  const assignedSet = new Set(((assignedRows ?? []) as Array<Record<string, unknown>>).map((r) => String(r[fkCol])));

  // ── 4. Filter unassigned registrations using 7-Filter AND-Semantics Pipeline ──
  const unassignedBeforeFilter = allRegs.filter((r) => !assignedSet.has(String(r.id)));

  const unassigned = unassignedBeforeFilter.filter((r) => {
    // 1. Area of Stay
    if (isFilterActive(filterArea)) {
      const candArea = isFeedback ? r.current_stay : r.area_of_stay;
      if (!candArea || String(candArea).trim().toLowerCase() !== String(filterArea).trim().toLowerCase()) {
        return false;
      }
    }

    // 2. College / Company
    if (isFilterActive(filterCollege)) {
      const candCollege = isFeedback ? r.college_name : r.company_college;
      if (!candCollege || String(candCollege).trim().toLowerCase() !== String(filterCollege).trim().toLowerCase()) {
        return false;
      }
    }

    // 3. Occupation
    if (isFilterActive(filterOccupation)) {
      let candOcc = isFeedback ? r.branch : r.occupation;
      if (isMaster) {
        const events = masterEventsMap.get(String(r.id)) || [];
        candOcc = events.map((e) => e.occupation).find(Boolean) || candOcc;
      }
      const targetNorm = normalizeOccupationCategory(filterOccupation) || String(filterOccupation).trim().toLowerCase();
      const candNorm = normalizeOccupationCategory(candOcc) || String(candOcc || '').trim().toLowerCase();
      if (candNorm !== targetNorm) {
        return false;
      }
    }

    // 4. Standard (Krishnashtami & Master Dashboard)
    if (isFilterActive(filterStandard) && (isKrishnashtami || isMaster)) {
      let candStd = r.standard;
      if (isMaster) {
        const events = masterEventsMap.get(String(r.id)) || [];
        candStd = events.map((e) => e.standard).find(Boolean) || candStd;
      }
      if (!candStd || String(candStd).trim().toLowerCase() !== String(filterStandard).trim().toLowerCase()) {
        return false;
      }
    }

    // 5. Service ID (Rathayatra, Krishnashtami, Master Dashboard)
    if (isFilterActive(filterServiceId) && !isFeedback) {
      let candService = r.service_id;
      if (isMaster) {
        const events = masterEventsMap.get(String(r.id)) || [];
        candService = events.map((e) => e.service_id).find(Boolean) || candService;
      }
      if (!candService || String(candService).trim() !== String(filterServiceId).trim()) {
        return false;
      }
    }

    // 6. Date (YYYY-MM-DD comparison against created_at / latest_registration_at)
    if (isFilterActive(filterDate)) {
      const filterYMD = parseToYMD(filterDate);
      if (filterYMD) {
        const candDate = r.created_at || r.latest_registration_at;
        const candYMD = parseToYMD(candDate);
        if (candYMD !== filterYMD) {
          return false;
        }
      }
    }

    // 7. Volunteer Interest
    if (isFilterActive(filterVolunteer)) {
      const targetVol = String(filterVolunteer).trim().toLowerCase();
      const wantVol = targetVol === 'volunteer' || targetVol === 'yes' || targetVol === 'true';
      const wantNonVol = targetVol === 'non-volunteer' || targetVol === 'no' || targetVol === 'false';

      if (isFeedback) {
        const isVol = Boolean(r.interested_online_workshop || r.interested_online_work);
        if (wantVol && !isVol) return false;
        if (wantNonVol && isVol) return false;
      } else {
        let isVol = r.interested_to_volunteer;
        if (isMaster) {
          const events = masterEventsMap.get(String(r.id)) || [];
          const volVal = events.map((e) => e.interested_to_volunteer).find((v) => v !== undefined && v !== null);
          isVol = volVal === 'Yes' || volVal === true;
        }
        const isVolBool = isVol === true || isVol === 'Yes';
        if (wantVol && !isVolBool) return false;
        if (wantNonVol && isVolBool) return false;
      }
    }

    return true;
  });

  // ── 5. Extract Filter Options dynamically from source records ──────────────
  const areasSet = new Set<string>();
  const collegesSet = new Set<string>();
  const occupationsSet = new Set<string>(['Student', 'Employee', 'Working', 'Business']);
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
  };

  // ── 6. Capacity & Eligibility Calculations ─────────────────────────────────
  const hasSelectedOps = selectedOpIds.length > 0;
  const selectedSet = new Set(selectedOpIds);

  const operatorSummaries = activeOperators.map((op) => {
    const current = countMap[op.id] ?? 0;
    const available = Math.max(0, MAX_CONTACTS_PER_OPERATOR - current);
    const isSelected = hasSelectedOps ? selectedSet.has(op.id) : false;
    const isFull = current >= MAX_CONTACTS_PER_OPERATOR;
    return {
      id: op.id,
      name: formatOperatorDisplayName(op.name),
      current,
      capacity: MAX_CONTACTS_PER_OPERATOR,
      available,
      is_selected: isSelected,
      is_full: isFull,
      can_receive: !isFull && (hasSelectedOps ? isSelected : true),
    };
  });

  const targetOperators = hasSelectedOps
    ? operatorSummaries.filter((op) => selectedSet.has(op.id))
    : operatorSummaries;

  const availableSlots = targetOperators.reduce((acc, op) => acc + op.available, 0);

  // ── Female Restriction: applies to ALL sources universally ────────────────
  // Contacts with missing/unknown gender are also excluded (fail-closed policy).
  const skippedFemaleCount = unassigned.filter((r) => isFemale(r.gender)).length;
  const skippedUnknownGenderCount = unassigned.filter((r) => {
    const g = normalizeGender(r.gender);
    return !g; // empty/null/undefined gender
  }).length;
  const eligibleCount = unassigned.filter((r) => isGenderEligible(r.gender)).length;

  const willAssign = Math.min(eligibleCount, Math.max(0, availableSlots));
  const willSkipCapacity = Math.max(0, eligibleCount - availableSlots);

  const dryRunSummary = {
    source,
    total_unassigned: unassignedBeforeFilter.length,
    filtered_candidates: unassigned.length,
    skipped_female: skippedFemaleCount,
    skipped_unknown_gender: skippedUnknownGenderCount,
    eligible_male: eligibleCount,
    eligible_candidates: eligibleCount,
    active_operators: targetOperators.length,
    available_slots: availableSlots,
    will_assign: willAssign,
    will_skip_capacity: willSkipCapacity,
    operator_breakdown: operatorSummaries,
    filter_options: filterOptions,
  };

  if (isDryRun) {
    return NextResponse.json({ dry_run: true, summary: dryRunSummary });
  }

  if (isBatchRunning) {
    return NextResponse.json({ error: 'Batch assignment already in progress.' }, { status: 409 });
  }

  isBatchRunning = true;

  let assigned = 0;
  let skippedFemale = 0;
  let skippedUnknownGender = 0;
  let skippedCapacity = 0;
  let failed = 0;
  const distribution: Record<string, { name: string; assigned_in_batch: number }> = {};

  const liveCountMap: Record<string, number> = {};
  activeOperators.forEach((op) => {
    liveCountMap[op.id] = countMap[op.id] ?? 0;
  });

  try {
    for (const reg of unassigned) {
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

      let eligibleOps = activeOperators.filter((op) => {
        if (hasSelectedOps && !selectedSet.has(op.id)) return false;
        return (liveCountMap[op.id] ?? 0) < MAX_CONTACTS_PER_OPERATOR;
      });

      if (eligibleOps.length === 0) {
        skippedCapacity++;
        continue;
      }

      eligibleOps.sort((a, b) => (liveCountMap[a.id] ?? 0) - (liveCountMap[b.id] ?? 0));
      const chosenOp = eligibleOps[0];

      try {
        if (isMaster) {
          const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('assign_master_contact_atomic', {
            p_master_contact_id: String(reg.id),
            p_operator_id: chosenOp.id,
            p_assigned_by: userId ?? null,
            p_max_capacity: MAX_CONTACTS_PER_OPERATOR,
          });

          if (rpcErr || !rpcRes?.success) {
            skippedCapacity++;
            continue;
          }
        } else {
          const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('assign_contact_atomic', {
            p_contact_id: String(reg.id),
            p_operator_id: chosenOp.id,
            p_source: source,
            p_assigned_by: userId ?? null,
            p_max_capacity: MAX_CONTACTS_PER_OPERATOR,
          });

          if (rpcErr || !rpcRes?.success) {
            skippedCapacity++;
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
      total_unassigned: unassignedBeforeFilter.length,
      filtered_candidates: unassigned.length,
      successfully_assigned: assigned,
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
