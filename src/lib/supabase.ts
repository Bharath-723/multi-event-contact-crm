import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  // This warning is expected during `next build` static page generation
  // when environment variables are not injected at build time.
  console.warn('Warning: Supabase environment variables are missing.');
}

// Guard: createClient throws if url is empty. During SSG builds the env vars
// may be absent, so we fall back to a placeholder that is never actually used.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  },
);
