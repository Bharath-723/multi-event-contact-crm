import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/^\uFEFF/, '').trim();
const supabaseServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/^\uFEFF/, '').trim();

if (typeof window !== 'undefined') {
  throw new Error('Security Error: supabase-admin.ts must only be loaded in server-side contexts.');
}

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('Warning: Server-side Supabase admin credentials are missing.');
}

// Guard: createClient throws if url is empty. During SSG builds the env vars
// may be absent, so we fall back to a placeholder that is never actually used.
export const supabaseAdmin = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseServiceKey || 'placeholder-key',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);
