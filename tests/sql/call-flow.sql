\set ON_ERROR_STOP on
\pset tuples_only on
-- two users: first becomes admin, second a caller
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111','admin@x.com'), ('22222222-2222-2222-2222-222222222222','sam@x.com');
select 'roles: ' || string_agg(role, ',' order by created_at) from profiles;
set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', false);

-- Sam creates an organization in a list and calls the front desk
insert into lists (name) values ('NEMT');
insert into organizations (name, phone, list_id, owner_id) select 'Acme Transport', '(555) 111-2222', id, '22222222-2222-2222-2222-222222222222' from lists where name='NEMT';
insert into call_logs (organization_id, outcome, note, spoke_with, created_by) select id, 'Callback requested', 'call tomorrow', 'Dana, front desk', '22222222-2222-2222-2222-222222222222' from organizations;
insert into activities (title, type, due_at, organization_id, assigned_to, created_by) select 'Follow-up call', 'Call', now() + interval '1 day', id, '22222222-2222-2222-2222-222222222222','22222222-2222-2222-2222-222222222222' from organizations;
select 'org after front desk call: calls=' || call_count || ' last=' || last_outcome from organizations;

-- A contact is added, then Sam calls the contact directly
insert into persons (name, phone, organization_id, owner_id) select 'Dana Manager', '555 333 4444', id, '22222222-2222-2222-2222-222222222222' from organizations;
insert into call_logs (person_id, outcome, created_by) select id, 'Interested', '22222222-2222-2222-2222-222222222222' from persons;
insert into activities (title, type, due_at, person_id, assigned_to, created_by) select 'Send proposal', 'Follow-up', now() + interval '2 days', id, '22222222-2222-2222-2222-222222222222','22222222-2222-2222-2222-222222222222' from persons;
select 'org rollup: calls=' || call_count || ' last=' || last_outcome from organizations;
select 'person: calls=' || call_count || ' last=' || last_outcome from persons;
select 'call_logs org id filled for contact call: ' || (select count(*) from call_logs where organization_id is not null and person_id is not null);
select 'activities on org (incl contact): ' || count(*) from activities where organization_id = (select id from organizations);
select 'history: ' || string_agg(coalesce(spoke_with, (select name from persons p where p.id = c.person_id)) || '=' || outcome, ' | ' order by called_at, id) from call_logs c;

-- a call with neither organization nor person must be rejected
do $$ begin
  begin insert into call_logs (outcome, created_by) values ('x','22222222-2222-2222-2222-222222222222'); raise exception 'should have failed';
  exception when check_violation then raise notice 'ok: call with no target rejected'; end;
end $$;

-- private organization by admin is invisible to Sam but visible to admin
reset role;
insert into organizations (name, visible_to, owner_id, created_by) values ('Secret Co','private','11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111');
set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', false);
select 'sam sees orgs: ' || count(*) || ' (expect 1)' from organizations;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
select 'admin sees orgs: ' || count(*) || ' (expect 2)' from organizations;

-- only admin can delete; caller delete affects nothing
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', false);
delete from organizations where name='Acme Transport';
select 'orgs after caller delete attempt: ' || count(*) from organizations;
-- list move
update organizations set list_id = null where name='Acme Transport';
select 'moved to no list: ' || (select count(*) from organizations where list_id is null and name='Acme Transport');
