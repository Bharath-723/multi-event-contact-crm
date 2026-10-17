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

  // 1. Fetch checkins for current period
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

  // 2. Fetch contact names and classes_attended for these checkins
  const contactIds = Array.from(new Set((checkins || []).map((c) => c.master_contact_id)));
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

  const logs = (checkins || []).map((c) => {
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

  return NextResponse.json({
    logs,
    weekly_period: currentPeriod,
    weekly_period_label: formatWeeklyPeriodLabel(currentPeriod),
    next_reset: nextReset.toISOString(),
    total_period_checkins: logs.length,
  });
}
