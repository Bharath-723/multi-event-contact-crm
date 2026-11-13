import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getCurrentWeeklyPeriod } from '@/lib/weekly-period';
import { archiveAndGetVisitorHistory } from '@/lib/visitor-history';

// Require Admin Helper
async function requireAdmin(req: Request): Promise<{ error: NextResponse | null }> {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const { data: adminRow } = await supabaseAdmin
    .from('admins')
    .select('id')
    .eq('id', user.id)
    .single();

  if (!adminRow) return { error: NextResponse.json({ error: 'Forbidden: Not an admin' }, { status: 403 }) };

  return { error: null };
}

/**
 * GET /api/saturday-meetup/history
 *
 * Returns permanently archived Saturday Meetup visitor history records organized by date.
 * Automatically archives any past weekly period before returning.
 */
export async function GET(req: NextRequest) {
  const { error: authError } = await requireAdmin(req);
  if (authError) return authError;

  const currentPeriod = getCurrentWeeklyPeriod();

  try {
    const history = await archiveAndGetVisitorHistory(currentPeriod);
    return NextResponse.json({
      success: true,
      current_weekly_period: currentPeriod,
      history,
    });
  } catch (err: unknown) {
    console.error('[GET /api/saturday-meetup/history] Server exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

