import { supabaseAdmin } from '@/lib/supabase-admin';
import { supabase } from '@/lib/supabase';

export async function resolveFestivalEventFromHost(hostHeader: string | null): Promise<string> {
  const host = (hostHeader || '').toLowerCase();

  let targetSlug = 'krishnashtami-2026';
  if (host.includes('rathayatra')) {
    targetSlug = 'rathayatra-2026';
  } else if (host.includes('krishnashtami')) {
    targetSlug = 'krishnashtami-2026';
  }

  // Fetch event ID from Supabase
  const client = supabaseAdmin || supabase;
  const { data } = await client
    .from('festival_events')
    .select('id')
    .eq('slug', targetSlug)
    .single();

  if (data?.id) {
    return data.id;
  }

  // Fallback to active event
  const { data: activeData } = await client
    .from('festival_events')
    .select('id')
    .eq('is_active', true)
    .eq('registration_open', true)
    .limit(1)
    .single();

  return activeData?.id || '7b649ca3-1a22-4809-9bd1-a9689e47262f';
}
