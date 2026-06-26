import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (typeof window !== 'undefined') {
  throw new Error('Security Error: supabase-admin.ts must only be loaded in server-side contexts.');
}

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('Warning: Server-side Supabase admin credentials are missing.');
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
