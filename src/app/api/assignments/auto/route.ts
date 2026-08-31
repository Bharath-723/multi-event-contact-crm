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

  // 7 Filters (normalized trimmed values or null)
  const filterArea = body.area_of_stay?.trim() || null;
  const filterCollege = body.company_college?.trim() || null;
  const filterOccupation = body.occupation?.trim() || null;
  const filterStandard = body.standard?.trim() || null;
  const filterServiceId = body.service_id?.trim() || null;
  const filterDate = body.date?.trim() || null; // YYYY-MM-DD format
  const filterVolunteer = body.volunteer?.trim() || null; // 'yes' | 'no' | 'volunteer' | 'non-volunteer'

  const selectedOpIds = Array.isArray(body.selected_operator_ids)
    ? body.selected_operator_ids.filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
    : [];

  const targetRegTable =
    source === 'krishnashtami'
      ? 'krishnashtami_registrations'
      : isFeedback
      ? 'feedback_contacts'
      : 'registrations';

  const assignTable =
    source === 'krishnashtami'
      ? 'krishnashtami_contact_assignments'
      : isFeedback
      ? 'feedback_contact_assignments'
      : 'contact_assignments';

  const fkCol = isFeedback ? 'feedback_contact_id' : 'registration_id';

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

  // ── 3. Fetch active service catalog for services filter dropdown options ────
  const { data: serviceRows } = await supabaseAdmin
    .from('services')
    .select('id, name, is_active')
    .eq('is_active', true)
    .order('name', { ascending: true });

  const activeServices = ((serviceRows ?? []) as Array<Record<string, unknown>>).map((s) => ({
    id: String(s.id),
    name: String(s.name),
  }));

  // ── 4. Fetch all registrations for target table ────────────────────────────
  const { data: fetchedRegs, error: regsError } = await supabaseAdmin
    .from(targetRegTable)
    .select('*')
    .order('created_at', { ascending: true });

  if (regsError) {
    return NextResponse.json({ error: 'Failed to fetch registrations: ' + regsError.message }, { status: 500 });
  }

  const allRegs = (fetchedRegs ?? []) as Array<Record<string, unknown>>;

  // Get currently assigned contact IDs from assignTable (is_active = true)
  const { data: assignedRows } = await supabaseAdmin
    .from(assignTable)
    .select(fkCol)
    .eq('is_active', true);

  const assignedSet = new Set(((assignedRows ?? []) as Array<Record<string, unknown>>).map((r) => String(r[fkCol])));

  // ── 5. Extract available filter options strictly for current festival/source ──
  const availableAreas = Array.from(
    new Set(
      allRegs
        .map((r) => String(r.area_of_stay || r.current_stay || '').trim())
        .filter(Boolean)
    )
  ).sort();

  const availableColleges = Array.from(
    new Set(
      allRegs
        .map((r) => String(r.company_college || r.college_name || '').trim())
        .filter(Boolean)
    )
  ).sort();

  const availableOccupations = Array.from(
    new Set(
      allRegs
        .map((r) => String(r.occupation || r.branch || '').trim())
        .filter(Boolean)
    )
  ).sort();

  const availableStandards = source === 'krishnashtami'
    ? Array.from(
        new Set(
          allRegs
            .map((r) => String(r.standard || '').trim())
            .filter(Boolean)
        )
      ).sort()
    : [];

  // Extract distinct formatted dates (YYYY-MM-DD) from created_at
  const availableDates = Array.from(
    new Set(
      allRegs
        .map((r) => {
          if (!r.created_at) return '';
          const str = String(r.created_at);
          return str.slice(0, 10); // YYYY-MM-DD
        })
        .filter(Boolean)
    )
  ).sort();

  // Distinct volunteers options
  const availableVolunteers = !isFeedback ? ['Volunteer', 'Non-Volunteer'] : [];

  // ── 6. Filter unassigned registrations with AND semantics ───────────────────
  let unassigned = allRegs.filter((r) => !assignedSet.has(String(r.id)));

  // Filter 1: Area of Stay
  if (filterArea) {
    unassigned = unassigned.filter((r) => {
      const val = String(r.area_of_stay || r.current_stay || '').trim();
      return val.toLowerCase() === filterArea.toLowerCase();
    });
  }

  // Filter 2: College / Company
  if (filterCollege) {
    unassigned = unassigned.filter((r) => {
      const val = String(r.company_college || r.college_name || '').trim();
      return val.toLowerCase() === filterCollege.toLowerCase();
    });
  }

  // Filter 3: Occupation
  if (filterOccupation) {
    unassigned = unassigned.filter((r) => {
      const val = String(r.occupation || r.branch || '').trim();
      return val.toLowerCase() === filterOccupation.toLowerCase();
    });
  }

  // Filter 4: Standard (Krishnashtami only)
  if (source === 'krishnashtami' && filterStandard) {
    unassigned = unassigned.filter((r) => {
      const val = String(r.standard || '').trim();
      return val.toLowerCase() === filterStandard.toLowerCase();
    });
  }

  // Filter 5: Service
  if (filterServiceId) {
    unassigned = unassigned.filter((r) => {
      const val = String(r.service_id || '').trim();
      return val === filterServiceId;
    });
  }

  // Filter 6: Date
  if (filterDate) {
    unassigned = unassigned.filter((r) => {
      if (!r.created_at) return false;
      const dStr = String(r.created_at).slice(0, 10);
      return dStr === filterDate;
    });
  }

  // Filter 7: Volunteer
  if (filterVolunteer) {
    const isVol =
      filterVolunteer.toLowerCase() === 'yes' ||
      filterVolunteer.toLowerCase() === 'volunteer' ||
      filterVolunteer.toLowerCase() === 'true';

    unassigned = unassigned.filter((r) => {
      return Boolean(r.interested_to_volunteer) === isVol;
    });
  }

  // ── 7. Operator Breakdown & Capacity Calculations ────────────────────────────
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

  // Target operators pool for capacity calculation
  const targetOperators = hasSelectedOps
    ? operatorSummaries.filter((op) => selectedSet.has(op.id))
    : operatorSummaries;

  const totalCapacity = targetOperators.length * MAX_CONTACTS_PER_OPERATOR;
  const currentlyAssigned = targetOperators.reduce((acc, op) => acc + op.current, 0);
  const availableSlots = targetOperators.reduce((acc, op) => acc + op.available, 0);

  const skippedFemaleCount = unassigned.filter((r) => r.gender === 'Female').length;
  const eligibleCount = unassigned.filter((r) => r.gender !== 'Female').length;

  const willAssign = Math.min(eligibleCount, Math.max(0, availableSlots));
  const willSkipCapacity = Math.max(0, eligibleCount - availableSlots);

  const dryRunSummary = {
    source,
    filters: {
      area_of_stay: filterArea,
      company_college: filterCollege,
      occupation: filterOccupation,
      standard: filterStandard,
      service_id: filterServiceId,
      date: filterDate,
      volunteer: filterVolunteer,
    },
    selected_operator_ids: selectedOpIds,
    filter_options: {
      areas: availableAreas,
      colleges: availableColleges,
      occupations: availableOccupations,
      standards: availableStandards,
      services: activeServices,
      dates: availableDates,
      volunteers: availableVolunteers,
    },
    total_unassigned: unassigned.length,
    skipped_female: skippedFemaleCount,
    eligible_male: eligibleCount,
    active_operators: targetOperators.length,
    total_capacity: totalCapacity,
    currently_assigned: currentlyAssigned,
    available_slots: availableSlots,
    will_assign: willAssign,
    will_skip_capacity: willSkipCapacity,
    will_skip: skippedFemaleCount + willSkipCapacity,
    capacity_warning: eligibleCount > availableSlots,
    operator_breakdown: operatorSummaries,
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
  let skippedCapacity = 0;
  let failed = 0;
  const distribution: Record<string, { name: string; assigned_in_batch: number }> = {};

  // Maintain live workload counts during batch execution
  const liveCountMap: Record<string, number> = {};
  activeOperators.forEach((op) => {
    liveCountMap[op.id] = countMap[op.id] ?? 0;
  });

  try {
    for (const reg of unassigned) {
      if (reg.gender === 'Female') {
        skippedFemale++;
        continue;
      }

      // Filter eligible operators that are active and below MAX_CONTACTS_PER_OPERATOR (40)
      // Restrict strictly to selected operators if selectedOpIds is provided
      let eligibleOps = activeOperators.filter((op) => {
        if (hasSelectedOps && !selectedSet.has(op.id)) return false;
        return (liveCountMap[op.id] ?? 0) < MAX_CONTACTS_PER_OPERATOR;
      });

      if (eligibleOps.length === 0) {
        skippedCapacity++;
        continue;
      }

      // Sort by workload ascending (least loaded first)
      eligibleOps.sort((a, b) => (liveCountMap[a.id] ?? 0) - (liveCountMap[b.id] ?? 0));
      const chosenOp = eligibleOps[0];

      try {
        // Execute atomic RPC assignment
        const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('assign_contact_atomic', {
          p_contact_id: String(reg.id),
          p_operator_id: chosenOp.id,
          p_source: source,
          p_assigned_by: userId ?? null,
          p_max_capacity: MAX_CONTACTS_PER_OPERATOR,
        });

        if (rpcErr || !rpcRes?.success) {
          console.error(`[auto-assign] Atomic RPC failed for ${reg.id}:`, rpcErr || rpcRes?.message);
          skippedCapacity++;
          continue;
        }

        // Update live workload counter
        liveCountMap[chosenOp.id] = (liveCountMap[chosenOp.id] ?? 0) + 1;
        assigned++;

        const opId = chosenOp.id;
        const formattedName = formatOperatorDisplayName(chosenOp.name);
        if (!distribution[opId]) {
          distribution[opId] = { name: formattedName, assigned_in_batch: 0 };
        }
        distribution[opId].assigned_in_batch++;

        // Log audit record
        await supabaseAdmin.from('audit_logs').insert({
          admin_id: userId ?? null,
          action: 'AUTO_ASSIGNMENT',
          details: {
            source,
            registration_id: reg.id,
            operator_id: opId,
            batch: true,
            filters: dryRunSummary.filters,
          },
        });
      } catch (err) {
        console.error(`[auto-assign] Unexpected error for ${reg.id} (${source}):`, err);
        failed++;
      }
    }
  } finally {
    isBatchRunning = false;
  }

  const report = {
    source,
    total_unassigned: unassigned.length,
    successfully_assigned: assigned,
    skipped_female: skippedFemale,
    skipped_no_capacity: skippedCapacity,
    failed,
    distribution: Object.entries(distribution).map(([id, d]) => ({
      operator_id: id,
      operator_name: d.name,
      assigned_in_batch: d.assigned_in_batch,
    })),
  };

  return NextResponse.json({ dry_run: false, report });
}
