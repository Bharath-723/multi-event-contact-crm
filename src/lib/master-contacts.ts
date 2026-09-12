import { supabaseAdmin } from './supabase-admin';

// ─── Phone Normalization Rule ──────────────────────────────────────────────────
/**
 * Canonical Indian Mobile Phone Normalization Rule.
 */
export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  let cleaned = phone.replace(/\D/g, '');

  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    cleaned = cleaned.slice(2);
  } else if (cleaned.length === 11 && cleaned.startsWith('0')) {
    cleaned = cleaned.slice(1);
  }

  if (cleaned.length === 10 && /^[6-9]\d{9}$/.test(cleaned)) {
    return cleaned;
  }

  return cleaned;
}

/**
 * Strict Master Occupation Normalization Rule:
 * Master Dashboard strictly supports ONLY 4 occupation categories:
 * - Student
 * - Employee
 * - Working
 * - Business
 * 
 * Academic branches (CSE, Civil, ECE, EEE, Mechanical, etc.) and arbitrary strings MUST NOT be treated as occupations.
 */
export function normalizeOccupation(val: string | null | undefined): string | null {
  if (!val) return null;
  const trimmed = val.trim();
  const lower = trimmed.toLowerCase();

  // Strict exact matches
  if (trimmed === 'Student') return 'Student';
  if (trimmed === 'Employee') return 'Employee';
  if (trimmed === 'Working') return 'Working';
  if (trimmed === 'Business') return 'Business';

  // Semantic keyword mapping
  if (['student', 'studying', 'college', 'school', 'pursuing'].some(k => lower.includes(k))) {
    return 'Student';
  }
  if (['employee', 'employed'].some(k => lower.includes(k))) {
    return 'Employee';
  }
  if (['working', 'job', 'software', 'it', 'private', 'govt', 'government', 'service'].some(k => lower.includes(k))) {
    return 'Working';
  }
  if (['business', 'self employed', 'self-employed', 'entrepreneur', 'shop', 'owner'].some(k => lower.includes(k))) {
    return 'Business';
  }

  // If value is a branch or unclassified string, return null (displays as '—')
  return null;
}

export interface MasterContactRecord {
  id: string;
  phone: string;
  name: string | null;
  age: number | null;
  gender: string | null;
  area_of_stay: string | null;
  company_college: string | null;
  latest_registration_at: string;
  latest_registration_source: string | null;
  latest_registration_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MasterEventRecord {
  id: string;
  master_contact_id: string;
  phone: string;
  source: string;
  event_display_name: string;
  event_record_id: string;
  event_date: string;
  occupation?: string | null;
  standard?: string | null;
  service_id?: string | null;
  interested_to_volunteer?: string | null;
  created_at: string;
}

export interface EventSourceConfig {
  source_key: string;
  display_name: string;
  table_name: string;
  is_active: boolean;
}

export async function syncMasterContact(params: {
  source: string;
  event_display_name: string;
  event_record_id: string;
  phone: string;
  name?: string | null;
  age?: number | null;
  gender?: string | null;
  area_of_stay?: string | null;
  company_college?: string | null;
  occupation?: string | null;
  standard?: string | null;
  service_id?: string | null;
  interested_to_volunteer?: string | null;
  event_date?: string | null;
}): Promise<string | null> {
  const normPhone = normalizePhone(params.phone);
  if (!normPhone) return null;

  const eventDate = params.event_date || new Date().toISOString();
  const cleanOccupation = normalizeOccupation(params.occupation);

  // Fetch existing master contact
  const { data: existingMaster } = await supabaseAdmin
    .from('master_contacts')
    .select('*')
    .eq('phone', normPhone)
    .maybeSingle();

  let masterId = existingMaster?.id;

  if (existingMaster) {
    const existingTime = new Date(existingMaster.latest_registration_at || 0).getTime();
    const incomingTime = new Date(eventDate).getTime();
    const isNewer = incomingTime >= existingTime;

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (isNewer) {
      if (params.name) updatePayload.name = params.name;
      if (params.age !== undefined && params.age !== null) updatePayload.age = params.age;
      if (params.gender) updatePayload.gender = params.gender;
      if (params.area_of_stay) updatePayload.area_of_stay = params.area_of_stay;
      if (params.company_college) updatePayload.company_college = params.company_college;
      updatePayload.latest_registration_at = eventDate;
      updatePayload.latest_registration_source = params.source;
      updatePayload.latest_registration_id = params.event_record_id;
    } else {
      if (params.name && !existingMaster.name) updatePayload.name = params.name;
      if (params.age && !existingMaster.age) updatePayload.age = params.age;
      if (params.gender && !existingMaster.gender) updatePayload.gender = params.gender;
      if (params.area_of_stay && !existingMaster.area_of_stay) updatePayload.area_of_stay = params.area_of_stay;
      if (params.company_college && !existingMaster.company_college) updatePayload.company_college = params.company_college;
    }

    if (Object.keys(updatePayload).length > 1) {
      await supabaseAdmin
        .from('master_contacts')
        .update(updatePayload)
        .eq('id', masterId);
    }
  } else {
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from('master_contacts')
      .insert({
        phone: normPhone,
        name: params.name || null,
        age: params.age || null,
        gender: params.gender || null,
        area_of_stay: params.area_of_stay || null,
        company_college: params.company_college || null,
        latest_registration_at: eventDate,
        latest_registration_source: params.source,
        latest_registration_id: params.event_record_id,
        created_at: eventDate,
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (insErr) {
      const { data: raceMaster } = await supabaseAdmin
        .from('master_contacts')
        .select('id')
        .eq('phone', normPhone)
        .maybeSingle();
      masterId = raceMaster?.id;
    } else {
      masterId = inserted?.id;
    }
  }

  if (!masterId) return null;

  const eventPayload: Record<string, unknown> = {
    master_contact_id: masterId,
    phone: normPhone,
    source: params.source,
    event_display_name: params.event_display_name,
    event_record_id: params.event_record_id,
    event_date: eventDate,
    occupation: cleanOccupation,
    standard: params.standard || null,
    service_id: params.service_id || null,
    interested_to_volunteer: params.interested_to_volunteer || null,
  };

  await supabaseAdmin
    .from('master_contact_events')
    .upsert(eventPayload, { onConflict: 'source,event_record_id' });

  return masterId;
}

export async function backfillAllSources(): Promise<{
  rathayatra_count: number;
  krishnashtami_count: number;
  feedback_count: number;
  total_synced: number;
}> {
  const { data: ksRegs } = await supabaseAdmin
    .from('krishnashtami_registrations')
    .select('id, full_name, phone, age, gender, area_of_stay, company_college, occupation, standard, service_id, interested_to_volunteer, created_at');

  const { data: ryRegs } = await supabaseAdmin
    .from('registrations')
    .select('id, full_name, phone, age, gender, area_of_stay, company_college, occupation, service_id, interested_to_volunteer, created_at');

  const { data: fbRegs } = await supabaseAdmin
    .from('feedback_contacts')
    .select('id, full_name, phone, gender, current_stay, college_name, branch, created_at');

  const allRecords: Array<{
    source: string;
    event_display_name: string;
    event_record_id: string;
    phone: string;
    name?: string | null;
    age?: number | null;
    gender?: string | null;
    area_of_stay?: string | null;
    company_college?: string | null;
    occupation?: string | null;
    standard?: string | null;
    service_id?: string | null;
    interested_to_volunteer?: string | null;
    event_date: string;
  }> = [];

  if (ksRegs) {
    for (const r of ksRegs) {
      allRecords.push({
        source: 'krishnashtami',
        event_display_name: 'Krishnashtami 2026',
        event_record_id: String(r.id),
        phone: String(r.phone),
        name: r.full_name,
        age: r.age,
        gender: r.gender,
        area_of_stay: r.area_of_stay,
        company_college: r.company_college,
        occupation: r.occupation,
        standard: r.standard,
        service_id: r.service_id,
        interested_to_volunteer: r.interested_to_volunteer === true ? 'Yes' : r.interested_to_volunteer === false ? 'No' : null,
        event_date: r.created_at || '1970-01-01T00:00:00Z',
      });
    }
  }

  if (ryRegs) {
    for (const r of ryRegs) {
      allRecords.push({
        source: 'rathayatra',
        event_display_name: 'Rathayatra 2026',
        event_record_id: String(r.id),
        phone: String(r.phone),
        name: r.full_name,
        age: r.age,
        gender: r.gender,
        area_of_stay: r.area_of_stay,
        company_college: r.company_college,
        occupation: r.occupation,
        service_id: r.service_id,
        interested_to_volunteer: r.interested_to_volunteer === true ? 'Yes' : r.interested_to_volunteer === false ? 'No' : null,
        event_date: r.created_at || '1970-01-01T00:00:00Z',
      });
    }
  }

  if (fbRegs) {
    for (const r of fbRegs) {
      // Feedback branch is college branch (CSE, Civil, etc.), NOT occupation.
      // Append branch to company_college if present, leave occupation null so standard classifier handles it.
      const companyWithBranch = r.college_name
        ? r.college_name + (r.branch ? ` (${r.branch})` : '')
        : r.branch || null;

      allRecords.push({
        source: 'feedback_contacts',
        event_display_name: 'Feedback Contact',
        event_record_id: String(r.id),
        phone: String(r.phone),
        name: r.full_name,
        gender: r.gender,
        area_of_stay: r.current_stay,
        company_college: companyWithBranch,
        occupation: null, // DO NOT map branch to occupation!
        event_date: r.created_at || '1970-01-01T00:00:00Z',
      });
    }
  }

  allRecords.sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime());

  let ryCount = 0;
  let ksCount = 0;
  let fbCount = 0;

  for (const rec of allRecords) {
    await syncMasterContact(rec);
    if (rec.source === 'rathayatra') ryCount++;
    else if (rec.source === 'krishnashtami') ksCount++;
    else if (rec.source === 'feedback_contacts') fbCount++;
  }

  return {
    rathayatra_count: ryCount,
    krishnashtami_count: ksCount,
    feedback_count: fbCount,
    total_synced: allRecords.length,
  };
}
