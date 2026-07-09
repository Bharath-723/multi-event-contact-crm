/**
 * POST /api/operators/logout
 * Clears the operator session cookie.
 */
import { NextResponse } from 'next/server';
import { getOperatorSessionFromRequest, buildClearCookieHeader } from '@/lib/operator-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(req: Request) {
  const session = getOperatorSessionFromRequest(req);

  if (session?.operatorId) {
    // Audit log
    await supabaseAdmin.from('audit_logs').insert({
      action: 'OPERATOR_LOGOUT',
      details: { operator_id: session.operatorId, email: session.email },
    });
  }

  const response = NextResponse.json({ success: true });
  response.headers.set('Set-Cookie', buildClearCookieHeader());
  return response;
}
