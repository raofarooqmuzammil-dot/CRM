-- Phase 11a: email reminders (morning, evening, and one hour before). Run once in Supabase > SQL Editor.

-- Marks a follow-up once its one-hour reminder has been sent, so it is never sent twice
alter table activities add column reminded_at timestamptz;
create index activities_remind_idx on activities (due_at) where not done and reminded_at is null;

-- One row per reminder run. Used to send the morning and evening emails once a day and to cap emails per day.
-- No policies: only the server (service role) reads and writes it.
create table reminder_log (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('morning','evening','hour','test')),
  sent_on date not null,
  emailed boolean not null default false,
  items int not null default 0,
  error text,
  created_at timestamptz not null default now()
);
create index reminder_log_day_idx on reminder_log (sent_on, kind);
alter table reminder_log enable row level security;

insert into app_settings (key, value) values ('reminders',
  '{"morning": true, "evening": true, "hour": true, "morning_time": "08:00", "evening_time": "18:00", "lead": 60, "email": "", "user_id": null, "cap": 80}')
on conflict (key) do nothing;
