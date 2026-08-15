import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const phone = url.searchParams.get('phone') || '';
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);

    if (cleanPhone.length < 10) {
      return NextResponse.json({ exists: false });
    }

    const { data: existing } = await supabaseAdmin
      .from('feedback_contacts')
      .select('id')
      .ilike('phone', `%${cleanPhone}`)
      .maybeSingle();

    return NextResponse.json({ exists: Boolean(existing) });
  } catch (err) {
    console.error('[GET /api/feedback/check] Exception:', err);
    return NextResponse.json({ exists: false });
  }
}
