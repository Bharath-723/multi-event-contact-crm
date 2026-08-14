import { supabaseAdmin } from '@/lib/supabase-admin';
import { supabase } from '@/lib/supabase';

export async function resolveFestivalDetailsFromHost(hostHeader: string | null): Promise<{ id: string; slug: string }> {
  const host = (hostHeader || '').toLowerCase();

  let targetSlug = 'krishnashtami-2026';
  if (host.includes('rathayatra')) {
    targetSlug = 'rathayatra-2026';
  } else if (host.includes('krishnashtami')) {
    targetSlug = 'krishnashtami-2026';
  }

  // Fetch event ID & slug from Supabase
  const client = supabaseAdmin || supabase;
  const { data } = await client
    .from('festival_events')
    .select('id, slug')
    .eq('slug', targetSlug)
    .single();

  if (data?.id) {
    return { id: data.id, slug: data.slug };
  }

  // Fallback to active event
  const { data: activeData } = await client
    .from('festival_events')
    .select('id, slug')
    .eq('is_active', true)
    .eq('registration_open', true)
    .limit(1)
    .single();

  return {
    id: activeData?.id || '7852cff8-e784-4e91-b990-a9838ea59ff1',
    slug: activeData?.slug || targetSlug,
  };
}

export async function resolveFestivalEventFromHost(hostHeader: string | null): Promise<string> {
  const details = await resolveFestivalDetailsFromHost(hostHeader);
  return details.id;
}
