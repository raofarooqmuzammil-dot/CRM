-- Phase 1d: labels on organizations. Run once in Supabase > SQL Editor.
alter table organizations add column label_ids uuid[] not null default '{}';
