-- Phase 8a: queue mode (Call next) and the dashboard. Run once in Supabase > SQL Editor, after the earlier files.

-- Each caller's own queue settings (off by default)
alter table profiles
  add column queue_enabled boolean not null default false,
  add column queue_auto_next boolean not null default false,
  add column queue_hours_only boolean not null default false;

-- An organization opened by "Call next" is held for 10 minutes so two callers never get the same one
alter table organizations
  add column queue_holder uuid references profiles(id) on delete set null,
  add column queue_hold_until timestamptz;

create or replace function claim_next_org(p_list uuid default null, p_no_list boolean default false, p_zones text[] default null, p_skip uuid default null)
returns uuid language plpgsql as $$
declare picked uuid;
begin
  select id into picked from organizations
   where call_count = 0 and not do_not_call and visible_to = 'everyone'
     and (queue_hold_until is null or queue_hold_until < now() or queue_holder = auth.uid())
     and (p_list is null or list_id = p_list)
     and (not p_no_list or list_id is null)
     and (p_zones is null or time_zone = any(p_zones))
     and (p_skip is null or id <> p_skip)
   order by created_at, id
   limit 1
   for update skip locked;
  if picked is null then return null; end if;
  update organizations set queue_holder = auth.uid(), queue_hold_until = now() + interval '10 minutes' where id = picked;
  return picked;
end $$;

-- Team time zone for "today" and "this week" on the dashboard
insert into app_settings (key, value) values ('team_timezone', '{"zone": "UTC"}') on conflict (key) do nothing;

-- Dashboard numbers. They run as the signed-in person, so privacy rules still apply.
-- Admin sees every caller; a caller sees only their own calls and follow-ups.
create or replace function dashboard_calls(p_tz text)
returns table (caller uuid, outcome text, bucket text, n bigint) language sql stable as $$
  with b as (select date_trunc('day', now() at time zone p_tz) at time zone p_tz as today_start,
                    date_trunc('week', now() at time zone p_tz) at time zone p_tz as week_start)
  select c.created_by, c.outcome,
         case when c.called_at >= b.today_start then 'today'
              when c.called_at >= b.week_start then 'earlier_this_week' else 'last_week' end,
         count(*)
  from call_logs c cross join b
  where c.called_at >= b.week_start - interval '7 days' and (is_admin() or c.created_by = auth.uid())
  group by 1, 2, 3
$$;

create or replace function dashboard_followups(p_tz text)
returns table (due_today bigint, overdue bigint) language sql stable as $$
  with b as (select date_trunc('day', now() at time zone p_tz) at time zone p_tz as today_start)
  select count(*) filter (where a.due_at >= b.today_start and a.due_at < b.today_start + interval '1 day'),
         count(*) filter (where a.due_at < b.today_start)
  from activities a cross join b
  where not a.done and (is_admin() or a.assigned_to = auth.uid())
$$;

create or replace function dashboard_results()
returns table (list_id uuid, outcome text, n bigint) language sql stable as $$
  select o.list_id, o.last_outcome, count(*) from organizations o group by 1, 2
$$;

create or replace function dashboard_deals()
returns table (stage_id uuid, status text, currency text, n bigint, total numeric) language sql stable as $$
  select d.stage_id, d.status, d.currency, count(*), coalesce(sum(d.value), 0) from deals d group by 1, 2, 3
$$;

create or replace function dashboard_funnel()
returns table (organizations bigint, called bigint, interested bigint, deals bigint, won bigint) language sql stable as $$
  select (select count(*) from organizations),
         (select count(*) from organizations where call_count > 0),
         (select count(distinct organization_id) from call_logs where lower(outcome) = 'interested' and organization_id is not null),
         (select count(*) from deals),
         (select count(*) from deals where status = 'won')
$$;
