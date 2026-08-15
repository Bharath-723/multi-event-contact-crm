/**
 * POST /api/assignments/auto
 *
 * Phase 3A — Batch Auto-Assignment Engine (Multi-Festival Scoped)
 *
 * Modes:
 *   dry_run=true  → Returns a summary (total unassigned, operators, capacity, filter options) WITHOUT assigning.
 *   dry_run=false → Revalidates DB state and executes assignment dynamically via atomic RPC.
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { assignOperator, MAX_CONTACTS_PER_OPERATOR } from '@/lib/assignment-engine';
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

// ─── GET /api/assignments/auto  (status check) ────────────────────────────────
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

  const filterArea = body.area_of_stay?.trim() || null;
  const filterCollege = body.company_college?.trim() || null;
  const filterOccupation = body.occupation?.trim() || null;

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
  for (const row of assignmentCounts ?? []) {
    if (row.operator_id) {
      countMap[row.operator_id] = (countMap[row.operator_id] ?? 0) + 1;
    }
  }

  // ── 3. Fetch unassigned contacts from target table ─────────────────────────
  const selectFields = isFeedback
    ? 'id, full_name, gender, current_stay, college_name, branch'
    : 'id, full_name, gender, area_of_stay, company_college, occupation';

  const { data: allRegs, error: regsError } = await supabaseAdmin
    .from(targetRegTable)
    .select(selectFields)
    .order('created_at', { ascending: true });

  if (regsError) {
    return NextResponse.json({ error: 'Failed to fetch registrations: ' + regsError.message }, { status: 500 });
  }

  // Get assigned IDs from assignTable
  const { data: assignedRows } = await supabaseAdmin
    .from(assignTable)
    .select(`${fkCol}`)
    .eq('is_active', true);

  const assignedSet = new Set((assignedRows ?? []).map((r) => (r as Record<string, string>)[fkCol]));

  // Extract filter options from all registrations
  const availableAreas = Array.from(
    new Set(
      (allRegs ?? [])
        .map((r: Record<string, unknown>) => String(r.area_of_stay || r.current_stay || '').trim())
        .filter(Boolean)
    )
  ).sort();

  const availableColleges = Array.from(
    new Set(
      (allRegs ?? [])
        .map((r: Record<string, unknown>) => String(r.company_college || r.college_name || '').trim())
        .filter(Boolean)
    )
  ).sort();

  const availableOccupations = Array.from(
    new Set(
      (allRegs ?? [])
        .map((r: Record<string, unknown>) => String(r.occupation || r.branch || '').trim())
        .filter(Boolean)
    )
  ).sort();

  // Filter unassigned registrations
  let unassigned = (allRegs ?? []).filter((r: Record<string, unknown>) => !assignedSet.has(String(r.id)));

  // Apply filters with AND semantics if specified
  if (filterArea) {
    unassigned = unassigned.filter((r: Record<string, unknown>) => {
      const val = String(r.area_of_stay || r.current_stay || '').trim();
      return val.toLowerCase() === filterArea.toLowerCase();
    });
  }

  if (filterCollege) {
    unassigned = unassigned.filter((r: Record<string, unknown>) => {
      const val = String(r.company_college || r.college_name || '').trim();
      return val.toLowerCase() === filterCollege.toLowerCase();
    });
  }

  if (filterOccupation) {
    unassigned = unassigned.filter((r: Record<string, unknown>) => {
      const val = String(r.occupation || r.branch || '').trim();
      return val.toLowerCase() === filterOccupation.toLowerCase();
    });
  }

  // ── 4. Compute capacity summary ──────────────────────────────────────────────
  const totalCapacity = activeOperators.length * MAX_CONTACTS_PER_OPERATOR;
  const currentlyAssigned = Object.values(countMap).reduce((a, b) => a + b, 0);
  const availableSlots = totalCapacity - currentlyAssigned;

  const operatorSummaries = activeOperators.map((op) => ({
    id: op.id,
    name: formatOperatorDisplayName(op.name),
    current: countMap[op.id] ?? 0,
    capacity: MAX_CONTACTS_PER_OPERATOR,
    available: MAX_CONTACTS_PER_OPERATOR - (countMap[op.id] ?? 0),
  }));

  const skippedFemaleCount = unassigned.filter((r: Record<string, unknown>) => r.gender === 'Female').length;
  const eligibleCount = unassigned.filter((r: Record<string, unknown>) => r.gender !== 'Female').length;

  const willAssign = Math.min(eligibleCount, Math.max(0, availableSlots));
  const willSkipCapacity = Math.max(0, eligibleCount - availableSlots);

  const dryRunSummary = {
    source,
    filters: {
      area_of_stay: filterArea,
      company_college: filterCollege,
      occupation: filterOccupation,
    },
    filter_options: {
      areas: availableAreas,
      colleges: availableColleges,
      occupations: availableOccupations,
    },
    total_unassigned: unassigned.length,
    skipped_female: skippedFemaleCount,
    eligible_male: eligibleCount,
    active_operators: activeOperators.length,
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

  try {
    for (const reg of unassigned) {
      if (reg.gender === 'Female') {
        skippedFemale++;
        continue;
      }

      try {
        const assignedOpId = await assignOperator(String(reg.id), source);

        if (!assignedOpId) {
          skippedCapacity++;
          continue;
        }

        await supabaseAdmin.from('audit_logs').insert({
          admin_id: userId ?? null,
          action: 'AUTO_ASSIGNMENT',
          details: {
            source,
            registration_id: reg.id,
            operator_id: assignedOpId,
            batch: true,
          },
        });

        assigned++;
        if (!distribution[assignedOpId]) {
          const op = activeOperators.find((o) => o.id === assignedOpId);
          let rawName = op?.name;
          if (!rawName) {
            const { data: opRow } = await supabaseAdmin.from('contact_operators').select('name').eq('id', assignedOpId).single();
            rawName = opRow?.name;
          }
          distribution[assignedOpId] = { name: formatOperatorDisplayName(rawName), assigned_in_batch: 0 };
        }
        distribution[assignedOpId].assigned_in_batch++;
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
