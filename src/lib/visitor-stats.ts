import { supabaseAdmin } from './supabase-admin';

export interface VisitorStats {
  registered: number;
  visited: number;
  remaining: number;
  volunteer_visited: number;
  dinner_count: number;
  todays_visits: number;
}

export async function getVisitorStats(festivalEventId?: string | null): Promise<VisitorStats> {
  // ── All queries MUST be scoped to festivalEventId when supplied ──────────────
  // NOTE: .eq('registrations.festival_event_id', ...) on embedded !inner joins
  // is silently dropped by some PostgREST versions for count-head queries.
  // Instead we use a two-step pattern: fetch registration IDs for the festival,
  // then apply .in('registration_id', ids) to visitor_visits.
  // This guarantees correct SQL-level filtering in all cases.

  // ── STEP 1: Resolve the registration IDs for this festival ──────────────────
  let registrationIds: string[] | null = null; // null = no festival filter

  if (festivalEventId) {
    const { data: regRows, error: regErr } = await supabaseAdmin
      .from('registrations')
      .select('id')
      .eq('festival_event_id', festivalEventId);

    if (regErr) throw new Error('Failed to fetch registration IDs: ' + regErr.message);
    registrationIds = (regRows ?? []).map((r) => r.id);
    // If festival has zero registrations, return all-zero stats immediately.
    if (registrationIds.length === 0) {
      return { registered: 0, visited: 0, remaining: 0, volunteer_visited: 0, dinner_count: 0, todays_visits: 0 };
    }
  }

  // ── 1. Total Registered Count ─────────────────────────────────────────────
  let query1 = supabaseAdmin
    .from('registrations')
    .select('*', { count: 'exact', head: true });
  if (festivalEventId) {
    query1 = query1.eq('festival_event_id', festivalEventId);
  }
  const { count: registered, error: err1 } = await query1;
  if (err1) throw new Error('Failed to fetch registered count: ' + err1.message);

  // ── 2. Total Visited Count ─────────────────────────────────────────────────
  // Use .in('registration_id', registrationIds) — direct, reliable SQL filter.
  let query2 = supabaseAdmin
    .from('visitor_visits')
    .select('*', { count: 'exact', head: true });
  if (registrationIds !== null) {
    query2 = query2.in('registration_id', registrationIds);
  }
  const { count: visited, error: err2 } = await query2;
  if (err2) throw new Error('Failed to fetch visited count: ' + err2.message);

  // ── 3. Volunteer Visited Count ────────────────────────────────────────────
  // Intersect visitor_visits with volunteer registration IDs in this festival.
  let volunteerVisited = 0;
  if (registrationIds !== null) {
    // Among registrations in this festival, find volunteer ones
    const { data: volRows, error: volErr } = await supabaseAdmin
      .from('registrations')
      .select('id')
      .eq('festival_event_id', festivalEventId!)
      .eq('interested_to_volunteer', true);
    if (volErr) throw new Error('Failed to fetch volunteer IDs: ' + volErr.message);
    const volunteerIds = (volRows ?? []).map((r) => r.id);
    if (volunteerIds.length > 0) {
      const { count: vc, error: err3 } = await supabaseAdmin
        .from('visitor_visits')
        .select('*', { count: 'exact', head: true })
        .in('registration_id', volunteerIds);
      if (err3) throw new Error('Failed to fetch volunteer visited count: ' + err3.message);
      volunteerVisited = vc ?? 0;
    }
  } else {
    // No festival filter — count all volunteer visits globally
    const { data: volRows } = await supabaseAdmin
      .from('registrations')
      .select('id')
      .eq('interested_to_volunteer', true);
    const volunteerIds = (volRows ?? []).map((r) => r.id);
    if (volunteerIds.length > 0) {
      const { count: vc } = await supabaseAdmin
        .from('visitor_visits')
        .select('*', { count: 'exact', head: true })
        .in('registration_id', volunteerIds);
      volunteerVisited = vc ?? 0;
    }
  }

  // ── 4. Dinner Count ───────────────────────────────────────────────────────
  let query4 = supabaseAdmin
    .from('registrations')
    .select('*', { count: 'exact', head: true })
    .eq('interested_to_dinner', true);
  if (festivalEventId) {
    query4 = query4.eq('festival_event_id', festivalEventId);
  }
  const { count: dinnerCount, error: err4 } = await query4;
  if (err4) throw new Error('Failed to fetch dinner count: ' + err4.message);

  // ── 5. Today's Visits ─────────────────────────────────────────────────────
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  let query5 = supabaseAdmin
    .from('visitor_visits')
    .select('*', { count: 'exact', head: true })
    .gte('visited_at', startOfToday.toISOString());
  if (registrationIds !== null) {
    query5 = query5.in('registration_id', registrationIds);
  }
  const { count: todaysVisits, error: err5 } = await query5;
  if (err5) throw new Error("Failed to fetch today's visits: " + err5.message);

  const totalReg = registered ?? 0;
  const totalVis = visited ?? 0;
  const remaining = Math.max(0, totalReg - totalVis);

  return {
    registered: totalReg,
    visited: totalVis,
    remaining,
    volunteer_visited: volunteerVisited,
    dinner_count: dinnerCount ?? 0,
    todays_visits: todaysVisits ?? 0,
  };
}
