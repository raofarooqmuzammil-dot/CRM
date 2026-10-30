\set ON_ERROR_STOP on
\pset tuples_only on
truncate call_logs, activities, deals, persons, organizations cascade;
insert into auth.users (id, email) values ('99999999-9999-9999-9999-999999999991','d-user@x.com') on conflict do nothing;
insert into organizations (id, name, created_by) values ('aaaaaaaa-1111-1111-1111-111111111111','Deal Org','99999999-9999-9999-9999-999999999991');
insert into pipelines (id, name) values ('bbbbbbbb-1111-1111-1111-111111111111','P') on conflict do nothing;
insert into stages (id, pipeline_id, name) values ('cccccccc-1111-1111-1111-111111111111','bbbbbbbb-1111-1111-1111-111111111111','S') on conflict do nothing;
insert into deals (id, title, organization_id, pipeline_id, stage_id, created_by) values ('dddddddd-1111-1111-1111-111111111111','Big deal','aaaaaaaa-1111-1111-1111-111111111111','bbbbbbbb-1111-1111-1111-111111111111','cccccccc-1111-1111-1111-111111111111','99999999-9999-9999-9999-999999999991');
insert into activities (title, due_at, deal_id, created_by) values ('Send contract', now() + interval '2 days', 'dddddddd-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999991');
select 'deal follow-up fills the organization: ' || (select organization_id is not null from activities);
select 'organization next follow-up set from the deal follow-up: ' || (select next_followup_at is not null from organizations);
delete from deals where id = 'dddddddd-1111-1111-1111-111111111111';
select 'deleting the deal removes its follow-ups: ' || (select count(*) from activities) || ' left';
