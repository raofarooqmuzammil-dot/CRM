import { createClient } from '@supabase/supabase-js';

// Server-only client with full access. Used only by the admin Team page.
// Never import this into a client component or expose the key to the browser.
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
