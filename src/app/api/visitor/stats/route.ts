import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(req: Request) {
  // Check authorization
  const authHeader = req.headers.get('Authorization') || '';
  let authorized = false;

  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (!error && user) {
      const { data: adminRow } = await supabaseAdmin
        .from('admins')
        .select('id')
        .eq('id', user.id)
        .single();
      if (adminRow) {
        authorized = true;
      }
    }
  }

  // Operators can also view stats for dashboard synchronization
  const cookieHeader = req.headers.get('cookie') || '';
  if (cookieHeader.includes('operator-session=')) {
    authorized = true;
  }

  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. Total Registered Count
    const { count: registered, error: err1 } = await supabaseAdmin
      .from('registrations')
      .select('*', { count: 'exact', head: true });

    // 2. Total Visited Count
    const { count: visited, error: err2 } = await supabaseAdmin
      .from('visitor_visits')
      .select('*', { count: 'exact', head: true });

    if (err1 || err2) {
      return NextResponse.json({ error: err1?.message || err2?.message }, { status: 500 });
    }

    // 3. Volunteer Visited Count
    const { count: volunteerVisited } = await supabaseAdmin
      .from('visitor_visits')
      .select('registrations!inner(interested_to_volunteer)', { count: 'exact', head: true })
      .eq('registrations.interested_to_volunteer', true);

    // 4. Dinner Visited Count
    const { count: dinnerCount } = await supabaseAdmin
      .from('visitor_visits')
      .select('registrations!inner(interested_to_dinner)', { count: 'exact', head: true })
      .eq('registrations.interested_to_dinner', true);

    // 5. Today's Visits Count (visits since local midnight in IST / UTC)
    // We'll calculate start of today in Asia/Kolkata (IST) if possible, or fallback to UTC midnight
    const now = new Date();
    // Default to midnight in Indian Standard Time (IST, GMT+5:30)
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).toISOString();

    const { count: todaysVisits } = await supabaseAdmin
      .from('visitor_visits')
      .select('*', { count: 'exact', head: true })
      .gte('visited_at', startOfToday);

    const totalReg = registered ?? 0;
    const totalVis = visited ?? 0;
    const remaining = Math.max(0, totalReg - totalVis);

    return NextResponse.json({
      stats: {
        registered: totalReg,
        visited: totalVis,
        remaining,
        volunteer_visited: volunteerVisited ?? 0,
        dinner_count: dinnerCount ?? 0,
        todays_visits: todaysVisits ?? 0,
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
