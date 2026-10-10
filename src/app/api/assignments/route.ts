/**
 * /api/assignments
 * GET  — Admin: list assigned contacts (source-aware)
 * POST — Admin: assign or reassign contacts to operators (source-aware)
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { normalizeSource } from '@/lib/source-resolver';

/**
 * Normalize gender string for comparison.
 * Returns 'female', 'male', or '' (unknown/missing).
 * Gender is NEVER inferred from any other attribute.
 */
function normalizeGender(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  return String(raw).trim().toLowerCase();
}

/**
 * Returns true when the contact's gender is eligible for operator assignment.
 * Female contacts are NEVER eligible. Missing/unknown gender is fail-closed (also ineligible).
 */
function isGenderEligible(raw: unknown): boolean {
  const g = normalizeGender(raw);
  if (!g) return false; // missing gender → fail-closed
  return g !== 'female';
}

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

// ─── GET /api/assignments ─────────────────────────────────────────────────────
export async function GET(req: Request) {
  const { error: authError } = await requireAdmin(req);
  if (authError) return authError;

  const url = new URL(req.url);
  const source = normalizeSource(url.searchParams.get('source'));
  const operatorId = url.searchParams.get('operator_id');
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let data: unknown[] | null = null;
  let count: number | null = 0;
  let error: { message: string } | null = null;

  if (source === 'master_dashboard') {
    let q = supabaseAdmin
      .from('master_contact_assignments')
      .select(`
        id, master_contact_id, operator_id, assigned_at,
        status, comments, is_active, updated_at,
        contact_operators!operator_id (id, name, email, phone),
        master_contacts!master_contact_id (*)
      `, { count: 'exact' })
      .eq('is_active', true)
      .order('assigned_at', { ascending: false });

    if (operatorId) q = q.eq('operator_id', operatorId);
    const res = await q.range(from, to);
    data = (res.data ?? []).map((row: Record<string, unknown>) => {
      const mc = (row.master_contacts as Record<string, unknown> | null) || {};
      const contactObj = {
        ...mc,
        full_name: mc.name || mc.full_name || '—',
        name: mc.name || mc.full_name || '—',
        phone: mc.phone || '',
        college_name: mc.company_college || mc.college_name || '',
        company_college: mc.company_college || '',
        branch: mc.occupation || mc.branch || '',
        occupation: mc.occupation || '',
        area_of_stay: mc.area_of_stay || '',
        current_stay: mc.area_of_stay || '',
      };
      return {
        ...row,
        notes: row.comments || row.notes || '',
        remarks: row.comments || row.remarks || '',
        master_contacts: contactObj,
        master_contact: contactObj,
      };
    });
    count = res.count;
    error = res.error;
  } else if (source === 'krishnashtami') {
    let q = supabaseAdmin
      .from('krishnashtami_contact_assignments')
      .select(`
        id, registration_id, operator_id, assigned_by, assigned_at, called_at,
        status, notes, is_active, created_at, updated_at,
        contact_operators!operator_id (id, name, email, phone),
        krishnashtami_registrations!registration_id (*)
      `, { count: 'exact' })
      .eq('is_active', true)
      .order('assigned_at', { ascending: false });

    if (operatorId) q = q.eq('operator_id', operatorId);
    const res = await q.range(from, to);
    data = res.data;
    count = res.count;
    error = res.error;
  } else if (source === 'feedback_contacts') {
    let q = supabaseAdmin
      .from('feedback_contact_assignments')
      .select(`
        id, feedback_contact_id, operator_id, assigned_by, assigned_at,
        status, notes, is_active, created_at, updated_at,
        contact_operators!operator_id (id, name, email, phone),
        feedback_contacts!feedback_contact_id (*)
      `, { count: 'exact' })
      .eq('is_active', true)
      .order('assigned_at', { ascending: false });

    if (operatorId) q = q.eq('operator_id', operatorId);
    const res = await q.range(from, to);
    data = res.data;
    count = res.count;
    error = res.error;
  } else {
    let q = supabaseAdmin
      .from('contact_assignments')
      .select(`
        id, registration_id, operator_id, assigned_by, assigned_at, called_at,
        status, notes, is_active, created_at, updated_at,
        contact_operators!operator_id (id, name, email, phone),
        registrations!registration_id (*)
      `, { count: 'exact' })
      .eq('is_active', true)
      .order('assigned_at', { ascending: false });

    if (operatorId) q = q.eq('operator_id', operatorId);
    const res = await q.range(from, to);
    data = res.data;
    count = res.count;
    error = res.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ assignments: data, total: count, page, limit, source });
}

// ─── POST /api/assignments ────────────────────────────────────────────────────
export async function POST(req: Request) {
  const { error: authError, userId } = await requireAdmin(req);
  if (authError) return authError;

  let body: {
    source?: string;
    registration_ids?: string[];
    registration_id?: string;
    master_contact_id?: string;
    master_contact_ids?: string[];
    operator_id?: string;
    reassign?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const source = normalizeSource(body.source);
  const { operator_id } = body;

  const regIds: string[] = body.master_contact_ids?.length
    ? body.master_contact_ids
    : body.master_contact_id
    ? [body.master_contact_id]
    : body.registration_ids?.length
    ? body.registration_ids
    : body.registration_id
    ? [body.registration_id]
    : [];

  if (!operator_id) return NextResponse.json({ error: 'operator_id is required' }, { status: 400 });
  if (!regIds.length) return NextResponse.json({ error: 'At least one contact ID is required' }, { status: 400 });

  const { data: operator } = await supabaseAdmin
    .from('contact_operators')
    .select('id, name, is_active')
    .eq('id', operator_id)
    .single();
  if (!operator) return NextResponse.json({ error: 'Operator not found' }, { status: 404 });
  if (!operator.is_active) return NextResponse.json({ error: 'Operator is currently disabled' }, { status: 400 });

  // Handle Master Dashboard assignment via Atomic Database RPC assign_master_contact_atomic
  if (source === 'master_dashboard') {
    const results: Array<{ master_contact_id: string; status: string; message: string }> = [];

    for (const mId of regIds) {
      // ── Gender pre-validation: resolve authoritative gender from master_contacts ──
      const { data: masterContact, error: mcFetchErr } = await supabaseAdmin
        .from('master_contacts')
        .select('id, gender')
        .eq('id', mId)
        .maybeSingle();

      if (mcFetchErr || !masterContact) {
        results.push({
          master_contact_id: mId,
          status: 'error',
          message: 'Master contact not found or could not be resolved.',
        });
        continue;
      }

      if (!isGenderEligible(masterContact.gender)) {
        const g = normalizeGender(masterContact.gender);
        const reason = !g
          ? 'Contact gender is missing or unknown. Assignment requires a confirmed eligible gender.'
          : 'Female contacts are not eligible for operator assignment.';
        results.push({
          master_contact_id: mId,
          status: 'error',
          message: reason,
        });
        continue;
      }

      const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('assign_master_contact_atomic', {
        p_master_contact_id: mId,
        p_operator_id: operator.id,
        p_assigned_by: userId ?? null,
        p_max_capacity: 40,
      });

      if (rpcErr || !rpcRes?.success) {
        results.push({
          master_contact_id: mId,
          status: 'error',
          message: rpcErr?.message || rpcRes?.message || 'Assignment failed',
        });
      } else {
        results.push({
          master_contact_id: mId,
          status: 'assigned',
          message: rpcRes.message || `Assigned to ${operator.name}`,
        });
      }
    }

    const assignedCount = results.filter((r) => r.status === 'assigned').length;
    if (assignedCount === 0 && results.length > 0) {
      return NextResponse.json({ error: results[0].message, results, source }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      assigned_count: assignedCount,
      results,
      source: 'master_dashboard',
    });
  }

  // Existing event-specific assignment handling...
  const targetRegTable =
    source === 'krishnashtami'
      ? 'krishnashtami_registrations'
      : source === 'feedback_contacts'
      ? 'feedback_contacts'
      : 'registrations';

  const { data: verifiedRegs, error: regsFetchError } = await supabaseAdmin
    .from(targetRegTable)
    .select('id, gender')
    .in('id', regIds);

  if (regsFetchError || !verifiedRegs || verifiedRegs.length !== regIds.length) {
    return NextResponse.json(
      { error: `Cross-source assignment rejected: One or more IDs do not belong to ${source} table` },
      { status: 400 }
    );
  }

  // ── Gender validation: reject any female or unknown-gender contacts ──────────────────────
  const ineligibleReg = verifiedRegs.find((r) => !isGenderEligible(r.gender));
  if (ineligibleReg) {
    const g = normalizeGender(ineligibleReg.gender);
    const reason = !g
      ? `Contact gender is missing or unknown (ID: ${ineligibleReg.id}). Assignment requires a confirmed eligible gender.`
      : `Female contacts are not eligible for operator assignment (ID: ${ineligibleReg.id}).`;
    return NextResponse.json({ error: reason }, { status: 400 });
  }

  const assignTable =
    source === 'krishnashtami'
      ? 'krishnashtami_contact_assignments'
      : source === 'feedback_contacts'
      ? 'feedback_contact_assignments'
      : 'contact_assignments';

  const fkCol = source === 'feedback_contacts' ? 'feedback_contact_id' : 'registration_id';

  const results: Array<{ registration_id: string; status: string; message: string; assignment?: unknown }> = [];

  for (const regId of regIds) {
    const { data: existingActive } = await supabaseAdmin
      .from(assignTable)
      .select('id, operator_id, contact_operators!operator_id (id, name)')
      .eq(fkCol, regId)
      .eq('is_active', true)
      .maybeSingle();

    if (existingActive) {
      if (existingActive.operator_id === operator.id) {
        results.push({
          registration_id: regId,
          status: 'already_assigned',
          message: `Already assigned to ${operator.name}`,
        });
        continue;
      }

      // Check target operator capacity before deactivating old assignment
      const { count: targetOpCount } = await supabaseAdmin
        .from(assignTable)
        .select('id', { count: 'exact', head: true })
        .eq('operator_id', operator.id)
        .eq('is_active', true);

      if ((targetOpCount ?? 0) >= 40) {
        results.push({
          registration_id: regId,
          status: 'error',
          message: `Operator ${operator.name} has reached maximum capacity limit (Max 40 active contacts)`,
        });
        continue;
      }

      // Deactivate previous active assignment
      const { error: deactErr } = await supabaseAdmin
        .from(assignTable)
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', existingActive.id);

      if (deactErr) {
        results.push({
          registration_id: regId,
          status: 'error',
          message: `Failed to deactivate previous assignment: ${deactErr.message}`,
        });
        continue;
      }

      // Insert new active assignment
      const initialStatus = source === 'feedback_contacts' ? 'Assigned' : 'Pending';
      const insertPayload: Record<string, unknown> = {
        [fkCol]: regId,
        operator_id: operator.id,
        assigned_by: userId ?? null,
        status: initialStatus,
        is_active: true,
      };

      const { data: newAssign, error: insertErr } = await supabaseAdmin
        .from(assignTable)
        .insert(insertPayload)
        .select('id')
        .single();

      if (insertErr || !newAssign) {
        // Rollback previous assignment deactivation
        await supabaseAdmin
          .from(assignTable)
          .update({ is_active: true, updated_at: new Date().toISOString() })
          .eq('id', existingActive.id);

        results.push({
          registration_id: regId,
          status: 'error',
          message: `Failed to create new assignment: ${insertErr?.message || 'Unknown error'}`,
        });
        continue;
      }

      // Sync master contact assignment if master contact exists for this record
      try {
        const { data: regRow } = await supabaseAdmin
          .from(targetRegTable)
          .select('phone')
          .eq('id', regId)
          .single();
        if (regRow?.phone) {
          const { normalizePhone } = await import('@/lib/master-contacts');
          const cleanPhone = normalizePhone(regRow.phone);
          if (cleanPhone) {
            const { data: mc } = await supabaseAdmin
              .from('master_contacts')
              .select('id')
              .eq('phone', cleanPhone)
              .maybeSingle();
            if (mc?.id) {
              await supabaseAdmin.rpc('assign_master_contact_atomic', {
                p_master_contact_id: mc.id,
                p_operator_id: operator.id,
                p_assigned_by: userId ?? null,
                p_max_capacity: 40,
              });
            }
          }
        }
      } catch (masterSyncErr) {
        console.warn('[reassign] Master contact assignment sync warning:', masterSyncErr);
      }

      const prevOpName = (
        Array.isArray(existingActive.contact_operators)
          ? existingActive.contact_operators[0]?.name
          : (existingActive.contact_operators as { name?: string } | null)?.name
      ) ?? 'previous operator';

      results.push({
        registration_id: regId,
        status: 'reassigned',
        message: `Reassigned from ${prevOpName} to ${operator.name}`,
      });
      continue;
    }

    const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('assign_contact_atomic', {
      p_contact_id: regId,
      p_operator_id: operator.id,
      p_source: source,
      p_assigned_by: userId ?? null,
      p_max_capacity: 40,
    });

    if (rpcErr || !rpcRes?.success) {
      results.push({
        registration_id: regId,
        status: 'error',
        message: rpcErr?.message || rpcRes?.message || 'Assignment failed',
      });
    } else {
      // Sync master contact assignment on initial assignment as well
      try {
        const { data: regRow } = await supabaseAdmin
          .from(targetRegTable)
          .select('phone')
          .eq('id', regId)
          .single();
        if (regRow?.phone) {
          const { normalizePhone } = await import('@/lib/master-contacts');
          const cleanPhone = normalizePhone(regRow.phone);
          if (cleanPhone) {
            const { data: mc } = await supabaseAdmin
              .from('master_contacts')
              .select('id')
              .eq('phone', cleanPhone)
              .maybeSingle();
            if (mc?.id) {
              await supabaseAdmin.rpc('assign_master_contact_atomic', {
                p_master_contact_id: mc.id,
                p_operator_id: operator.id,
                p_assigned_by: userId ?? null,
                p_max_capacity: 40,
              });
            }
          }
        }
      } catch (masterSyncErr) {
        console.warn('[assign] Master contact assignment sync warning:', masterSyncErr);
      }

      results.push({
        registration_id: regId,
        status: 'assigned',
        message: `Assigned to ${operator.name}`,
      });
    }
  }

  const assignedCount = results.filter((r) => r.status === 'assigned' || r.status === 'reassigned').length;

  if (assignedCount === 0 && results.length > 0) {
    const errRes = results.find((r) => r.status === 'error' || r.status === 'already_assigned');
    return NextResponse.json(
      {
        success: false,
        error: errRes?.message || 'Assignment or reassignment failed',
        assigned_count: 0,
        results,
        source,
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    assigned_count: assignedCount,
    results,
    source,
  });
}
