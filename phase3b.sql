-- Phase 3b: only the admin can rename/hide/delete custom columns; duplicate flagging on import.
-- Run once in Supabase > SQL Editor.

-- Anyone can ADD a column; only the admin can change or delete one.
drop policy if exists "team writes" on custom_fields;
create policy "anyone adds fields" on custom_fields for insert to authenticated with check (true);
create policy "admin edits fields" on custom_fields for update to authenticated using (is_admin()) with check (is_admin());
create policy "admin deletes fields" on custom_fields for delete to authenticated using (is_admin());

-- Duplicate flags (records are kept, never merged)
alter table persons
  add column name_key text generated always as (lower(trim(name))) stored,
  add column possible_duplicate boolean not null default false,
  add column duplicate_of uuid,
  add column duplicate_of_org uuid;
create index persons_name_key_idx on persons (name_key);
create index persons_dup_idx on persons (possible_duplicate) where possible_duplicate;
