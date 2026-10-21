# Call CRM (Phase 1)

Login, roles, and Persons / Organizations, with shared-by-default and private visibility.

## Set up
1. Create a free project at supabase.com.
2. In **SQL Editor**, paste and run `supabase/schema.sql`.
3. In **Authentication > Providers > Email**, turn off "Confirm email" (simpler for an internal team).
4. In **Authentication > Users**, click **Add user** and create YOUR account first. The first account becomes the admin. Then add each caller the same way.
5. Copy `.env.example` to `.env.local` and fill in the Project URL and anon key (Project Settings > API).
6. `npm install` then `npm run dev`, and open http://localhost:3000.

## Deploy
Push to GitHub, import the repo in Vercel, and add the same two environment variables.

## Notes
- Privacy is enforced in the database (row-level security), not just hidden in the screens.
- Adding users from inside the CRM comes with the admin settings phase.
