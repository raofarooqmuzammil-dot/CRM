-- Phase 5a: calling works on organizations, lists (industries), organization email and notes.
-- Run once in Supabase > SQL Editor, after the earlier files.

-- Lists (industries such as NEMT, Roofers, HVAC). One list per organization.
create table lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#66726f',
  sort int not null default 100,
  created_at timestamptz not null default now()
);
create unique index lists_name_idx on lists (lower(name));
alter table lists enable row level security;
create policy "team reads" on lists for select to authenticated using (true);
create policy "team writes" on lists for all to authenticated using (true) with check (true);

alter table organizations
  add column list_id uuid references lists(id) on delete set null,
  add column email text,
  add column notes text,
  add column do_not_call boolean not null default false,
  add column call_count int not null default 0,
  add column last_called_at timestamptz,
  add column last_outcome text,
  add column last_called_by uuid references profiles(id) on delete set null,
  add column possible_duplicate boolean not null default false,
  add column duplicate_of_org uuid,
  add column duplicate_of_person uuid,
  add column email_key text generated always as (nullif(lower(trim(coalesce(email,''))), '')) stored;
create index organizations_list_idx on organizations (list_id);
create index organizations_email_key_idx on organizations (email_key);
create index organizations_dup_idx on organizations (possible_duplicate) where possible_duplicate;

-- Calls can be logged on an organization (the front desk), or on a contact of it.
alter table call_logs alter column person_id drop not null;
alter table call_logs
  add column organization_id uuid references organizations(id) on delete cascade,
  add column spoke_with text;
alter table call_logs add constraint call_logs_target check (person_id is not null or organization_id is not null);
create index call_logs_org_idx on call_logs (organization_id, called_at desc);

create or replace function call_logs_fill_org() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.organization_id is null and new.person_id is not null then
    select organization_id into new.organization_id from persons where id = new.person_id;
  end if;
  return new;
end $$;
create trigger call_logs_fill_org before insert on call_logs for each row execute function call_logs_fill_org();

-- One call updates the contact (if any) and the organization's totals.
create or replace function bump_call_stats() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.person_id is not null then
    update persons set call_count = call_count + 1, last_called_at = new.called_at,
      last_outcome = new.outcome, last_called_by = new.created_by where id = new.person_id;
  end if;
  if new.organization_id is not null then
    update organizations set call_count = call_count + 1, last_called_at = new.called_at,
      last_outcome = new.outcome, last_called_by = new.created_by where id = new.organization_id;
  end if;
  return new;
end $$;

drop policy "see calls on visible persons" on call_logs;
create policy "see calls on visible records" on call_logs for select to authenticated
  using (created_by = auth.uid() or is_admin()
         or exists (select 1 from persons p where p.id = person_id)
         or exists (select 1 from organizations o where o.id = organization_id));

-- Follow-ups can belong to an organization too.
alter table activities add column organization_id uuid references organizations(id) on delete cascade;
create index activities_org_idx on activities (organization_id);

create or replace function activities_fill_org() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.organization_id is null and new.person_id is not null then
    select organization_id into new.organization_id from persons where id = new.person_id;
  end if;
  return new;
end $$;
create trigger activities_fill_org before insert on activities for each row execute function activities_fill_org();

drop policy "see own or on visible persons" on activities;
create policy "see own or visible" on activities for select to authenticated
  using (assigned_to = auth.uid() or created_by = auth.uid() or is_admin()
         or exists (select 1 from persons p where p.id = person_id)
         or exists (select 1 from organizations o where o.id = organization_id));
