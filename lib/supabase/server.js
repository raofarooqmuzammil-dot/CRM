import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { cache } from 'react';

export function createClient() {
  const store = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            // Called from a Server Component; middleware refreshes the session instead.
          }
        },
      },
    }
  );
}

// One client and one user lookup per request, shared by the layout and the page.
// The middleware has already verified the login, so the cookie session is read without another network call.
export const getClient = cache(() => createClient());
export const getUser = cache(async () => {
  const { data } = await getClient().auth.getSession();
  return data.session?.user ?? null;
});
