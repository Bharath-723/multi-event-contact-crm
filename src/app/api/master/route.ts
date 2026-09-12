import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { backfillAllSources, normalizePhone, normalizeOccupation } from '@/lib/master-contacts';

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
  const area = url.searchParams.get('area')?.trim() || '';
  const company = url.searchParams.get('company')?.trim() || '';
  const standard = url.searchParams.get('standard')?.trim() || '';
  const eventSource = url.searchParams.get('event_source')?.trim() || '';
  const dateStr = url.searchParams.get('date')?.trim() || '';
  const isExport = url.searchParams.get('export') === 'true' || url.searchParams.get('limit') === 'all';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limitParam = url.searchParams.get('limit');
  const limit = isExport ? 100000 : Math.max(1, Math.min(200, parseInt(limitParam || '25', 10)));

  try {
    // 1. DYNAMIC COUNT: Fetch exact total row count from master_contacts directly
    const { count: realMasterCount } = await supabaseAdmin
      .from('master_contacts')
      .select('*', { count: 'exact', head: true });

    if (realMasterCount === 0 || realMasterCount === null) {
      await backfillAllSources();
    }

    // 2. Fetch master_contacts in batch pages
    let allMasters: Array<Record<string, unknown>> = [];
    let from = 0;
    const batchSize = 1000;
    let hasMore = true;

    while (hasMore && from < 50000) {
      const { data: batch, error: batchErr } = await supabaseAdmin
        .from('master_contacts')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, from + batchSize - 1);

      if (batchErr || !batch || batch.length === 0) {
        hasMore = false;
      } else {
        allMasters = allMasters.concat(batch);
        if (batch.length < batchSize) hasMore = false;
        else from += batchSize;
      }
    }

    const totalDatabaseMasterContacts = realMasterCount ?? allMasters.length;

    // 3. Fetch master_contact_events (chunked)
    let allEvents: Array<Record<string, unknown>> = [];
    let evtFrom = 0;
    let evtHasMore = true;

    while (evtHasMore && evtFrom < 50000) {
      const { data: evtBatch } = await supabaseAdmin
        .from('master_contact_events')
        .select('*')
        .order('event_date', { ascending: false })
        .range(evtFrom, evtFrom + batchSize - 1);

      if (!evtBatch || evtBatch.length === 0) {
        evtHasMore = false;
      } else {
        allEvents = allEvents.concat(evtBatch);
        if (evtBatch.length < batchSize) evtHasMore = false;
        else evtFrom += batchSize;
      }
    }

    // Map master_contact_id -> array of events & derive standard/occupation strictly
    const eventsByMasterId: Record<string, Array<{
      id: string;
      source: string;
      event_display_name: string;
      event_record_id: string;
      event_date: string;
      standard?: string | null;
      occupation?: string | null;
    }>> = {};

    const standardByMasterId: Record<string, string> = {};
    const occupationByMasterId: Record<string, string> = {};

    (allEvents || []).forEach((e) => {
      const masterId = String(e.master_contact_id);
      if (!eventsByMasterId[masterId]) {
        eventsByMasterId[masterId] = [];
      }
      const rawOcc = e.occupation ? String(e.occupation) : null;
      const cleanOcc = normalizeOccupation(rawOcc);

      eventsByMasterId[masterId].push({
        id: String(e.id),
        source: String(e.source),
        event_display_name: String(e.event_display_name),
        event_record_id: String(e.event_record_id),
        event_date: String(e.event_date),
        standard: e.standard ? String(e.standard) : null,
        occupation: cleanOcc,
      });

      if (e.standard && !standardByMasterId[masterId]) {
        standardByMasterId[masterId] = String(e.standard);
      }
      if (cleanOcc && !occupationByMasterId[masterId]) {
        occupationByMasterId[masterId] = cleanOcc;
      }
    });

    // 4. Fetch dedicated Master Dashboard active assignments
    const { data: masterAssignments } = await supabaseAdmin
      .from('master_contact_assignments')
      .select('id, master_contact_id, status, operator_id, is_active, contact_operators(id, name, email)')
      .eq('is_active', true);

    const masterAssignmentMap: Record<string, { operator_id: string; operator_name: string; status: string }> = {};

    (masterAssignments || []).forEach((a) => {
      const opName = (a.contact_operators as unknown as { name: string } | null)?.name || 'Assigned';
      masterAssignmentMap[a.master_contact_id] = {
        operator_id: a.operator_id,
        operator_name: opName,
        status: a.status || 'assigned',
      };
    });

    // 5. Fetch registered event sources
    const { data: sourceRows } = await supabaseAdmin
      .from('event_sources')
      .select('*')
      .eq('is_active', true);

    const registeredSources = (sourceRows || []).map((s) => ({
      source_key: s.source_key,
      display_name: s.display_name,
    }));

    // 6. Filter Master Contacts with AND semantics
    const mastersList = allMasters || [];

    const filteredMasters = mastersList.filter((m) => {
      const masterId = String(m.id);
      const contactEvents = eventsByMasterId[masterId] || [];
      const mStandard = standardByMasterId[masterId] || null;
      const mOccupation = occupationByMasterId[masterId] || null;

      // Search filter (Name, Phone, Area, Company)
      if (search) {
        const q = search.toLowerCase();
        const normSearch = normalizePhone(q);
        const matchName = m.name ? String(m.name).toLowerCase().includes(q) : false;
        const matchPhone = String(m.phone).includes(q) || (normSearch.length > 0 && String(m.phone).includes(normSearch));
        const matchArea = m.area_of_stay ? String(m.area_of_stay).toLowerCase().includes(q) : false;
        const matchCompany = m.company_college ? String(m.company_college).toLowerCase().includes(q) : false;

        if (!matchName && !matchPhone && !matchArea && !matchCompany) {
          return false;
        }
      }

      // Gender filter
      if (gender && m.gender && String(m.gender).toLowerCase() !== gender.toLowerCase()) {
        return false;
      }

      // Occupation filter (STRICT: Student, Employee, Working, Business ONLY)
      if (occupation) {
        const occTerm = occupation.toLowerCase();
        const matchOcc = (mOccupation && mOccupation.toLowerCase() === occTerm) ||
                         contactEvents.some(e => e.occupation?.toLowerCase() === occTerm);
        if (!matchOcc) return false;
      }

      // Area filter
      if (area && m.area_of_stay && String(m.area_of_stay).toLowerCase() !== area.toLowerCase()) {
        return false;
      }

      // Company / College filter
      if (company && m.company_college && String(m.company_college).toLowerCase() !== company.toLowerCase()) {
        return false;
      }

      // Standard filter (1st Year, 2nd Year, 3rd Year, 4th Year)
      if (standard) {
        const stdTerm = standard.toLowerCase();
        const matchStd = (mStandard && mStandard.toLowerCase() === stdTerm) ||
                         contactEvents.some(e => e.standard?.toLowerCase() === stdTerm);
        if (!matchStd) return false;
      }

      // Event Attended filter
      if (eventSource) {
        const hasSource = contactEvents.some((e) => e.source === eventSource || e.event_display_name.toLowerCase().includes(eventSource.toLowerCase()));
        if (!hasSource) return false;
      }

      // Date filter (YYYY-MM-DD)
      if (dateStr) {
        const hasDate = contactEvents.some((e) => e.event_date && e.event_date.slice(0, 10) === dateStr);
        if (!hasDate) return false;
      }

      return true;
    });

    // 7. Paginate (or return full matching dataset for export/full-print)
    const totalFilteredCount = filteredMasters.length;
    const startIndex = isExport ? 0 : (page - 1) * limit;
    const paginatedMasters = isExport ? filteredMasters : filteredMasters.slice(startIndex, startIndex + limit);

    // Format response items
    const formattedContacts = paginatedMasters.map((m) => {
      const masterId = String(m.id);
      const contactEvents = eventsByMasterId[masterId] || [];
      const mStandard = standardByMasterId[masterId] || null;
      const mOccupation = occupationByMasterId[masterId] || null;
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
        operator_name: masterAssign?.operator_name || null,
        assignment_status: masterAssign?.status || null,
        operator_id: masterAssign?.operator_id || null,
        created_at: String(m.created_at || ''),
        events: eventAssignments,
      };
    });

    // 8. Stats & Filter Options
    const allEventSources = new Set(
      (allEvents || []).map((e) => String(e.event_display_name))
    );

    const now = new Date();
    const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const thisMonthCount = mastersList.filter(
      (m) => m.created_at && String(m.created_at).slice(0, 7) === currentYearMonth
    ).length;

    const assignedContactsCount = Object.keys(masterAssignmentMap).length;

    const eventBreakdownMap: Record<string, { source: string; event_display_name: string; contact_ids: Set<string> }> = {};

    (allEvents || []).forEach((e) => {
      const source = String(e.source || '');
      const eventDisplayName = String(e.event_display_name || '');
      const masterId = String(e.master_contact_id || '');
      const key = source || eventDisplayName;

      if (!eventBreakdownMap[key]) {
        eventBreakdownMap[key] = {
          source,
          event_display_name: eventDisplayName,
          contact_ids: new Set(),
        };
      }
      if (masterId) eventBreakdownMap[key].contact_ids.add(masterId);
    });

    const eventBreakdown = Object.values(eventBreakdownMap).map((eb) => ({
      source: eb.source,
      event_display_name: eb.event_display_name,
      count: eb.contact_ids.size,
    })).sort((a, b) => a.event_display_name.localeCompare(b.event_display_name));

    const availableAreas = Array.from(
      new Set(mastersList.map((m) => m.area_of_stay ? String(m.area_of_stay).trim() : '').filter(Boolean))
    ).sort();

    const availableColleges = Array.from(
      new Set(mastersList.map((m) => m.company_college ? String(m.company_college).trim() : '').filter(Boolean))
    ).sort();

    const availableOccupations = ['Student', 'Employee', 'Working', 'Business'];
    const availableStandards = ['1st Year', '2nd Year', '3rd Year', '4th Year'];

    return NextResponse.json({
      contacts: formattedContacts,
      total: totalFilteredCount,
      page: isExport ? 1 : page,
      limit: isExport ? totalFilteredCount : limit,
      stats: {
        total_contacts: totalDatabaseMasterContacts,
        total_events: allEventSources.size,
        this_month: thisMonthCount,
        assigned_contacts: assignedContactsCount,
        event_breakdown: eventBreakdown,
      },
      filter_options: {
        areas: availableAreas,
        colleges: availableColleges,
        occupations: availableOccupations,
        standards: availableStandards,
        event_sources: Array.from(allEventSources).map((displayName) => {
          const matched = registeredSources.find((s) => s.display_name === displayName);
          return {
            source_key: matched?.source_key || displayName.toLowerCase().replace(/\s+/g, '_'),
            display_name: displayName,
          };
        }),
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
    return NextResponse.json({ success: true, message: 'Backfill completed successfully.' });
  } catch (err) {
    console.error('POST /api/master error:', err);
    return NextResponse.json({ error: 'Failed to run backfill' }, { status: 500 });
  }
}
