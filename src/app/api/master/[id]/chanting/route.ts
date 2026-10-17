import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

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
  if (!adminRow) return { error: NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 }) };

  return { error: null, userId: user.id };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error: authError } = await requireAdmin(request);
  if (authError) return authError;

  const { id } = await params;
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!id || !UUID_REGEX.test(id)) {
    return NextResponse.json({ error: 'Valid Contact UUID is required' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const delta = typeof body.delta === 'number' ? Math.round(body.delta) : undefined;
    const value = typeof body.value === 'number' ? Math.round(body.value) : undefined;

    if (delta === undefined && value === undefined) {
      return NextResponse.json({ error: 'Either delta or value must be provided' }, { status: 400 });
    }

    if (value !== undefined && value < 0) {
      return NextResponse.json({ error: 'Chanting count cannot be negative' }, { status: 400 });
    }

    // Try calling the atomic RPC first
    const { data: rpcResult, error: rpcErr } = await supabaseAdmin.rpc('update_master_contact_chanting', {
      p_contact_id: id,
      p_delta: delta ?? 0,
      p_set_val: value ?? null,
    });

    if (!rpcErr && typeof rpcResult === 'number') {
      return NextResponse.json({ success: true, chanting: rpcResult });
    }

    // Explicitly handle nonexistent contact error from RPC
    if (rpcErr && (rpcErr.code === 'P0002' || rpcErr.message?.includes('not found'))) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    // Fallback if RPC is not yet created in the database
    const { data: currentContact, error: fetchErr } = await supabaseAdmin
      .from('master_contacts')
      .select('id, chanting')
      .eq('id', id)
      .single();

    if (fetchErr || !currentContact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    const currentChanting = typeof currentContact.chanting === 'number' ? currentContact.chanting : 0;
    const newChanting = value !== undefined ? Math.max(0, value) : Math.max(0, currentChanting + (delta ?? 0));

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('master_contacts')
      .update({ chanting: newChanting, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('chanting')
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, chanting: updated.chanting });
  } catch (err: unknown) {
    console.error('Error updating chanting count:', err);
    return NextResponse.json({ error: 'Server error updating chanting count' }, { status: 500 });
  }
}
