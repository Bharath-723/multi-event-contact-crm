import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { backfillAllSources, normalizePhone, normalizeOccupation } from '@/lib/master-contacts';
import {
  getMasterMetadata,
  expandAreaSelections,
  expandCompanySelections,
  invalidateMasterMetadataCache,
} from '@/lib/master-filters';

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

export async function GET(request: NextRequest) {
  const { error: authError } = await requireAdmin(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const search = url.searchParams.get('search')?.trim() || '';
  const gender = url.searchParams.get('gender')?.trim() || '';
  const occupation = url.searchParams.get('occupation')?.trim() || '';
  const rawAreaParams = [
    ...url.searchParams.getAll('area'),
    ...url.searchParams.getAll('areas'),
  ];
  const selectedAreas = Array.from(
    new Set(
      rawAreaParams
        .flatMap((a) => a.split(','))
        .map((a) => a.trim())
        .filter(Boolean)
    )
  );

  const rawCompanyParams = [
    ...url.searchParams.getAll('company'),
    ...url.searchParams.getAll('companies'),
  ];
  const selectedCompanies = Array.from(
    new Set(
      rawCompanyParams
        .flatMap((c) => c.split(','))
        .map((c) => c.trim())
        .filter(Boolean)
    )
  );
  const standard = url.searchParams.get('standard')?.trim() || '';
  const eventSource = url.searchParams.get('event_source')?.trim() || '';
  const dateStr = url.searchParams.get('date')?.trim() || '';
  const blockedParam = url.searchParams.get('blocked')?.trim().toLowerCase() || '';
  const statusParam = url.searchParams.get('status')?.trim().toLowerCase() || '';
  const isExport = url.searchParams.get('export') === 'true' || url.searchParams.get('limit') === 'all';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limitParam = url.searchParams.get('limit');
  const limit = isExport ? 50000 : Math.max(1, Math.min(200, parseInt(limitParam || '25', 10)));

  try {
    // 1. Check if backfill is required (only on empty table)
    const { count: realMasterCount } = await supabaseAdmin
      .from('master_contacts')
      .select('id', { count: 'exact', head: true });

    if (realMasterCount === 0 || realMasterCount === null) {
      await backfillAllSources();
      invalidateMasterMetadataCache();
    }

    // Fetch registered active event sources
    const { data: sourceRows } = await supabaseAdmin
      .from('event_sources')
      .select('*')
      .eq('is_active', true);

    const registeredSources = (sourceRows || []).map((s) => ({
      source_key: s.source_key,
      display_name: s.display_name,
    }));

    // Fetch complete cached metadata (all distinct areas, colleges, raw variant mappings, and event breakdown)
    const metadata = await getMasterMetadata(registeredSources);

    // 2. Pre-filter master_contact_ids using event criteria if event filters are active
    const hasEventFilters = Boolean(occupation || standard || eventSource || dateStr);
    let eventFilteredContactIds: string[] | null = null;

    if (hasEventFilters) {
      let eventQuery = supabaseAdmin
        .from('master_contact_events')
        .select('master_contact_id');

      if (occupation) {
        eventQuery = eventQuery.ilike('occupation', `%${occupation}%`);
      }
      if (standard) {
        eventQuery = eventQuery.ilike('standard', `%${standard}%`);
      }
      if (eventSource) {
        eventQuery = eventQuery.or(`source.eq.${eventSource},event_display_name.ilike.%${eventSource}%`);
      }
      if (dateStr) {
        eventQuery = eventQuery.gte('event_date', `${dateStr}T00:00:00Z`).lte('event_date', `${dateStr}T23:59:59Z`);
      }

      const { data: matchedEvents, error: evtErr } = await eventQuery;
      if (evtErr) {
        console.error('[master-api] Event filter query error:', evtErr);
      }

      const idSet = new Set<string>();
      (matchedEvents || []).forEach((e) => {
        if (e.master_contact_id) idSet.add(String(e.master_contact_id));
      });

      eventFilteredContactIds = Array.from(idSet);

      // If event filters were provided but matched 0 contact IDs, return empty early
      // Preserve the complete filter_options and event_breakdown so UI dropdowns remain fully functional
      if (eventFilteredContactIds.length === 0) {
        return NextResponse.json({
          contacts: [],
          total: 0,
          page,
          limit,
          stats: {
            total_contacts: realMasterCount ?? metadata.totalContacts,
            total_events: registeredSources.length,
            this_month: 0,
            assigned_contacts: 0,
            event_breakdown: metadata.eventBreakdown,
          },
          filter_options: {
            areas: metadata.areas,
            colleges: metadata.colleges,
            occupations: ['Student', 'Employee', 'Working', 'Business', 'Others'],
            standards: ['1st Year', '2nd Year', '3rd Year', '4th Year'],
            event_sources: registeredSources,
          },
        });
      }
    }

    // 3. Build database query on master_contacts with pagination and database-side filters
    let query = supabaseAdmin
      .from('master_contacts')
      .select('id, phone, name, age, gender, area_of_stay, company_college, chanting, classes_attended, level, created_at, is_not_interested, not_interested_at, not_interested_by', { count: 'exact' });

    // Blocked / Not Interested exclusion filter
    if (blockedParam === 'true' || statusParam === 'blocked' || statusParam === 'not_interested') {
      query = query.eq('is_not_interested', true);
    } else if (blockedParam === 'false' || statusParam === 'eligible' || statusParam === 'active') {
      query = query.eq('is_not_interested', false);
    }

    // ID filter if pre-filtered by events
    if (eventFilteredContactIds !== null) {
      query = query.in('id', eventFilteredContactIds);
    }

    // Direct gender filter
    if (gender) {
      query = query.ilike('gender', gender);
    }

    // Direct multi-area filter with case-insensitive / raw variant expansion (boolean OR)
    const expandedAreas = expandAreaSelections(selectedAreas, metadata);
    if (expandedAreas.length > 0) {
      query = query.in('area_of_stay', expandedAreas);
    }

    // Direct multi-company filter with case-insensitive / raw variant expansion (boolean OR)
    const expandedCompanies = expandCompanySelections(selectedCompanies, metadata);

    // Helper to build master contacts query
    const buildMasterContactsQuery = (includeIsNotInterested: boolean = true) => {
      const fields = includeIsNotInterested
        ? 'id, phone, name, age, gender, area_of_stay, company_college, chanting, classes_attended, level, created_at, is_not_interested, not_interested_at, not_interested_by'
        : 'id, phone, name, age, gender, area_of_stay, company_college, chanting, classes_attended, level, created_at';

      let q = (supabaseAdmin.from('master_contacts') as any).select(fields, { count: 'exact' });

      if (includeIsNotInterested) {
        if (blockedParam === 'true' || statusParam === 'blocked' || statusParam === 'not_interested') {
          q = q.eq('is_not_interested', true);
        } else if (blockedParam === 'false' || statusParam === 'eligible' || statusParam === 'active') {
          q = q.eq('is_not_interested', false);
        }
      }

      if (eventFilteredContactIds !== null) {
        q = q.in('id', eventFilteredContactIds);
      }
      if (gender) {
        q = q.ilike('gender', gender);
      }
      if (expandedAreas.length > 0) {
        q = q.in('area_of_stay', expandedAreas);
      }
      if (expandedCompanies.length > 0) {
        q = q.in('company_college', expandedCompanies);
      }
      if (search) {
        const term = search.trim();
        const norm = normalizePhone(term);
        const orClauses = [
          `name.ilike.%${term}%`,
          `area_of_stay.ilike.%${term}%`,
          `company_college.ilike.%${term}%`,
          `phone.ilike.%${term}%`,
        ];
        if (norm && norm !== term) {
          orClauses.push(`phone.ilike.%${norm}%`);
        }
        q = q.or(orClauses.join(','));
      }

      return q;
    };

    // 4. Fetch contacts (batched loop for isExport to bypass 1000-record Supabase limit; single range for normal pages)
    let pageContacts: Array<Record<string, unknown>> = [];
    let totalFilteredCount = 0;
    let hasNotInterestedCol = true;

    if (isExport) {
      const pageSize = 1000;
      let fromIdx = 0;
      while (true) {
        let bQuery = buildMasterContactsQuery(hasNotInterestedCol)
          .order('created_at', { ascending: false })
          .range(fromIdx, fromIdx + pageSize - 1);

        let { data: bData, count: bCount, error: bErr } = await bQuery;

        if (bErr && (bErr.code === '42703' || bErr.message?.includes('is_not_interested'))) {
          hasNotInterestedCol = false;
          bQuery = buildMasterContactsQuery(false)
            .order('created_at', { ascending: false })
            .range(fromIdx, fromIdx + pageSize - 1);
          const retry = await bQuery;
          bData = retry.data;
          bCount = retry.count;
          bErr = retry.error;
        }

        if (bErr) {
          console.error('[master-api] Export batch query error:', bErr);
          return NextResponse.json({ error: bErr.message }, { status: 500 });
        }

        if (bCount !== null && bCount !== undefined && totalFilteredCount === 0) {
          totalFilteredCount = bCount;
        }

        if (!bData || bData.length === 0) break;
        pageContacts.push(...((bData || []) as unknown as Array<Record<string, unknown>>));
        if (bData.length < pageSize) break;
        fromIdx += pageSize;
      }
      if (totalFilteredCount === 0) {
        totalFilteredCount = pageContacts.length;
      }
    } else {
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit - 1;

      let singleQuery = buildMasterContactsQuery(hasNotInterestedCol)
        .order('created_at', { ascending: false })
        .range(startIndex, endIndex);

      let { data: sData, count: sCount, error: sErr } = await singleQuery;
      if (sErr && (sErr.code === '42703' || sErr.message?.includes('is_not_interested'))) {
        hasNotInterestedCol = false;
        singleQuery = buildMasterContactsQuery(false)
          .order('created_at', { ascending: false })
          .range(startIndex, endIndex);
        const retry = await singleQuery;
        sData = retry.data;
        sCount = retry.count;
        sErr = retry.error;
      }

      if (sErr) {
        console.error('[master-api] Query error:', sErr);
        return NextResponse.json({ error: sErr.message }, { status: 500 });
      }

      pageContacts = ((sData || []) as unknown as Array<Record<string, unknown>>);
      totalFilteredCount = sCount ?? pageContacts.length;
    }

    // Concurrently execute stats queries
    const now = new Date();
    const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01T00:00:00Z`;

    const [thisMonthCountResult, assignedCountResult] = await Promise.all([
      supabaseAdmin
        .from('master_contacts')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', currentYearMonth),
      supabaseAdmin
        .from('master_contact_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true),
    ]);

    const pageContactIds = pageContacts.map((c) => String(c.id));

    // 5. Fetch events and active assignments in safe 200-id chunks to prevent query length overflow
    let pageEvents: Array<{
      id: string;
      master_contact_id: string;
      source: string;
      event_display_name: string;
      event_record_id: string;
      event_date: string;
      standard?: string | null;
      occupation?: string | null;
    }> = [];

    let pageAssignments: Array<{
      id: string;
      master_contact_id: string;
      status: string;
      operator_id: string;
      contact_operators: { id: string; name: string; email: string } | null;
    }> = [];

    if (pageContactIds.length > 0) {
      const CHUNK_SIZE = 200;
      for (let i = 0; i < pageContactIds.length; i += CHUNK_SIZE) {
        const chunk = pageContactIds.slice(i, i + CHUNK_SIZE);
        const [eventsRes, assignRes] = await Promise.all([
          supabaseAdmin
            .from('master_contact_events')
            .select('id, master_contact_id, source, event_display_name, event_record_id, event_date, standard, occupation')
            .in('master_contact_id', chunk)
            .order('event_date', { ascending: false }),
          supabaseAdmin
            .from('master_contact_assignments')
            .select('id, master_contact_id, status, operator_id, is_active, contact_operators(id, name, email)')
            .in('master_contact_id', chunk)
            .eq('is_active', true),
        ]);

        if (eventsRes.data) pageEvents.push(...(eventsRes.data as unknown as typeof pageEvents));
        if (assignRes.data) pageAssignments.push(...(assignRes.data as unknown as typeof pageAssignments));
      }
    }

    // Map page events and assignments
    const eventsByMasterId: Record<string, typeof pageEvents> = {};
    const standardByMasterId: Record<string, string> = {};
    const occupationByMasterId: Record<string, string> = {};

    pageEvents.forEach((e) => {
      const mId = String(e.master_contact_id);
      if (!eventsByMasterId[mId]) {
        eventsByMasterId[mId] = [];
      }
      const cleanOcc = normalizeOccupation(e.occupation);
      eventsByMasterId[mId].push({
        ...e,
        occupation: cleanOcc,
      });

      if (e.standard && !standardByMasterId[mId]) {
        standardByMasterId[mId] = String(e.standard);
      }
      if (cleanOcc && !occupationByMasterId[mId]) {
        occupationByMasterId[mId] = cleanOcc;
      }
    });

    const masterAssignmentMap: Record<string, { operator_id: string; operator_name: string; status: string }> = {};
    pageAssignments.forEach((a) => {
      const opName = a.contact_operators?.name || 'Assigned';
      masterAssignmentMap[a.master_contact_id] = {
        operator_id: a.operator_id,
        operator_name: opName,
        status: a.status || 'assigned',
      };
    });

    // 6. Format response items
    const formattedContacts = pageContacts.map((m) => {
      const masterId = String(m.id);
      const contactEvents = eventsByMasterId[masterId] || [];
      const mStandard = standardByMasterId[masterId] || null;
      const mOccupation = occupationByMasterId[masterId] || null;
      const mLevel = m.level ? String(m.level) : 'level-0';
      const masterAssign = masterAssignmentMap[masterId] || null;

      const eventAssignments = contactEvents.map((e) => ({
        id: e.id,
        source: e.source,
        event_display_name: e.event_display_name,
        event_record_id: e.event_record_id,
        event_date: e.event_date,
        operator_name: masterAssign?.operator_name || null,
        status: masterAssign?.status || null,
      }));

      return {
        id: masterId,
        phone: String(m.phone),
        name: m.name ? String(m.name) : '—',
        age: m.age !== null && m.age !== undefined ? Number(m.age) : null,
        gender: m.gender ? String(m.gender) : '—',
        area_of_stay: m.area_of_stay ? String(m.area_of_stay) : '—',
        company_college: m.company_college ? String(m.company_college) : '—',
        occupation: mOccupation || '—',
        standard: mStandard || null,
        level: mLevel,
        is_not_interested: Boolean(m.is_not_interested),
        not_interested_at: m.not_interested_at ? String(m.not_interested_at) : null,
        not_interested_by: m.not_interested_by ? String(m.not_interested_by) : null,
        operator_name: masterAssign?.operator_name || null,
        assignment_status: masterAssign?.status || null,
        operator_id: masterAssign?.operator_id || null,
        chanting: typeof m.chanting === 'number' ? m.chanting : 0,
        classes_attended: typeof m.classes_attended === 'number' ? m.classes_attended : 0,
        created_at: String(m.created_at || ''),
        events: eventAssignments,
      };
    });

    // 7. Response with complete distinct filter options and calculated event breakdown
    const availableOccupations = ['Student', 'Employee', 'Working', 'Business', 'Others'];
    const availableStandards = ['1st Year', '2nd Year', '3rd Year', '4th Year'];

    return NextResponse.json({
      contacts: formattedContacts,
      total: totalFilteredCount,
      page: isExport ? 1 : page,
      limit: isExport ? totalFilteredCount : limit,
      stats: {
        total_contacts: realMasterCount ?? metadata.totalContacts,
        total_events: registeredSources.length,
        this_month: thisMonthCountResult.count ?? 0,
        assigned_contacts: assignedCountResult.count ?? 0,
        event_breakdown: metadata.eventBreakdown,
      },
      filter_options: {
        areas: metadata.areas,
        colleges: metadata.colleges,
        occupations: availableOccupations,
        standards: availableStandards,
        event_sources: registeredSources,
      },
    });
  } catch (err) {
    console.error('GET /api/master error:', err);
    return NextResponse.json(
      { error: 'Server error retrieving master contacts' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const { error: authError } = await requireAdmin(request);
  if (authError) return authError;

  try {
    await backfillAllSources();
    invalidateMasterMetadataCache();
    return NextResponse.json({ success: true, message: 'Backfill completed successfully.' });
  } catch (err) {
    console.error('POST /api/master error:', err);
    return NextResponse.json({ error: 'Failed to run backfill' }, { status: 500 });
  }
}

