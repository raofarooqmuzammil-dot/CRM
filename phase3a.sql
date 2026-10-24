-- Phase 3a: custom fields and CSV import. Run once in Supabase > SQL Editor.

create table custom_fields (
  id uuid primary key default gen_random_uuid(),
  entity text not null check (entity in ('person','organization','deal')),
  name text not null,
  type text not null check (type in ('text','number','date','boolean','dropdown','link')),
  options text[] not null default '{}',
  sort int not null default 100,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
alter table custom_fields enable row level security;
create policy "team reads" on custom_fields for select to authenticated using (true);
create policy "team writes" on custom_fields for all to authenticated using (true) with check (true);

-- Values are stored by field id, so renaming a field never loses data.
alter table persons add column custom jsonb not null default '{}';
alter table organizations add column custom jsonb not null default '{}';
alter table deals add column custom jsonb not null default '{}';

create table import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  stats jsonb,
  created_by uuid not null default auth.uid() references profiles(id),
  created_at timestamptz not null default now()
);
alter table import_batches enable row level security;
create policy "team reads" on import_batches for select to authenticated using (true);
create policy "add" on import_batches for insert to authenticated with check (created_by = auth.uid());
create policy "update own" on import_batches for update to authenticated
  using (created_by = auth.uid() or is_admin()) with check (created_by = auth.uid() or is_admin());
create policy "admin deletes" on import_batches for delete to authenticated using (is_admin());

alter table persons add column import_batch_id uuid references import_batches(id) on delete set null;
alter table organizations add column import_batch_id uuid references import_batches(id) on delete set null;

-- Matching keys used to find duplicates (phone ignores spacing and punctuation).
alter table persons
  add column phone_key text generated always as (nullif(right(regexp_replace(coalesce(phone,''), '\D', '', 'g'), 9), '')) stored,
  add column email_key text generated always as (nullif(lower(trim(coalesce(email,''))), '')) stored;
alter table organizations
  add column phone_key text generated always as (nullif(right(regexp_replace(coalesce(phone,''), '\D', '', 'g'), 9), '')) stored,
  add column name_key text generated always as (lower(trim(name))) stored;
create index persons_phone_key_idx on persons (phone_key);
create index persons_email_key_idx on persons (email_key);
create index organizations_name_key_idx on organizations (name_key);
