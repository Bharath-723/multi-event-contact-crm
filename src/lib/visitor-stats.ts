import { supabaseAdmin } from './supabase-admin';
import { getRegistrationSource } from './source-resolver';

export interface VisitorStats {
  registered: number;
  visited: number;
  remaining: number;
  volunteer_visited: number;
  dinner_count: number;
  todays_visits: number;
}

export async function getVisitorStats(festivalEventId?: string | null): Promise<VisitorStats> {
  const sourceConfig = getRegistrationSource(festivalEventId ?? null);
  const regTable = sourceConfig.regTable;
  const visitsTable = sourceConfig.visitsTable;
  const prasadamTable = sourceConfig.prasadamTable;

  // ── STEP 1: Resolve the registration IDs for this festival ──────────────────
  let registrationIds: string[] | null = null;

  if (festivalEventId) {
    let regQuery = supabaseAdmin
      .from(regTable)
      .select('id');

    if (!sourceConfig.isKrishnashtami) {
      regQuery = regQuery.eq('festival_event_id', festivalEventId);
    }

    const { data: regRows, error: regErr } = await regQuery;
    if (regErr) throw new Error('Failed to fetch registration IDs: ' + regErr.message);
    registrationIds = (regRows ?? []).map((r) => r.id);
    if (registrationIds.length === 0) {
      return { registered: 0, visited: 0, remaining: 0, volunteer_visited: 0, dinner_count: 0, todays_visits: 0 };
    }
  }

  // ── 1. Total Registered Count ─────────────────────────────────────────────
  let query1 = supabaseAdmin
    .from(regTable)
    .select('*', { count: 'exact', head: true });

  if (festivalEventId && !sourceConfig.isKrishnashtami) {
    query1 = query1.eq('festival_event_id', festivalEventId);
  }
  const { count: registered, error: err1 } = await query1;
  if (err1) throw new Error('Failed to fetch registered count: ' + err1.message);

  // ── 2. Total Visited Count ─────────────────────────────────────────────────
  let query2 = supabaseAdmin
    .from(visitsTable)
    .select('*', { count: 'exact', head: true });

  if (registrationIds !== null) {
    query2 = query2.in('registration_id', registrationIds);
  }
  const { count: visited, error: err2 } = await query2;
  if (err2) throw new Error('Failed to fetch visited count: ' + err2.message);

  // ── 3. Volunteer Visited Count ────────────────────────────────────────────
  let volunteerVisited = 0;
  if (registrationIds !== null) {
    let volQuery = supabaseAdmin
      .from(regTable)
      .select('id')
      .eq('interested_to_volunteer', true);

    if (!sourceConfig.isKrishnashtami && festivalEventId) {
      volQuery = volQuery.eq('festival_event_id', festivalEventId);
    }

    const { data: volRows, error: volErr } = await volQuery;
    if (volErr) throw new Error('Failed to fetch volunteer IDs: ' + volErr.message);
    const volunteerIds = (volRows ?? []).map((r) => r.id);
    if (volunteerIds.length > 0) {
      const { count: vc, error: err3 } = await supabaseAdmin
        .from(visitsTable)
        .select('*', { count: 'exact', head: true })
        .in('registration_id', volunteerIds);
      if (err3) throw new Error('Failed to fetch volunteer visited count: ' + err3.message);
      volunteerVisited = vc ?? 0;
    }
  }

  // ── 4. Prasadam / Dinner Count ─────────────────────────────────────────────
  let dinnerCount = 0;
  if (festivalEventId) {
    let pQuery = supabaseAdmin
      .from(prasadamTable)
      .select('*', { count: 'exact', head: true });

    if (!sourceConfig.isKrishnashtami) {
      pQuery = pQuery.eq('festival_event_id', festivalEventId);
    }

    const { count: pc, error: pErr } = await pQuery;

    if (!pErr && pc !== null && pc > 0) {
      dinnerCount = pc;
    } else {
      let query4 = supabaseAdmin
        .from(regTable)
        .select('*', { count: 'exact', head: true })
        .eq('interested_to_dinner', true);

      if (!sourceConfig.isKrishnashtami) {
        query4 = query4.eq('festival_event_id', festivalEventId);
      }
      const { count: dc, error: err4 } = await query4;
      if (err4) throw new Error('Failed to fetch dinner count: ' + err4.message);
      dinnerCount = dc ?? 0;
    }
  }

  // ── 5. Today's Visits ─────────────────────────────────────────────────────
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  let query5 = supabaseAdmin
    .from(visitsTable)
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
