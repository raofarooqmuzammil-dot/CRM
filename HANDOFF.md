# Call CRM: handoff for a new chat

Read this first, then read the code before changing anything. Owner: Ninja (admin). Claude writes all the code.

## How Ninja wants to work
- Brainstorm first. NEVER write or change code until he says "go".
- Short, plain answers (he is often on a phone). Ask at most one question at a time.
- Before sending a zip: build it, run the tests, give update steps, and name any new SQL file.
- He hit Claude usage limits, so keep chats short and avoid rewriting working files.

## Stack and deploy
- Next.js 14 (App Router, plain JavaScript), Supabase (Postgres, auth, row-level security), Vercel. Free tiers.
- Deploy: files go to GitHub, Vercel redeploys. KNOWN PROBLEM: his browser uploads flattened folders, leaving loose files in the repo root while the old app/, components/, lib/ stayed live. Always have him check GitHub shows paths like `app/(app)/results/page.js` before committing, or use GitHub Desktop. A way to confirm the new version is live: the Import page shows "Which list is this file?" and the top bar has Results.
- Vercel env vars (type Config, not Secret): NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY. SUPABASE_SERVICE_ROLE_KEY is a Secret, used only by the Team page (add users, remove access). Never expose it.
- SQL files in `supabase/`, run once each in this order: schema, phase1b, phase1c, phase1d, phase2a, phase3a, phase3b, phase4a, phase5a, phase6a, phase7a. `clear_test_data.sql` is optional and deletes records.

## Product rules already decided
- Roles: admin and caller. Shared by default; "Private" = owner and admin only (enforced by row-level security). Only admin deletes records. Callers can import, add list/labels/roles and other settings (shared by the team). Custom columns: anyone can add, only admin renames/hides/deletes.
- ORGANIZATIONS are the main calling page. Calls, outcomes, follow-ups, call history, call count, Do Not Call, "Sam called 20 minutes ago" banner live there. Persons are contacts of an organization (with a Role). Calls to a contact also roll up into the organization's history and totals (database triggers).
- Call form: outcome button, "Who did you speak to?" (role, existing contact, or new contact), note, next follow-up date. There is no big "schedule" form, only "+ Add task, meeting or demo".
- Lists (industries such as NEMT, Roofers, HVAC): one list per organization, tabs with counts, bulk "Move to list", can be created in Settings, Import, Quick add, and the Organizations tabs. Labels are separate tags.
- Import: each row becomes an organization. A contact person is created only if a Contact name/phone/email column is matched. Duplicates (phone, email, name) are FLAGGED with orange "Duplicate:" labels and never merged. A "where this file will go" summary shows before import. Admin can undo an import; a whole import can be put in a list.
- Quick add creates an organization (plus optional contact name) with a live duplicate check.
- Time zones on organizations and persons; guessed from sheet/address/phone when missing and marked "guessed". Business hours (admin setting) drive the "Calling now" filter.
- Results board: one column per latest call result; Interested column has Create deal.
- Deals: pipeline board (six default stages), won/lost with reasons, USD/GBP/AUD. Deal forms take organization and contact NAMES (find or create), not dropdowns.
- Organizations and Persons have a List view (default, roomy Pipedrive-style rows: name, phone, local time, result badge, last called, next follow-up, owner) and a Grid view (spreadsheet with cell editing, Columns button, bulk Move to list). A List/Grid switch (remembered per browser), a Sort by dropdown, and a Filters button sit above. Numbered pages (50/100/200) work in both views. Cards view was discussed but not built.
- Removing a user = ban login (Supabase ban_duration), mark profiles.disabled, hand records and open follow-ups to a chosen person. Restorable. No hard delete.
- Dropped for good: CloudTalk integration, personal columns, separate Leads list, admin dialing mode.

## File map
- `app/(app)/...` pages: today, quick-add, persons (+[id]), organizations (+[id]), results, deals (+[id]), import, settings (+fields, +pipelines), team. `app/login`.
- `app/actions/*.js` server actions: grid (cell saves, bulk list move), import, quickadd, results (create deal), team (remove/restore access), fields, lists.
- `components/`: Grid, Pager, ResultsBoard, LogCall, ScheduleForm, ImportWizard, QuickAdd, Agenda, CustomFields, LabelTags, LocalTime, AddColumn, MoveStage.
- `lib/`: supabase/server.js (cached getClient/getUser), gridrows.js (grid columns, sort, rows), pager.js, results.js (board queries), zones.js, tzguess.js, hours.js, custom.js, orgs.js, lists.js, deals.js, who.js, money.js.
- `supabase/*.sql` migrations. `tests/` see below.

## Tests (run both before sending any zip)
- `bash tests/run-tests.sh` runs about 150 logic checks on plain Node using an in-memory fake of Supabase (`tests/fake.mjs`). It turns the server action files into testable copies. The fake is simple: extend it when a new query method is needed.
- `bash tests/run-sql-tests.sh` runs all migrations on a scratch local Postgres and tests the database rules (call totals, privacy, follow-up dates). Needs a local Postgres with psql.
- Not covered by tests: real browser clicking, real Supabase/PostgREST behavior (embedded filters like `organizations!inner`), Vercel. Say so when reporting.
- Build check: `NEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=x npx next build`.

## Gotchas learned the hard way
- Server actions defined inside a page must not capture functions from the page (it crashed scheduling). Keep helpers at module level or in `lib/`.
- PostgREST embeds need explicit FK hints when a table has two links to the same table, e.g. `profiles!organizations_owner_id_fkey`, `profiles!persons_owner_id_fkey`. Do not add a second FK from persons to organizations.
- Internal bookkeeping keys that start with "_" must be stripped before inserting (an old import bug).
- Unique keys (phone_key = last 9 digits, email_key, name_key) are generated database columns used for duplicate matching.
- `lib/supabase/server.js` getUser reads the cookie session (middleware already verified it) to save a network call per page.
- React adds `<!-- -->` between text pieces in server-rendered HTML; match text carefully in render tests.
- Row-level security makes updates affect zero rows silently; actions check `.select('id')` to report "no permission".

## Open items (not built)
1. Confirm the live site runs the newest version and test everything on the real setup (only practice data so far).
2. Check how the new List view looks on his live site and phone; adjust from his feedback or screenshot.
3. Queue mode (planned, approved): OPTIONAL and per caller, off by default. A "Call next" button opens the next never-called organization in the list tab being viewed, skipping Do Not Call and private records; optional auto-open next after logging; an organization opened this way is held for 10 minutes for that caller (needs 2 small columns); optional business-hours-only filter.
4. Dashboard (planned, approved): Today vs this week; calls per caller (admin sees all, callers see their own); results per list; conversion by stage with a Called > Interested > Deal > Won funnel. Uses one team time zone for "today" (a Settings option).
5. Deals: custom columns, follow-ups attached to a deal.
6. Phone-screen and visual cleanup.
7. Removed users still appear in owner dropdowns, and an already logged-in session can last up to about an hour after removal.
