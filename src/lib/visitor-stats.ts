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
  let visited = 0;
  try {
    if (sourceConfig.isKrishnashtami || !registrationIds) {
      const { count: vCount, error: err2 } = await supabaseAdmin
        .from(visitsTable)
        .select('*', { count: 'exact', head: true });
      if (!err2 && vCount !== null) visited = vCount;
      else if (err2) console.warn('[visitor-stats] Warning fetching visited count:', err2.message);
    } else {
      // Chunked count to prevent PostgREST URL query length limit (400 Bad Request)
      const CHUNK_SIZE = 100;
      let total = 0;
      for (let i = 0; i < registrationIds.length; i += CHUNK_SIZE) {
        const chunk = registrationIds.slice(i, i + CHUNK_SIZE);
        const { count: c, error: cErr } = await supabaseAdmin
          .from(visitsTable)
          .select('*', { count: 'exact', head: true })
          .in('registration_id', chunk);
        if (!cErr && c !== null) total += c;
        else if (cErr) {
          console.warn('[visitor-stats] Warning fetching visited chunk:', cErr.message);
        }
      }
      visited = total;
    }
  } catch (err) {
    console.warn('[visitor-stats] Error in visited count query:', err);
  }

  // ── 3. Volunteer Visited Count ────────────────────────────────────────────
  let volunteerVisited = 0;
  if (registrationIds !== null) {
    try {
      let volQuery = supabaseAdmin
        .from(regTable)
        .select('id')
        .eq('interested_to_volunteer', true);

      if (!sourceConfig.isKrishnashtami && festivalEventId) {
        volQuery = volQuery.eq('festival_event_id', festivalEventId);
      }

      const { data: volRows, error: volErr } = await volQuery;
      const volunteerIds = (volRows ?? []).map((r) => r.id);
      if (!volErr && volunteerIds.length > 0) {
        const CHUNK_SIZE = 100;
        let totalVol = 0;
        for (let i = 0; i < volunteerIds.length; i += CHUNK_SIZE) {
          const chunk = volunteerIds.slice(i, i + CHUNK_SIZE);
          const { count: vc, error: err3 } = await supabaseAdmin
            .from(visitsTable)
            .select('*', { count: 'exact', head: true })
            .in('registration_id', chunk);
          if (!err3 && vc !== null) totalVol += vc;
          else if (err3) console.warn('[visitor-stats] Warning fetching volunteer visits:', err3.message);
        }
        volunteerVisited = totalVol;
      }
    } catch (err) {
      console.warn('[visitor-stats] Error in volunteer visited query:', err);
    }
  }

  // ── 4. Prasadam / Dinner Count ─────────────────────────────────────────────
  let dinnerCount = 0;
  if (festivalEventId) {
    try {
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
        if (!err4 && dc !== null) dinnerCount = dc;
      }
    } catch (err) {
      console.warn('[visitor-stats] Error in dinner count query:', err);
    }
  }

  // ── 5. Today's Visits ─────────────────────────────────────────────────────
  let todaysVisits = 0;
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    if (sourceConfig.isKrishnashtami || !registrationIds) {
      const { count: tvCount, error: err5 } = await supabaseAdmin
        .from(visitsTable)
        .select('*', { count: 'exact', head: true })
        .gte('visited_at', startOfToday.toISOString());
      if (!err5 && tvCount !== null) todaysVisits = tvCount;
    } else {
      const CHUNK_SIZE = 100;
      let totalToday = 0;
      for (let i = 0; i < registrationIds.length; i += CHUNK_SIZE) {
        const chunk = registrationIds.slice(i, i + CHUNK_SIZE);
        const { count: tvCount, error: err5 } = await supabaseAdmin
          .from(visitsTable)
          .select('*', { count: 'exact', head: true })
          .gte('visited_at', startOfToday.toISOString())
          .in('registration_id', chunk);
        if (!err5 && tvCount !== null) totalToday += tvCount;
      }
      todaysVisits = totalToday;
    }
  } catch (err) {
    console.warn('[visitor-stats] Error in todays visits query:', err);
  }

  const totalReg = registered ?? 0;
  const totalVis = visited;
  const remaining = Math.max(0, totalReg - totalVis);

  return {
    registered: totalReg,
    visited: totalVis,
    remaining,
    volunteer_visited: volunteerVisited,
    dinner_count: dinnerCount,
    todays_visits: todaysVisits,
  };
}
