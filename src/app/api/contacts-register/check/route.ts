import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { normalizePhone } from '@/lib/master-contacts';
import { calculateNameSimilarity } from '@/lib/name-similarity';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const rawPhone = url.searchParams.get('phone') || '';
    const rawName = url.searchParams.get('name') || '';

    const cleanPhone = normalizePhone(rawPhone);
    if (!cleanPhone || cleanPhone.length !== 10) {
      return NextResponse.json({ exists: false, isDuplicate: false });
    }

    // 1. Check Master Contacts database first (authoritative identity source)
    const { data: masterContact } = await supabaseAdmin
      .from('master_contacts')
      .select('id, name, phone')
      .eq('phone', cleanPhone)
      .maybeSingle();

    if (masterContact) {
      const matchPercentage = calculateNameSimilarity(rawName, masterContact.name);
      const isSubstantiallyDifferent = rawName.trim().length >= 2 && matchPercentage < 40;

      const message = isSubstantiallyDifferent
        ? 'This mobile number is already registered under another name. Please contact the administrator if you believe this is incorrect.'
        : `Contact already exists with approximately ${matchPercentage}% name match.`;

      return NextResponse.json({
        exists: true,
        isDuplicate: true,
        matchPercentage,
        message,
        source: 'master_contacts',
      });
    }

    // 2. Check contacts_register table (exact normalized match — phone stored as 10-digit)
    const { data: contactsReg } = await supabaseAdmin
      .from('contacts_register')
      .select('id, full_name, phone')
      .eq('phone', cleanPhone)
      .maybeSingle();

    if (contactsReg) {
      const matchPercentage = calculateNameSimilarity(rawName, contactsReg.full_name);
      const isSubstantiallyDifferent = rawName.trim().length >= 2 && matchPercentage < 40;

      const message = isSubstantiallyDifferent
        ? 'This mobile number is already registered under another name. Please contact the administrator if you believe this is incorrect.'
        : `Contact already exists with approximately ${matchPercentage}% name match.`;

      return NextResponse.json({
        exists: true,
        isDuplicate: true,
        matchPercentage,
        message,
        source: 'contacts_register',
      });
    }

    return NextResponse.json({ exists: false, isDuplicate: false });
  } catch (err) {
    console.error('[GET /api/contacts-register/check] Exception:', err);
    return NextResponse.json({ exists: false, isDuplicate: false }, { status: 500 });
  }
}
