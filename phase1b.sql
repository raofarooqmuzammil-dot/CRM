-- Phase 1b: labels list + follow-up activities. Run once in Supabase > SQL Editor.

-- Labels (editable list) ----------------------------------------------
create table labels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#1c6b60',
  created_at timestamptz not null default now()
);
create unique index labels_name_idx on labels (lower(name));
alter table labels enable row level security;
create policy "team reads labels" on labels for select to authenticated using (true);
create policy "team adds labels" on labels for insert to authenticated with check (true);
create policy "team edits labels" on labels for update to authenticated using (true) with check (true);
create policy "team deletes labels" on labels for delete to authenticated using (true);
insert into labels (name, color) values ('Hot', '#c2410c'), ('Warm', '#b7791f'), ('Cold', '#2b6cb0');

alter table persons add column label_ids uuid[] not null default '{}';

-- Activities (follow-ups, calls, meetings, demos) ----------------------
create table activities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text not null default 'call' check (type in ('call','follow-up','meeting','demo')),
  due_at timestamptz not null,
  done boolean not null default false,
  done_at timestamptz,
  location text,
  video_call boolean not null default false,
  description text,
  person_id uuid references persons(id) on delete cascade,
  assigned_to uuid references profiles(id) on delete set null,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index activities_open_idx on activities (assigned_to, due_at) where not done;
create index activities_person_idx on activities (person_id);
alter table activities enable row level security;

create policy "see own or on visible persons" on activities for select to authenticated
  using (assigned_to = auth.uid() or created_by = auth.uid() or is_admin()
         or exists (select 1 from persons p where p.id = person_id));
create policy "add activity" on activities for insert to authenticated
  with check (created_by = auth.uid());
create policy "edit own activity" on activities for update to authenticated
  using (assigned_to = auth.uid() or created_by = auth.uid() or is_admin())
  with check (assigned_to = auth.uid() or created_by = auth.uid() or is_admin());
create policy "delete own activity" on activities for delete to authenticated
  using (assigned_to = auth.uid() or created_by = auth.uid() or is_admin());
