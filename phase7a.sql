-- Phase 7a: removing a user's access (the person can no longer log in; their history stays).
-- Run once in Supabase > SQL Editor, after the earlier files.
alter table profiles add column disabled boolean not null default false;
