\set ON_ERROR_STOP on
\pset tuples_only on
truncate call_logs, activities, deals, persons, organizations, lists cascade;
delete from auth.users where id in ('77777777-7777-7777-7777-777777777771','77777777-7777-7777-7777-777777777772');
insert into auth.users (id, email) values ('77777777-7777-7777-7777-777777777771','q-admin@x.com'), ('77777777-7777-7777-7777-777777777772','q-kim@x.com');
-- make the first of these an admin, the other a caller
update profiles set role = 'caller' where id in (select id from profiles);
update profiles set role = 'admin' where id = '77777777-7777-7777-7777-777777777771';
insert into auth.users (id, email) values ('77777777-7777-7777-7777-777777777773','q-sam@x.com');
insert into lists (id, name) values ('88888888-8888-8888-8888-888888888881','L1'), ('88888888-8888-8888-8888-888888888882','L2');
insert into organizations (name, list_id, created_by, created_at, do_not_call, visible_to, call_count, time_zone) values
 ('A-new',      '88888888-8888-8888-8888-888888888881','77777777-7777-7777-7777-777777777771', now() - interval '9 hours', false,'everyone',0,null),
 ('B-new',      '88888888-8888-8888-8888-888888888881','77777777-7777-7777-7777-777777777771', now() - interval '8 hours', false,'everyone',0,null),
 ('C-called',   '88888888-8888-8888-8888-888888888881','77777777-7777-7777-7777-777777777771', now() - interval '7 hours', false,'everyone',2,null),
 ('D-dnc',      '88888888-8888-8888-8888-888888888881','77777777-7777-7777-7777-777777777771', now() - interval '6 hours', true, 'everyone',0,null),
 ('E-private',  '88888888-8888-8888-8888-888888888881','77777777-7777-7777-7777-777777777771', now() - interval '5 hours', false,'private', 0,null),
 ('F-other',    '88888888-8888-8888-8888-888888888882','77777777-7777-7777-7777-777777777771', now() - interval '4 hours', false,'everyone',0,null),
 ('G-chicago',  '88888888-8888-8888-8888-888888888881','77777777-7777-7777-7777-777777777771', now() - interval '3 hours', false,'everyone',0,'America/Chicago'),
 ('H-nolist',   null,                                  '77777777-7777-7777-7777-777777777771', now() - interval '2 hours', false,'everyone',0,null);
set role authenticated;
\set sam '''77777777-7777-7777-7777-777777777773'''
\set kim '''77777777-7777-7777-7777-777777777772'''
select set_config('request.jwt.claim.sub', :sam, false);
create temp table got (who text, name text);
grant all on got to authenticated;
insert into got select 'sam1', name from organizations where id = claim_next_org('88888888-8888-8888-8888-888888888881');
select set_config('request.jwt.claim.sub', :kim, false);
insert into got select 'kim1', name from organizations where id = claim_next_org('88888888-8888-8888-8888-888888888881');
select 'sam then kim in list L1 get different, oldest uncalled first: ' || string_agg(who || '=' || name, ', ' order by who) from got;
-- sam asks again: A is still his own hold, so he gets it back
select set_config('request.jwt.claim.sub', :sam, false);
select 'sam asking again keeps his own held organization: ' || (select name from organizations where id = claim_next_org('88888888-8888-8888-8888-888888888881'));
-- remaining list L1 candidates for sam: G (chicago); C called, D dnc, E private are skipped
select set_config('request.jwt.claim.sub', :kim, false);
select 'kim next in L1 skips called, do-not-call, private and held: ' || (select name from organizations where id = claim_next_org('88888888-8888-8888-8888-888888888881'));
select 'skip moves on to a different organization: ' || (select name from organizations where id = claim_next_org('88888888-8888-8888-8888-888888888881', false, null, (select id from organizations where name = 'B-new')));
select 'list L1 now empty for kim (A held by sam, B and G held by kim... own holds returned first): ' || coalesce((select name from organizations where id = claim_next_org('88888888-8888-8888-8888-888888888881')), 'none');
select 'zones filter picks only the chicago one: ' || coalesce((select name from organizations where id = claim_next_org(null, false, array['America/Chicago'])), 'none');
select 'zones filter with no match: ' || coalesce((select name from organizations where id = claim_next_org(null, false, array['Australia/Perth'])), 'none');
select 'no-list picks the organization without a list: ' || (select name from organizations where id = claim_next_org(null, true));
select 'other list works: ' || (select name from organizations where id = claim_next_org('88888888-8888-8888-8888-888888888882'));
-- expired hold becomes available to someone else
reset role;
update organizations set queue_hold_until = now() - interval '1 minute' where name = 'A-new';
set role authenticated;
select set_config('request.jwt.claim.sub', :kim, false);
select 'expired hold can be taken by another caller: ' || (select name from organizations where id = claim_next_org('88888888-8888-8888-8888-888888888881'));

-- ---------- dashboard ----------
reset role;
insert into call_logs (organization_id, outcome, created_by, called_at) select id, 'Interested', '77777777-7777-7777-7777-777777777773', now() from organizations where name = 'A-new';
insert into call_logs (organization_id, outcome, created_by, called_at) select id, 'Interested', '77777777-7777-7777-7777-777777777773', now() from organizations where name = 'B-new';
insert into call_logs (organization_id, outcome, created_by, called_at) select id, 'No answer', '77777777-7777-7777-7777-777777777773', now() from organizations where name = 'F-other';
insert into call_logs (organization_id, outcome, created_by, called_at) select id, 'Not interested', '77777777-7777-7777-7777-777777777772', now() from organizations where name = 'G-chicago';
insert into call_logs (organization_id, outcome, created_by, called_at) select id, 'Interested', '77777777-7777-7777-7777-777777777773', date_trunc('week', now()) - interval '2 days' from organizations where name = 'A-new';
insert into call_logs (organization_id, outcome, created_by, called_at) select id, 'Interested', '77777777-7777-7777-7777-777777777773', date_trunc('week', now()) - interval '20 days' from organizations where name = 'A-new';
set role authenticated;
select set_config('request.jwt.claim.sub', '77777777-7777-7777-7777-777777777771', false);
select 'admin sees all callers today: ' || coalesce(sum(n), 0) || ' (expect 4)' from dashboard_calls('UTC') where bucket = 'today';
select 'admin sees last week: ' || coalesce(sum(n), 0) || ' (expect 1, the 20-day-old call is outside)' from dashboard_calls('UTC') where bucket = 'last_week';
select set_config('request.jwt.claim.sub', :sam, false);
select 'sam sees only his own today: ' || coalesce(sum(n), 0) || ' (expect 3)' from dashboard_calls('UTC') where bucket = 'today';
select set_config('request.jwt.claim.sub', :kim, false);
select 'kim sees only her own today: ' || coalesce(sum(n), 0) || ' (expect 1)' from dashboard_calls('UTC') where bucket = 'today';
select 'results per list rows: ' || count(*) from dashboard_results();
select 'funnel: ' || organizations || ' orgs visible, ' || called || ' called, ' || interested || ' interested' from dashboard_funnel();
select 'followups function runs: ' || (select count(*) from dashboard_followups('UTC'));
select 'deals function runs: ' || (select count(*) from dashboard_deals());
