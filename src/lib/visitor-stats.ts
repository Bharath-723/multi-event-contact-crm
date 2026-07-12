import { supabaseAdmin } from './supabase-admin';

export interface VisitorStats {
  registered: number;
  visited: number;
  remaining: number;
  volunteer_visited: number;
  dinner_count: number;
  todays_visits: number;
}

export async function getVisitorStats(): Promise<VisitorStats> {
  // 1. Total Registered Count
  const { count: registered, error: err1 } = await supabaseAdmin
    .from('registrations')
    .select('*', { count: 'exact', head: true });

  if (err1) throw new Error('Failed to fetch registered count: ' + err1.message);

  // 2. Total Visited Count (visitor_visits table count)
  const { count: visited, error: err2 } = await supabaseAdmin
    .from('visitor_visits')
    .select('*', { count: 'exact', head: true });

  if (err2) throw new Error('Failed to fetch visited count: ' + err2.message);

  // 3. Volunteer Visited Count
  // visitor_visits joined with registrations where interested_to_volunteer = true
  const { count: volunteerVisited, error: err3 } = await supabaseAdmin
    .from('visitor_visits')
    .select('registrations!inner(interested_to_volunteer)', { count: 'exact', head: true })
    .eq('registrations.interested_to_volunteer', true);

  if (err3) throw new Error('Failed to fetch volunteer visited count: ' + err3.message);

  // 4. Dinner Count (Total registrations who checked interested_to_dinner)
  const { count: dinnerCount, error: err4 } = await supabaseAdmin
    .from('registrations')
    .select('*', { count: 'exact', head: true })
    .eq('interested_to_dinner', true);

  if (err4) throw new Error('Failed to fetch dinner count: ' + err4.message);

  // 5. Today's Visits (visits in visitor_visits table where visited_at is today in local time)
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const { count: todaysVisits, error: err5 } = await supabaseAdmin
    .from('visitor_visits')
    .select('*', { count: 'exact', head: true })
    .gte('visited_at', startOfToday.toISOString());

  if (err5) throw new Error("Failed to fetch today's visits: " + err5.message);

  const totalReg = registered ?? 0;
  const totalVis = visited ?? 0;
  const remaining = Math.max(0, totalReg - totalVis);

  return {
    registered: totalReg,
    visited: totalVis,
    remaining,
    volunteer_visited: volunteerVisited ?? 0,
    dinner_count: dinnerCount ?? 0,
    todays_visits: todaysVisits ?? 0,
  };
}
