import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── GET /api/services ───────────────────────────────────────────────────────
// Returns all services with assigned volunteer counts.
// Public — no auth required (needed for dropdowns).
export async function GET() {
  try {
    const { data: services, error } = await supabaseAdmin
      .from('services')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;

    // For each service compute assigned_count in a single query
    const { data: counts, error: countError } = await supabaseAdmin
      .from('registrations')
      .select('service_id')
      .not('service_id', 'is', null);

    if (countError) throw countError;

    const countMap: Record<string, number> = {};
    for (const row of (counts || [])) {
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
// Creates a new service. Requires authenticated admin session.
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin
    const { data: adminRecord } = await supabaseAdmin
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

    if (!name) {
      return NextResponse.json({ error: 'Service name is required' }, { status: 400 });
    }

    const { data: service, error: insertError } = await supabaseAdmin
      .from('services')
      .insert({ name, description, is_active: true })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json({ error: `Service "${name}" already exists` }, { status: 409 });
      }
      throw insertError;
    }

    // Audit log
    await supabaseAdmin.from('audit_logs').insert({
      admin_id: user.id,
      action: 'SERVICE_CREATED',
      details: {
        service_id: service.id,
        service_name: service.name,
        description: service.description,
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
