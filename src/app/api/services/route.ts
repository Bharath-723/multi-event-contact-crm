import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { supabase } from '@/lib/supabase';
import { getRegistrationSource } from '@/lib/source-resolver';

const client = supabaseAdmin || supabase;

// ─── GET /api/services ───────────────────────────────────────────────────────
// Returns canonical service catalog with assigned volunteer counts strictly scoped to the selected festival.
export async function GET(req: NextRequest) {
  try {
    const festivalEventId = req.nextUrl.searchParams.get('festival_event_id');
    const sourceConfig = getRegistrationSource(festivalEventId);
    const regTable = sourceConfig.isKrishnashtami ? 'krishnashtami_registrations' : 'registrations';

    // Fetch all services from master services catalog
    const { data: services, error } = await client
      .from('services')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;

    // Fetch assigned volunteer count strictly for the selected festival
    let query = client.from(regTable).select('service_id').not('service_id', 'is', null);
    if (!sourceConfig.isKrishnashtami && festivalEventId) {
      query = query.eq('festival_event_id', festivalEventId);
    }

    const { data: assignments, error: assignErr } = await query;
    if (assignErr) throw assignErr;

    const countMap: Record<string, number> = {};
    for (const row of (assignments || [])) {
      if (row.service_id) {
        countMap[row.service_id] = (countMap[row.service_id] || 0) + 1;
      }
    }

    const enriched = (services || []).map((s) => ({
      ...s,
      assigned_count: countMap[s.id] || 0,
    }));

    return NextResponse.json({ services: enriched });
  } catch (err) {
    console.error('[GET /api/services]', err);
    return NextResponse.json({ error: 'Failed to fetch services' }, { status: 500 });
  }
}

// ─── POST /api/services ──────────────────────────────────────────────────────
// Creates a new service in canonical services table. Requires authenticated admin session.
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await client.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin
    const { data: adminRecord } = await client
      .from('admins')
      .select('id')
      .eq('id', user.id)
      .single();

    if (!adminRecord) {
      return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });
    }

    const body = await req.json();
    const name = body.name?.trim();
    const description = body.description?.trim() || null;
    const festival_event_id = body.festival_event_id || null;

    if (!name) {
      return NextResponse.json({ error: 'Service name is required' }, { status: 400 });
    }

    const insertPayload: Record<string, unknown> = {
      name,
      description,
      is_active: true,
    };
    if (festival_event_id) {
      insertPayload.festival_event_id = festival_event_id;
    }

    const { data: service, error: insertError } = await client
      .from('services')
      .insert(insertPayload)
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json({ error: `Service "${name}" already exists` }, { status: 409 });
      }
      throw insertError;
    }

    // Audit log
    await client.from('audit_logs').insert({
      admin_id: user.id,
      action: 'SERVICE_CREATED',
      details: {
        service_id: service.id,
        service_name: service.name,
        description: service.description,
        festival_event_id,
        admin_email: user.email,
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({ service }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/services]', err);
    return NextResponse.json({ error: 'Failed to create service' }, { status: 500 });
  }
}

