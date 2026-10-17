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
    }

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
      if (eventFilteredContactIds.length === 0) {
        const { data: sourceRows } = await supabaseAdmin.from('event_sources').select('*').eq('is_active', true);
        return NextResponse.json({
          contacts: [],
          total: 0,
          page,
          limit,
          stats: {
            total_contacts: realMasterCount ?? 0,
            total_events: (sourceRows || []).length,
            this_month: 0,
            assigned_contacts: 0,
            event_breakdown: [],
          },
          filter_options: {
            areas: [],
            colleges: [],
            occupations: ['Student', 'Employee', 'Working', 'Business', 'Others'],
            standards: ['1st Year', '2nd Year', '3rd Year', '4th Year'],
            event_sources: (sourceRows || []).map((s) => ({
              source_key: s.source_key,
              display_name: s.display_name,
            })),
          },
        });
      }
    }

    // 3. Build database query on master_contacts with pagination and database-side filters
    let query = supabaseAdmin
      .from('master_contacts')
      .select('id, phone, name, age, gender, area_of_stay, company_college, chanting, classes_attended, level, created_at', { count: 'exact' });

    // ID filter if pre-filtered by events
    if (eventFilteredContactIds !== null) {
      query = query.in('id', eventFilteredContactIds);
    }

    // Direct gender filter
    if (gender) {
      query = query.ilike('gender', gender);
    }

    // Direct multi-area filter
    if (selectedAreas.length > 0) {
      query = query.in('area_of_stay', selectedAreas);
    }

    // Direct multi-company filter
    if (selectedCompanies.length > 0) {
      query = query.in('company_college', selectedCompanies);
    }

    // Global search filter (Name, Phone, Area, Company)
    if (search) {
      const q = search.trim();
      const normSearch = normalizePhone(q);
      const orClauses = [
        `name.ilike.%${q}%`,
        `area_of_stay.ilike.%${q}%`,
        `company_college.ilike.%${q}%`,
        `phone.ilike.%${q}%`,
      ];
      if (normSearch && normSearch !== q) {
        orClauses.push(`phone.ilike.%${normSearch}%`);
      }
      query = query.or(orClauses.join(','));
    }

    // Pagination
    const startIndex = isExport ? 0 : (page - 1) * limit;
    const endIndex = isExport ? limit - 1 : startIndex + limit - 1;

    query = query
      .order('created_at', { ascending: false })
      .range(startIndex, endIndex);

    // 4. Concurrently execute master contacts query, stats queries, and metadata
    const now = new Date();
    const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01T00:00:00Z`;

    const [
      contactsResult,
      thisMonthCountResult,
      assignedCountResult,
      sourceRowsResult,
      areasResult,
      collegesResult,
    ] = await Promise.all([
      query,
      supabaseAdmin
        .from('master_contacts')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', currentYearMonth),
      supabaseAdmin
        .from('master_contact_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true),
      supabaseAdmin
        .from('event_sources')
        .select('*')
        .eq('is_active', true),
      // Fetch available distinct areas
      supabaseAdmin
        .from('master_contacts')
        .select('area_of_stay')
        .not('area_of_stay', 'is', null)
        .limit(200),
      // Fetch available distinct colleges
      supabaseAdmin
        .from('master_contacts')
        .select('company_college')
        .not('company_college', 'is', null)
        .limit(200),
    ]);

    if (contactsResult.error) {
      console.error('[master-api] Query error:', contactsResult.error);
      return NextResponse.json({ error: contactsResult.error.message }, { status: 500 });
    }

    const pageContacts = contactsResult.data || [];
    const totalFilteredCount = contactsResult.count ?? pageContacts.length;
    const pageContactIds = pageContacts.map((c) => c.id);

    // 5. Fetch events and active assignments ONLY for the contacts on this page
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
      const [eventsRes, assignRes] = await Promise.all([
        supabaseAdmin
          .from('master_contact_events')
          .select('id, master_contact_id, source, event_display_name, event_record_id, event_date, standard, occupation')
          .in('master_contact_id', pageContactIds)
          .order('event_date', { ascending: false }),
        supabaseAdmin
          .from('master_contact_assignments')
          .select('id, master_contact_id, status, operator_id, is_active, contact_operators(id, name, email)')
          .in('master_contact_id', pageContactIds)
          .eq('is_active', true),
      ]);

      pageEvents = (eventsRes.data as unknown as typeof pageEvents) || [];
      pageAssignments = (assignRes.data as unknown as typeof pageAssignments) || [];
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
        operator_name: masterAssign?.operator_name || null,
        assignment_status: masterAssign?.status || null,
        operator_id: masterAssign?.operator_id || null,
        chanting: typeof m.chanting === 'number' ? m.chanting : 0,
        classes_attended: typeof m.classes_attended === 'number' ? m.classes_attended : 0,
        created_at: String(m.created_at || ''),
        events: eventAssignments,
      };
    });

    // 7. Distinct filter options
    const registeredSources = (sourceRowsResult.data || []).map((s) => ({
      source_key: s.source_key,
      display_name: s.display_name,
    }));

    const availableAreas = Array.from(
      new Set((areasResult.data || []).map((r) => r.area_of_stay ? String(r.area_of_stay).trim() : '').filter(Boolean))
    ).sort();

    const availableColleges = Array.from(
      new Set((collegesResult.data || []).map((r) => r.company_college ? String(r.company_college).trim() : '').filter(Boolean))
    ).sort();

    const availableOccupations = ['Student', 'Employee', 'Working', 'Business', 'Others'];
    const availableStandards = ['1st Year', '2nd Year', '3rd Year', '4th Year'];

    const eventBreakdown = registeredSources.map((s) => ({
      source: s.source_key,
      event_display_name: s.display_name,
      count: 0,
    }));

    return NextResponse.json({
      contacts: formattedContacts,
      total: totalFilteredCount,
      page: isExport ? 1 : page,
      limit: isExport ? totalFilteredCount : limit,
      stats: {
        total_contacts: realMasterCount ?? totalFilteredCount,
        total_events: registeredSources.length,
        this_month: thisMonthCountResult.count ?? 0,
        assigned_contacts: assignedCountResult.count ?? 0,
        event_breakdown: eventBreakdown,
      },
      filter_options: {
        areas: availableAreas,
        colleges: availableColleges,
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
    return NextResponse.json({ success: true, message: 'Backfill completed successfully.' });
  } catch (err) {
    console.error('POST /api/master error:', err);
    return NextResponse.json({ error: 'Failed to run backfill' }, { status: 500 });
  }
}
