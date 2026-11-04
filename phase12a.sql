-- Phase 12a: "missed" alerts. Run once in Supabase > SQL Editor, after phase11a.
-- A follow-up that is still not done after its time gets a first alert and, later, a second one.
alter table activities
  add column missed_notified_at timestamptz,
  add column missed2_notified_at timestamptz;
create index activities_missed_idx on activities (due_at) where not done and missed2_notified_at is null;

alter table reminder_log drop constraint reminder_log_kind_check;
alter table reminder_log add constraint reminder_log_kind_check check (kind in ('morning','evening','hour','missed1','missed2','test'));

-- Morning and evening summaries are off by default; the one-hour reminder and the missed alerts are on
update app_settings set value = value || '{"morning": false, "evening": false, "missed": true, "missed1": 15, "missed2": 60}'::jsonb
where key = 'reminders';
