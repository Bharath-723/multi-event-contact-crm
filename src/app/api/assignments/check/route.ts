/**
 * GET /api/assignments/check?registration_id=...&source=...
 * Admin: check if a registration already has an active assignment in target source table.
 * Returns the existing operator info or null.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { normalizeSource } from '@/lib/source-resolver';

async function requireAdmin(req: Request): Promise<{ error: NextResponse | null }> {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { data: adminRow } = await supabaseAdmin.from('admins').select('id').eq('id', user.id).single();
  if (!adminRow) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { error: null };
}

export async function GET(req: Request) {
  const { error: authError } = await requireAdmin(req);
  if (authError) return authError;

  const url = new URL(req.url);
  const regId = url.searchParams.get('registration_id');
  if (!regId) return NextResponse.json({ error: 'registration_id is required' }, { status: 400 });

  const rawSource = url.searchParams.get('source');
  const source = normalizeSource(rawSource);

  const assignTable =
    source === 'krishnashtami'
      ? 'krishnashtami_contact_assignments'
      : source === 'feedback_contacts'
      ? 'feedback_contact_assignments'
      : 'contact_assignments';

  const fkCol = source === 'feedback_contacts' ? 'feedback_contact_id' : 'registration_id';
  const notesOrRemarksCol = 'notes';

  const { data, error } = await supabaseAdmin
    .from(assignTable)
    .select(`
      id, status, assigned_at, ${notesOrRemarksCol},
      contact_operators!operator_id (id, name, email, phone)
    `)
    .eq(fkCol, regId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ assignment: data ?? null, source });
}
