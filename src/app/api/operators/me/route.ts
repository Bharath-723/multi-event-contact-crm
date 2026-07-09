/**
 * GET /api/operators/me
 * Returns the current operator's session info from the httpOnly cookie.
 * Used by the operator portal to hydrate session state on page load.
 */
import { NextResponse } from 'next/server';
import { getOperatorSessionFromRequest } from '@/lib/operator-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(req: Request) {
  const session = getOperatorSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Fetch fresh operator data (check is_active in case they were disabled)
  const { data: operator, error } = await supabaseAdmin
    .from('contact_operators')
    .select('id, name, email, phone, is_active')
    .eq('id', session.operatorId)
    .single();

  if (error || !operator) {
    return NextResponse.json({ error: 'Operator not found' }, { status: 404 });
  }

  if (!operator.is_active) {
    return NextResponse.json({ error: 'Account disabled' }, { status: 403 });
  }

  return NextResponse.json({ operator });
}
