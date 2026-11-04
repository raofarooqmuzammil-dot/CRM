-- Phase 6a: contact roles, and "next follow-up" kept on each record so lists can sort by it.
-- Run once in Supabase > SQL Editor, after the earlier files.

-- Roles for the people you speak to (editable in Settings)
create table contact_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort int not null default 100,
  created_at timestamptz not null default now()
);
create unique index contact_roles_name_idx on contact_roles (lower(name));
alter table contact_roles enable row level security;
create policy "team reads" on contact_roles for select to authenticated using (true);
create policy "team writes" on contact_roles for all to authenticated using (true) with check (true);
insert into contact_roles (name, sort) values ('Front desk',1),('Owner',2),('Manager',3),('CEO',4),('Dispatcher',5),('Other',6);

alter table persons add column role text;

-- Next follow-up, kept up to date automatically
alter table organizations add column next_followup_at timestamptz;
alter table persons add column next_followup_at timestamptz;
create index organizations_next_idx on organizations (next_followup_at);
create index persons_next_idx on persons (next_followup_at);

create function refresh_next_followup(org uuid, person uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if org is not null then
    update organizations set next_followup_at = (select min(due_at) from activities where organization_id = org and not done) where id = org;
  end if;
  if person is not null then
    update persons set next_followup_at = (select min(due_at) from activities where person_id = person and not done) where id = person;
  end if;
end $$;

create function activities_refresh_next() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'DELETE' then perform refresh_next_followup(new.organization_id, new.person_id); end if;
  if tg_op <> 'INSERT' then perform refresh_next_followup(old.organization_id, old.person_id); end if;
  return null;
end $$;
create trigger activities_refresh_next after insert or update or delete on activities
for each row execute function activities_refresh_next();

-- Fill it in for follow-ups that already exist
update organizations o set next_followup_at = (select min(a.due_at) from activities a where a.organization_id = o.id and not a.done);
update persons p set next_followup_at = (select min(a.due_at) from activities a where a.person_id = p.id and not a.done);
