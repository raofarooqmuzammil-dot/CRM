\set ON_ERROR_STOP on
\pset tuples_only on
truncate call_logs, activities, deals, persons, organizations cascade;
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111','a@x.com') on conflict do nothing;
insert into organizations (id, name, created_by) values ('aaaaaaaa-0000-0000-0000-000000000001','Acme','11111111-1111-1111-1111-111111111111');
insert into persons (id, name, organization_id, created_by) values ('bbbbbbbb-0000-0000-0000-000000000001','Dana','aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111');
insert into activities (id, title, due_at, organization_id, created_by) values ('cccccccc-0000-0000-0000-000000000001','Org call', now() + interval '3 days','aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111');
select 'org next after org follow-up: ' || (next_followup_at is not null) from organizations;
insert into activities (id, title, due_at, person_id, created_by) values ('cccccccc-0000-0000-0000-000000000002','Dana call', now() + interval '1 day','bbbbbbbb-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111');
select 'org next is the sooner (contact follow-up counts): ' || ((select next_followup_at from organizations) < now() + interval '2 days');
select 'person next set: ' || ((select next_followup_at from persons) is not null);
update activities set done = true where id = 'cccccccc-0000-0000-0000-000000000002';
select 'after contact follow-up done, org next is the 3-day one: ' || ((select next_followup_at from organizations) > now() + interval '2 days');
select 'person next cleared: ' || ((select next_followup_at from persons) is null);
delete from activities where id = 'cccccccc-0000-0000-0000-000000000001';
select 'org next cleared after delete: ' || ((select next_followup_at from organizations) is null);
select 'roles seeded: ' || count(*) from contact_roles;
