import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  getCurrentVisitorWeeklyPeriod,
  getNextVisitorResetTimestamp,
  formatVisitorWeeklyPeriodLabel,
} from '@/lib/weekly-period';
import { getLevelFromClassesAttended } from '@/lib/level-mapping';

// In-memory rate limiting map for checkin logs (IP -> { count, resetAt })
const checkinsRateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string, maxRequests = 60, windowMs = 60000): boolean {
  const now = Date.now();
  const entry = checkinsRateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    checkinsRateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) {
    return false;
  }
  entry.count++;
  return true;
}

function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return '127.0.0.1';
}

/**
 * GET /api/visitor/checkins
 * Publicly accessible endpoint to fetch recent approved visitor check-ins for the active weekly period.
 */
export async function GET(req: NextRequest) {
  const clientIp = getClientIp(req);
  if (!checkRateLimit(clientIp, 60, 60000)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment.' },
      { status: 429 }
    );
  }

  const currentPeriod = getCurrentVisitorWeeklyPeriod();
  const nextReset = getNextVisitorResetTimestamp();
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
        admin_email: c.admin_email || 'Public Reception Desk',
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
        admin_email: c.admin_email || 'Public Reception Desk',
        classes_attended: meta.classes_attended,
        level_label: levelInfo.displayLabel,
        badge_class: levelInfo.badgeClass,
      };
    });
  }

  return NextResponse.json({
    logs,
    weekly_period: currentPeriod,
    weekly_period_label: formatVisitorWeeklyPeriodLabel(currentPeriod),
    next_reset: nextReset.toISOString(),
    total_period_checkins: logs.length,
  });
}
