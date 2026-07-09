/**
 * POST /api/operators/login
 * Operator-only login — completely independent from admin Supabase Auth.
 * Sets an httpOnly JWT cookie on success.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  verifyPassword,
  createOperatorToken,
  buildSessionCookieHeader,
} from '@/lib/operator-auth';

export async function POST(req: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  // Fetch operator record
  const { data: operator, error } = await supabaseAdmin
    .from('contact_operators')
    .select('id, name, email, password_hash, is_active')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle();

  if (error || !operator) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  if (!operator.is_active) {
    return NextResponse.json({ error: 'Your account has been disabled. Contact the administrator.' }, { status: 403 });
  }

  const valid = await verifyPassword(password, operator.password_hash);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  // Update last_login_at
  await supabaseAdmin
    .from('contact_operators')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', operator.id);

  // Audit log
  await supabaseAdmin.from('audit_logs').insert({
    action: 'OPERATOR_LOGIN',
    details: { operator_id: operator.id, email: operator.email },
  });

  // Create JWT and set cookie
  const token = createOperatorToken({
    operatorId: operator.id,
    name: operator.name,
    email: operator.email,
  });

  const response = NextResponse.json({
    success: true,
    operator: { id: operator.id, name: operator.name, email: operator.email },
  });
  response.headers.set('Set-Cookie', buildSessionCookieHeader(token));
  return response;
}
