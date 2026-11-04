-- Phase 10a: remember when an organization was last Interested, for "was Interested" badges, the Lost interest view,
-- and the dashboard card. Run once in Supabase > SQL Editor, after the earlier files.
alter table organizations add column last_interested_at timestamptz;
alter table persons add column last_interested_at timestamptz;
alter table deals add column lost_prompt_dismissed_at timestamptz;   -- "Keep open" on the open-deal prompt

-- Every logged call keeps the totals up to date (this replaces the earlier version of the function)
create or replace function bump_call_stats() returns trigger
language plpgsql security definer set search_path = public as $$
declare yes boolean := lower(trim(new.outcome)) = 'interested';
begin
  if new.person_id is not null then
    update persons set call_count = call_count + 1, last_called_at = new.called_at,
      last_outcome = new.outcome, last_called_by = new.created_by,
      last_interested_at = case when yes then greatest(coalesce(last_interested_at, new.called_at), new.called_at) else last_interested_at end
    where id = new.person_id;
  end if;
  if new.organization_id is not null then
    update organizations set call_count = call_count + 1, last_called_at = new.called_at,
      last_outcome = new.outcome, last_called_by = new.created_by,
      last_interested_at = case when yes then greatest(coalesce(last_interested_at, new.called_at), new.called_at) else last_interested_at end
    where id = new.organization_id;
  end if;
  return new;
end $$;

-- Fill it in from the calls you already have
update organizations o set last_interested_at =
  (select max(c.called_at) from call_logs c where c.organization_id = o.id and lower(trim(c.outcome)) = 'interested');
update persons p set last_interested_at =
  (select max(c.called_at) from call_logs c where c.person_id = p.id and lower(trim(c.outcome)) = 'interested');

create index organizations_lost_idx on organizations (last_interested_at) where last_interested_at is not null;

-- Dashboard: organizations that were Interested but whose latest result is something else
create or replace function dashboard_lost_interest(p_tz text)
returns table (this_week bigint, total bigint) language sql stable as $$
  with b as (select date_trunc('week', now() at time zone p_tz) at time zone p_tz as week_start)
  select count(*) filter (where o.last_called_at >= b.week_start), count(*)
  from organizations o cross join b
  where o.last_interested_at is not null and lower(trim(o.last_outcome)) <> 'interested'
$$;
