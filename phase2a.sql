-- Phase 2a: pipelines, stages, deals, lost reasons. Run once in Supabase > SQL Editor.

create table pipelines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort int not null default 100,
  created_at timestamptz not null default now()
);
create table stages (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references pipelines(id) on delete cascade,
  name text not null,
  sort int not null default 100,
  created_at timestamptz not null default now()
);
create table lost_reasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort int not null default 100,
  created_at timestamptz not null default now()
);
alter table pipelines enable row level security;
alter table stages enable row level security;
alter table lost_reasons enable row level security;
create policy "team reads" on pipelines for select to authenticated using (true);
create policy "team writes" on pipelines for all to authenticated using (true) with check (true);
create policy "team reads" on stages for select to authenticated using (true);
create policy "team writes" on stages for all to authenticated using (true) with check (true);
create policy "team reads" on lost_reasons for select to authenticated using (true);
create policy "team writes" on lost_reasons for all to authenticated using (true) with check (true);

with p as (insert into pipelines (name, sort) values ('Sales', 1) returning id)
insert into stages (pipeline_id, name, sort)
select p.id, s.name, s.sort from p, (values
  ('Qualified',1),('Demo Scheduled',2),('Demo Completed',3),
  ('Proposal Made',4),('Negotiations',5),('Contract Signed',6)) as s(name, sort);
insert into lost_reasons (name, sort) values
  ('No budget',1),('Not interested',2),('Chose a competitor',3),('No response',4),('Bad timing',5);

create table deals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  person_id uuid references persons(id) on delete set null,
  organization_id uuid references organizations(id) on delete set null,
  value numeric(14,2) not null default 0,
  currency text not null default 'USD',
  pipeline_id uuid not null references pipelines(id) on delete restrict,
  stage_id uuid not null references stages(id) on delete restrict,
  label_ids uuid[] not null default '{}',
  expected_close_date date,
  owner_id uuid references profiles(id) on delete set null,
  source_channel text,
  source_channel_id text,
  visible_to text not null default 'everyone' check (visible_to in ('everyone','private')),
  phone text,
  email text,
  status text not null default 'open' check (status in ('open','won','lost')),
  lost_reason text,
  closed_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger deals_updated before update on deals for each row execute function set_updated_at();
create index deals_board_idx on deals (pipeline_id, stage_id) where status = 'open';

alter table deals enable row level security;
create policy "see shared or own" on deals for select to authenticated
  using (visible_to = 'everyone' or owner_id = auth.uid() or created_by = auth.uid() or is_admin());
create policy "add" on deals for insert to authenticated with check (created_by = auth.uid());
create policy "edit shared or own" on deals for update to authenticated
  using (visible_to = 'everyone' or owner_id = auth.uid() or created_by = auth.uid() or is_admin())
  with check (visible_to = 'everyone' or owner_id = auth.uid() or created_by = auth.uid() or is_admin());
create policy "admin deletes" on deals for delete to authenticated using (is_admin());
