import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getCurrentWeeklyPeriod, getNextResetTimestamp, formatWeeklyPeriodLabel } from '@/lib/weekly-period';
import { getLevelFromClassesAttended } from '@/lib/level-mapping';

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

/**
 * GET /api/visitor/checkins
 * Fetches recent approved visitor check-ins for the active weekly period.
 */
export async function GET(req: NextRequest) {
  const { error: authError } = await requireAdmin(req);
  if (authError) return authError;

  const currentPeriod = getCurrentWeeklyPeriod();
  const nextReset = getNextResetTimestamp();
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '50', 10), 200);

  // 1. Attempt high-speed direct join query first
  const { data: joinedCheckins, error: joinErr } = await supabaseAdmin
    .from('master_contact_checkins')
    .select(`
      id, master_contact_id, phone, weekly_period, checked_in_at, approved_by, admin_email,
      master_contacts!master_contact_id (id, name, classes_attended, gender)
    `)
    .eq('weekly_period', currentPeriod)
    .order('checked_in_at', { ascending: false })
    .limit(limit);

  let logs: Array<{
    id: string;
    master_contact_id: string;
    name: string;
    phone: string;
    gender: string;
    checked_in_at: string;
    admin_email: string;
    classes_attended: number;
    level_label: string;
    badge_class: string;
  }> = [];

  if (!joinErr && joinedCheckins) {
    logs = (joinedCheckins as unknown as Array<{
      id: string;
      master_contact_id: string;
      phone: string;
      checked_in_at: string;
      admin_email: string | null;
      master_contacts?: { id?: string; name?: string; classes_attended?: number; gender?: string } | null;
    }>).map((c) => {
      const mc = c.master_contacts || {};
      const classesAttended = typeof mc.classes_attended === 'number' ? mc.classes_attended : 0;
      const levelInfo = getLevelFromClassesAttended(classesAttended);
      return {
        id: c.id,
        master_contact_id: c.master_contact_id,
        name: mc.name || 'Anonymous Visitor',
        phone: c.phone,
        gender: mc.gender || '—',
        checked_in_at: c.checked_in_at,
        admin_email: c.admin_email || 'Admin',
        classes_attended: classesAttended,
        level_label: levelInfo.displayLabel,
        badge_class: levelInfo.badgeClass,
      };
    });
  } else {
    // Fallback two-step query
    const { data: checkins, error: checkinErr } = await supabaseAdmin
      .from('master_contact_checkins')
      .select('id, master_contact_id, phone, weekly_period, checked_in_at, approved_by, admin_email')
      .eq('weekly_period', currentPeriod)
      .order('checked_in_at', { ascending: false })
      .limit(limit);

    if (checkinErr) {
      console.error('[GET /api/visitor/checkins] DB Error:', checkinErr);
      return NextResponse.json({ error: 'Failed to fetch check-in logs' }, { status: 500 });
    }

    const contactIds = Array.from(new Set((checkins || []).map((c) => c.master_contact_id).filter(Boolean)));
    const contactMap: Record<string, { name: string; classes_attended: number; gender: string }> = {};

    if (contactIds.length > 0) {
      const { data: contacts } = await supabaseAdmin
        .from('master_contacts')
        .select('id, name, classes_attended, gender')
        .in('id', contactIds);

      (contacts || []).forEach((c) => {
        contactMap[c.id] = {
          name: c.name || 'Anonymous Visitor',
          classes_attended: c.classes_attended ?? 0,
          gender: c.gender || '—',
        };
      });
    }

    logs = (checkins || []).map((c) => {
      const meta = contactMap[c.master_contact_id] || { name: 'Visitor', classes_attended: 0, gender: '—' };
      const levelInfo = getLevelFromClassesAttended(meta.classes_attended);
      return {
        id: c.id,
        master_contact_id: c.master_contact_id,
        name: meta.name,
        phone: c.phone,
        gender: meta.gender,
        checked_in_at: c.checked_in_at,
        admin_email: c.admin_email || 'Admin',
        classes_attended: meta.classes_attended,
        level_label: levelInfo.displayLabel,
        badge_class: levelInfo.badgeClass,
      };
    });
  }

  return NextResponse.json({
    logs,
    weekly_period: currentPeriod,
    weekly_period_label: formatWeeklyPeriodLabel(currentPeriod),
    next_reset: nextReset.toISOString(),
    total_period_checkins: logs.length,
  });
}
