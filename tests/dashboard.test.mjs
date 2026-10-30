import { shapeCalls, shapeResults, shapeDeals, shapeFunnel, loadDashboard } from './lib/dashboard.js';
let bad = 0; const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { bad++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };
const people = [{ id: 'sam', full_name: 'Sam' }, { id: 'kim', full_name: 'Kim' }];
const rows = [
  { caller: 'sam', outcome: 'Interested', bucket: 'today', n: 2 }, { caller: 'sam', outcome: 'No answer', bucket: 'today', n: 3 },
  { caller: 'sam', outcome: 'Interested', bucket: 'earlier_this_week', n: 1 }, { caller: 'kim', outcome: 'Not interested', bucket: 'today', n: 4 },
  { caller: 'kim', outcome: 'Interested', bucket: 'last_week', n: 5 }, { caller: 'gone', outcome: 'No answer', bucket: 'earlier_this_week', n: 1 },
];
const c = shapeCalls(rows, people);
eq(c.totals, { today: 9, week: 11, lastWeek: 5, interestedToday: 2, interestedWeek: 3, interestedLastWeek: 5 }, 'today, week, and last week totals (week includes today)');
eq(c.byCaller.map((x) => [x.name, x.today, x.week, x.interested, x.notInterested]), [['Sam', 5, 6, 3, 0], ['Kim', 4, 4, 0, 4], ['Former user', 0, 1, 0, 0]], 'one row per caller, busiest first, removed users still shown');
const lists = [{ id: 'l1', name: 'NEMT', color: '#2b6cb0' }, { id: 'l2', name: 'HVAC', color: '#b7791f' }];
const outcomes = [{ name: 'Interested' }, { name: 'No answer' }];
const res = shapeResults([
  { list_id: 'l1', outcome: 'Interested', n: 3 }, { list_id: 'l1', outcome: null, n: 7 }, { list_id: 'l1', outcome: 'Old result', n: 2 },
  { list_id: null, outcome: null, n: 5 }, { list_id: 'l3-unknown', outcome: 'No answer', n: 1 },
], lists, outcomes);
eq(res.columns, ['Interested', 'No answer', 'Other', 'Not called'], 'result columns follow Settings, Other only when needed');
eq(res.rows.map((r) => [r.name, r.total, r.calledPct]), [['NEMT', 12, 42], ['No list', 5, 0]], 'per-list totals and share called; empty lists are left out');
eq(res.rows[0].counts, { Interested: 3, 'Not called': 7, Other: 2 }, 'counts per result');
const pipes = [{ id: 'p', name: 'Sales' }], stages = [{ id: 's2', pipeline_id: 'p', name: 'Demo', sort: 2 }, { id: 's1', pipeline_id: 'p', name: 'Qualified', sort: 1 }];
const dl = shapeDeals([
  { stage_id: 's1', status: 'open', currency: 'USD', n: 2, total: 1000 }, { stage_id: 's1', status: 'open', currency: 'GBP', n: 1, total: 500 },
  { stage_id: 's2', status: 'won', currency: 'USD', n: 1, total: 3000 }, { stage_id: 's2', status: 'lost', currency: 'USD', n: 2, total: 0 },
], pipes, stages);
eq(dl.pipelines[0].stages.map((s) => [s.name, s.open]), [['Qualified', 3], ['Demo', 0]], 'stages in order with open counts');
eq(dl.pipelines[0].stages[0].value.includes('$1,000') && dl.pipelines[0].stages[0].value.includes('£500'), true, 'values kept per currency');
eq([dl.won.n, dl.lost.n, dl.lost.value], [1, 2, ''], 'won and lost');
const f = shapeFunnel({ organizations: 200, called: 100, interested: 20, deals: 10, won: 2 });
eq(f.map((x) => [x.label, x.n, x.pct]), [['Organizations', 200, null], ['Called', 100, 50], ['Interested', 20, 20], ['Deal created', 10, 50], ['Won', 2, 20]], 'funnel shows the share kept at each step');
eq(shapeFunnel({}).every((x) => x.n === 0), true, 'empty funnel does not break');
const sb = { rpc: async (n) => (n === 'dashboard_deals' ? { data: null, error: { message: 'boom' } } : { data: [], error: null }) };
let m = ''; try { await loadDashboard(sb, 'UTC'); } catch (e) { m = e.message; } eq(m, 'boom', 'a failing query is reported');
console.log(bad ? `${bad} FAILED` : 'ALL PASSED');
