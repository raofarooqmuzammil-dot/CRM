-- Call CRM: Phase 1 schema. Run once in Supabase > SQL Editor.

-- Users ---------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'caller' check (role in ('admin','caller')),
  cloudtalk_agent_id text,                       -- optional, used in a later phase
  auto_load_next boolean not null default false, -- personal queue setting
  created_at timestamptz not null default now()
);

create function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create function my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

-- The first account created becomes the admin; everyone after is a caller.
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case when exists (select 1 from profiles) then 'caller' else 'admin' end
  );
  return new;
end $$;

create trigger on_auth_user_created
after insert on auth.users for each row execute function handle_new_user();

create function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

alter table profiles enable row level security;
create policy "team can read profiles" on profiles for select to authenticated using (true);
create policy "edit own profile, not role" on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and role = my_role());
create policy "admin edits any profile" on profiles for update to authenticated
  using (is_admin()) with check (is_admin());

-- Organizations -------------------------------------------------------
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  website text,
  phone text,
  country text check (country in ('US','UK','AU')),
  time_zone text,
  labels text[] not null default '{}',
  owner_id uuid references profiles(id) on delete set null,
  visible_to text not null default 'everyone' check (visible_to in ('everyone','private')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger organizations_updated before update on organizations
  for each row execute function set_updated_at();
create index organizations_name_idx on organizations (lower(name));

-- Persons -------------------------------------------------------------
create table persons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  organization_id uuid references organizations(id) on delete set null,
  phone text,
  email text,
  labels text[] not null default '{}',
  owner_id uuid references profiles(id) on delete set null,
  visible_to text not null default 'everyone' check (visible_to in ('everyone','private')),
  do_not_call boolean not null default false,
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger persons_updated before update on persons
  for each row execute function set_updated_at();
create index persons_phone_idx on persons (phone);
create index persons_email_idx on persons (lower(email));

-- Visibility rules ----------------------------------------------------
-- Shared records are visible to the team. Private records are visible only
-- to their owner, their creator, and the admin. Only the admin can delete.
alter table organizations enable row level security;
alter table persons enable row level security;

create policy "see shared or own" on organizations for select to authenticated
  using (visible_to = 'everyone' or owner_id = auth.uid() or created_by = auth.uid() or is_admin());
create policy "add" on organizations for insert to authenticated
  with check (created_by = auth.uid());
create policy "edit shared or own" on organizations for update to authenticated
  using (visible_to = 'everyone' or owner_id = auth.uid() or created_by = auth.uid() or is_admin())
  with check (visible_to = 'everyone' or owner_id = auth.uid() or created_by = auth.uid() or is_admin());
create policy "admin deletes" on organizations for delete to authenticated using (is_admin());

create policy "see shared or own" on persons for select to authenticated
  using (visible_to = 'everyone' or owner_id = auth.uid() or created_by = auth.uid() or is_admin());
create policy "add" on persons for insert to authenticated
  with check (created_by = auth.uid());
create policy "edit shared or own" on persons for update to authenticated
  using (visible_to = 'everyone' or owner_id = auth.uid() or created_by = auth.uid() or is_admin())
  with check (visible_to = 'everyone' or owner_id = auth.uid() or created_by = auth.uid() or is_admin());
create policy "admin deletes" on persons for delete to authenticated using (is_admin());
