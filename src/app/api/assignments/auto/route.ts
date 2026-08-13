/**
 * POST /api/assignments/auto
 *
 * Phase 3A — Batch Auto-Assignment Engine (Multi-Festival Scoped)
 *
 * Modes:
 *   dry_run=true  → Returns a summary (total unassigned, operators, capacity) WITHOUT assigning.
 *   dry_run=false → Executes assignment. Processes one registration at a time via the RPC.
 *
 * Scoping:
 *   Scopes registrations, capacity, and RPC assignment by festival_event_id.
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { MAX_CONTACTS_PER_OPERATOR } from '@/lib/assignment-engine';

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

  let body: { dry_run?: boolean; festival_event_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const isDryRun = body.dry_run !== false; // default to dry_run=true for safety
  const festivalEventId = body.festival_event_id || null;

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

  // ── 2. Fetch current active (non-Not-Coming) assignment counts per operator ──
  let countQuery = supabaseAdmin
    .from('contact_assignments')
    .select('operator_id, registrations!inner(festival_event_id)')
    .eq('is_active', true)
    .neq('status', 'Not Coming');

  if (festivalEventId) {
    countQuery = countQuery.eq('registrations.festival_event_id', festivalEventId);
  }

  const { data: assignmentCounts, error: countError } = await countQuery;

  if (countError) {
    return NextResponse.json({ error: 'Failed to fetch assignment counts: ' + countError.message }, { status: 500 });
  }

  const countMap: Record<string, number> = {};
  for (const row of assignmentCounts ?? []) {
    if (row.operator_id) {
      countMap[row.operator_id] = (countMap[row.operator_id] ?? 0) + 1;
    }
  }

  // ── 3. Fetch unassigned registrations ────────────────────────────────────────
  let regsQuery = supabaseAdmin
    .from('registrations')
    .select('id, full_name, gender, festival_event_id')
    .order('created_at', { ascending: true });

  if (festivalEventId) {
    regsQuery = regsQuery.eq('festival_event_id', festivalEventId);
  }

  const { data: unassignedRegs, error: regsError } = await regsQuery;

  if (regsError) {
    return NextResponse.json({ error: 'Failed to fetch registrations: ' + regsError.message }, { status: 500 });
  }

  // Get all currently-assigned registration IDs
  const { data: assignedRows } = await supabaseAdmin
    .from('contact_assignments')
    .select('registration_id')
    .eq('is_active', true);

  // Get all registration IDs ever marked as 'Not Coming'
  const { data: notComingRows } = await supabaseAdmin
    .from('contact_assignments')
    .select('registration_id')
    .eq('status', 'Not Coming');

  const assignedSet = new Set((assignedRows ?? []).map((r) => r.registration_id));
  const notComingSet = new Set((notComingRows ?? []).map((r) => r.registration_id));
  
  const unassigned = (unassignedRegs ?? []).filter(
    (r) => !assignedSet.has(r.id) && !notComingSet.has(r.id)
  );

  // ── 4. Compute capacity summary ──────────────────────────────────────────────
  const totalCapacity = activeOperators.length * MAX_CONTACTS_PER_OPERATOR;
  const currentlyAssigned = Object.values(countMap).reduce((a, b) => a + b, 0);
  const availableSlots = totalCapacity - currentlyAssigned;

  const operatorSummaries = activeOperators.map((op) => ({
    id: op.id,
    name: op.name,
    current: countMap[op.id] ?? 0,
    capacity: MAX_CONTACTS_PER_OPERATOR,
    available: MAX_CONTACTS_PER_OPERATOR - (countMap[op.id] ?? 0),
  }));

  const skippedFemaleCount = unassigned.filter(r => r.gender === 'Female').length;
  const eligibleMaleCount = unassigned.filter(r => r.gender === 'Male').length;
  
  const willAssign = Math.min(eligibleMaleCount, Math.max(0, availableSlots));
  const willSkipCapacity = Math.max(0, eligibleMaleCount - availableSlots);

  const dryRunSummary = {
    total_unassigned: unassigned.length,
    skipped_female: skippedFemaleCount,
    eligible_male: eligibleMaleCount,
    active_operators: activeOperators.length,
    total_capacity: totalCapacity,
    currently_assigned: currentlyAssigned,
    available_slots: availableSlots,
    will_assign: willAssign,
    will_skip_capacity: willSkipCapacity,
    will_skip: skippedFemaleCount + willSkipCapacity,
    capacity_warning: eligibleMaleCount > availableSlots,
    operator_breakdown: operatorSummaries,
  };

  // ── 5. Dry-run: return summary without assigning ─────────────────────────────
  if (isDryRun) {
    return NextResponse.json({ dry_run: true, summary: dryRunSummary });
  }

  // ── 6. Concurrency guard ─────────────────────────────────────────────────────
  if (isBatchRunning) {
    return NextResponse.json(
      { error: 'Batch assignment already in progress.' },
      { status: 409 }
    );
  }

  // ── 7. Execute batch assignment ──────────────────────────────────────────────
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
        console.log("Assignment skipped: Female registration.");
        continue;
      }

      try {
        const { data: operatorId, error: rpcError } = await supabaseAdmin.rpc(
          'assign_operator_to_registration',
          {
            p_registration_id: reg.id,
            p_max_contacts: MAX_CONTACTS_PER_OPERATOR,
            p_festival_event_id: festivalEventId,
          }
        );

        if (rpcError) {
          console.error(`[auto-assign] RPC error for ${reg.id}:`, rpcError.message);
          failed++;
          continue;
        }

        if (!operatorId) {
          skippedCapacity++;
          continue;
        }

        await supabaseAdmin.from('audit_logs').insert({
          admin_id: userId ?? null,
          action: 'AUTO_ASSIGNMENT',
          details: {
            registration_id: reg.id,
            operator_id: operatorId,
            festival_event_id: festivalEventId,
            batch: true,
          },
        });

        assigned++;
        if (!distribution[operatorId]) {
          const op = activeOperators.find((o) => o.id === operatorId);
          distribution[operatorId] = { name: op?.name ?? operatorId, assigned_in_batch: 0 };
        }
        distribution[operatorId].assigned_in_batch++;
      } catch (err) {
        console.error(`[auto-assign] Unexpected error for ${reg.id}:`, err);
        failed++;
      }
    }
  } finally {
    isBatchRunning = false;
  }

  const report = {
    total_unassigned: unassigned.length,
    successfully_assigned: assigned,
    skipped_female: skippedFemale,
    skipped_no_capacity: skippedCapacity,
    failed: failed,
    distribution: Object.entries(distribution).map(([id, d]) => ({
      operator_id: id,
      operator_name: d.name,
      assigned_in_batch: d.assigned_in_batch,
    })),
  };

  return NextResponse.json({ dry_run: false, report });
}
