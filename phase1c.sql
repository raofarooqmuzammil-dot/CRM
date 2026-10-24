-- Phase 1c: editable activity types and call outcomes, call history and call counts.
-- Run once in Supabase > SQL Editor.

create table activity_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#66726f',
  sort int not null default 100,
  created_at timestamptz not null default now()
);
create table call_outcomes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#66726f',
  sort int not null default 100,
  created_at timestamptz not null default now()
);
create unique index activity_types_name_idx on activity_types (lower(name));
create unique index call_outcomes_name_idx on call_outcomes (lower(name));

alter table activity_types enable row level security;
alter table call_outcomes enable row level security;
create policy "team reads" on activity_types for select to authenticated using (true);
create policy "team writes" on activity_types for all to authenticated using (true) with check (true);
create policy "team reads" on call_outcomes for select to authenticated using (true);
create policy "team writes" on call_outcomes for all to authenticated using (true) with check (true);

insert into activity_types (name, sort) values ('Call',1),('Follow-up',2),('Meeting',3),('Demo',4);
insert into call_outcomes (name, sort, color) values
  ('No answer',1,'#66726f'),('Voicemail',2,'#66726f'),('Gatekeeper',3,'#b7791f'),
  ('Callback requested',4,'#2b6cb0'),('Interested',5,'#1c6b60'),
  ('Not interested',6,'#a3392b'),('Wrong number',7,'#a3392b');

-- Activity types are now an editable list, so drop the fixed list.
alter table activities drop constraint if exists activities_type_check;

-- Call history
create table call_logs (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references persons(id) on delete cascade,
  outcome text not null,
  note text,
  called_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references profiles(id)
);
create index call_logs_person_idx on call_logs (person_id, called_at desc);
alter table call_logs enable row level security;
create policy "see calls on visible persons" on call_logs for select to authenticated
  using (created_by = auth.uid() or is_admin() or exists (select 1 from persons p where p.id = person_id));
create policy "log a call" on call_logs for insert to authenticated with check (created_by = auth.uid());
create policy "admin deletes calls" on call_logs for delete to authenticated using (is_admin());

-- Call count and last call, kept up to date automatically
alter table persons
  add column call_count int not null default 0,
  add column last_called_at timestamptz,
  add column last_outcome text,
  add column last_called_by uuid references profiles(id) on delete set null;

create function bump_call_stats() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update persons set call_count = call_count + 1, last_called_at = new.called_at,
    last_outcome = new.outcome, last_called_by = new.created_by
  where id = new.person_id;
  return new;
end $$;
create trigger call_logs_bump after insert on call_logs
for each row execute function bump_call_stats();
