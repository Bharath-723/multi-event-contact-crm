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
export function isFilterActive(val?: string | null): boolean {
  if (!val) return false;
  const s = String(val).trim().toLowerCase();
  if (!s || s === 'all' || s.startsWith('all ') || s === 'n/a' || s === 'none') return false;
  return true;
}

export function parseFilterValues(rawVal: unknown): string[] {
  if (rawVal === null || rawVal === undefined) return [];
  if (Array.isArray(rawVal)) {
    return Array.from(
      new Set(
        rawVal
          .flatMap((item) => (typeof item === 'string' ? item.split(',') : [String(item)]))
          .map((v) => String(v).trim())
          .filter((s) => s && s.toLowerCase() !== 'all' && !s.toLowerCase().startsWith('all ') && s.toLowerCase() !== 'none')
      )
    );
  }
  if (typeof rawVal === 'string') {
    const trimmed = rawVal.trim();
    if (!trimmed || trimmed.toLowerCase() === 'all' || trimmed.toLowerCase().startsWith('all ') || trimmed.toLowerCase() === 'none') {
      return [];
    }
    if (trimmed.includes(',')) {
      return Array.from(
        new Set(
          trimmed
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s && s.toLowerCase() !== 'all' && !s.toLowerCase().startsWith('all ') && s.toLowerCase() !== 'none')
        )
      );
    }
    return [trimmed];
  }
  if (typeof rawVal === 'number' || typeof rawVal === 'boolean') {
    return [String(rawVal)];
  }
  return [];
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
  if (['other', 'others'].some((k) => s === k || s.startsWith('other'))) return 'Others';
  return null;
}

export function mapLevelCodeToNumber(rawLevel: unknown): number {
  if (!rawLevel) return 0;
  const s = String(rawLevel).trim().toLowerCase();
  const match = s.match(/\blevel-(\d+)\b/);
  if (match) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num)) return num;
  }
  if (s.includes('aomc')) return 1;
  if (s.includes('foundation')) return 2;
  if (s.includes('prilims')) return 3;
  if (s.includes('enhance')) return 4;
  if (s.includes('no level')) return 0;
  const parsed = parseInt(s, 10);
  if (!isNaN(parsed)) return parsed;
  return 0;
}

export function matchesClassesAttended(classesAttended: unknown, filterVal: string | null): boolean {
  if (!filterVal || filterVal.toLowerCase() === 'all' || filterVal === '') return true;
  const count = typeof classesAttended === 'number' && !isNaN(classesAttended) ? classesAttended : 0;
  const trimmed = filterVal.trim();

  if (trimmed === '0') return count === 0;
  if (trimmed === '1-10') return count >= 1 && count <= 10;
  if (trimmed === '11-20') return count >= 11 && count <= 20;
  if (trimmed === '21+' || trimmed === '>=21') return count >= 21;
  if (trimmed.startsWith('>=')) {
    const min = parseInt(trimmed.slice(2), 10);
    return !isNaN(min) && count >= min;
  }
  if (trimmed.startsWith('<=')) {
    const max = parseInt(trimmed.slice(2), 10);
    return !isNaN(max) && count <= max;
  }
  if (trimmed.endsWith('+')) {
    const min = parseInt(trimmed.slice(0, -1), 10);
    return !isNaN(min) && count >= min;
  }
  const exact = parseInt(trimmed, 10);
  if (!isNaN(exact)) return count === exact;
  return true;
}

export function matchesLevelNumber(rawLevel: unknown, filterVal: string | null): boolean {
  if (!filterVal || filterVal.toLowerCase() === 'all' || filterVal === '') return true;
  const contactLvl = mapLevelCodeToNumber(rawLevel);
  const trimmed = filterVal.trim();

  if (trimmed.startsWith('>=')) {
    const min = parseInt(trimmed.slice(2), 10);
    return !isNaN(min) && contactLvl >= min;
  }
  if (trimmed.startsWith('<=')) {
    const max = parseInt(trimmed.slice(2), 10);
    return !isNaN(max) && contactLvl <= max;
  }
  if (trimmed.endsWith('+')) {
    const min = parseInt(trimmed.slice(0, -1), 10);
    return !isNaN(min) && contactLvl >= min;
  }
  const targetLvl = mapLevelCodeToNumber(trimmed);
  return contactLvl === targetLvl;
}

export function matchesChanting(chantingCount: unknown, filterVal: string | null): boolean {
  if (!filterVal || filterVal.toLowerCase() === 'all' || filterVal === '') return true;
  const count = typeof chantingCount === 'number' && !isNaN(chantingCount) ? chantingCount : 0;
  const trimmed = filterVal.trim();

  if (trimmed === '0') return count === 0;
  if (trimmed.startsWith('>=')) {
    const min = parseInt(trimmed.slice(2), 10);
    return !isNaN(min) && count >= min;
  }
  if (trimmed.startsWith('<=')) {
    const max = parseInt(trimmed.slice(2), 10);
    return !isNaN(max) && count <= max;
  }
  if (trimmed.endsWith('+')) {
    const min = parseInt(trimmed.slice(0, -1), 10);
    return !isNaN(min) && count >= min;
  }
  const exact = parseInt(trimmed, 10);
  if (!isNaN(exact)) return count === exact;
  return true;
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
            p_max_capacity: MAX_CONTACTS_PER_OPERATOR,
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
      total_unassigned: unassignedBeforeFilter.length,
      filtered_candidates: unassigned.length,
      successfully_assigned: assigned,
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
