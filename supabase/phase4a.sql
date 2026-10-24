-- Phase 4a: person time zones, business hours, quick add support. Run once in Supabase > SQL Editor.

alter table persons
  add column time_zone text,
  add column time_zone_guessed boolean not null default false,
  add column eff_time_zone text;      -- the person's own zone, else their organization's
alter table organizations add column time_zone_guessed boolean not null default false;

create function persons_set_eff_tz() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.eff_time_zone := coalesce(new.time_zone, (select o.time_zone from organizations o where o.id = new.organization_id));
  return new;
end $$;
create trigger persons_eff_tz before insert or update of time_zone, organization_id on persons
for each row execute function persons_set_eff_tz();

create function org_tz_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update persons set eff_time_zone = coalesce(time_zone, new.time_zone) where organization_id = new.id;
  return new;
end $$;
create trigger org_tz_changed after update of time_zone on organizations
for each row when (old.time_zone is distinct from new.time_zone) execute function org_tz_changed();

update persons p set eff_time_zone = coalesce(p.time_zone, (select o.time_zone from organizations o where o.id = p.organization_id));
create index persons_eff_tz_idx on persons (eff_time_zone);

-- Small team-wide settings (business hours). Everyone reads, only the admin changes.
create table app_settings (key text primary key, value jsonb not null);
alter table app_settings enable row level security;
create policy "team reads" on app_settings for select to authenticated using (true);
create policy "admin adds" on app_settings for insert to authenticated with check (is_admin());
create policy "admin edits" on app_settings for update to authenticated using (is_admin()) with check (is_admin());
insert into app_settings (key, value) values ('business_hours', '{"start": 9, "end": 17}');
