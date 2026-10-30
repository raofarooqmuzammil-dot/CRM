import { money } from './money';

const lower = (v) => String(v || '').trim().toLowerCase();

export async function loadDashboard(s, tz) {
  const r = await Promise.all([
    s.rpc('dashboard_calls', { p_tz: tz }), s.rpc('dashboard_followups', { p_tz: tz }),
    s.rpc('dashboard_results'), s.rpc('dashboard_deals'), s.rpc('dashboard_funnel'),
  ]);
  const bad = r.find((x) => x.error);
  if (bad) throw new Error(bad.error.message);
  return { calls: r[0].data || [], followups: r[1].data?.[0] || { due_today: 0, overdue: 0 }, results: r[2].data || [], deals: r[3].data || [], funnel: r[4].data?.[0] || {} };
}

// Today / this week / last week totals, and one row per caller.
export function shapeCalls(rows, people) {
  const t = { today: 0, week: 0, lastWeek: 0, interestedToday: 0, interestedWeek: 0, interestedLastWeek: 0 };
  const by = new Map();
  for (const r of rows) {
    const n = Number(r.n); const yes = lower(r.outcome) === 'interested'; const no = lower(r.outcome) === 'not interested';
    const c = by.get(r.caller) || { id: r.caller, today: 0, week: 0, interested: 0, notInterested: 0 };
    if (r.bucket === 'last_week') { t.lastWeek += n; if (yes) t.interestedLastWeek += n; }
    else {
      t.week += n; c.week += n; if (yes) { t.interestedWeek += n; c.interested += n; } if (no) c.notInterested += n;
      if (r.bucket === 'today') { t.today += n; c.today += n; if (yes) t.interestedToday += n; }
    }
    by.set(r.caller, c);
  }
  const name = new Map(people.map((p) => [p.id, p.full_name]));
  const byCaller = [...by.values()].map((c) => ({ ...c, name: name.get(c.id) || 'Former user' }))
    .sort((a, b) => b.week - a.week || a.name.localeCompare(b.name));
  return { totals: t, byCaller };
}

// For each list: how many organizations sit in each latest result.
export function shapeResults(rows, lists, outcomes) {
  const names = outcomes.map((o) => o.name); const known = new Set(names);
  const groups = new Map();
  for (const r of rows) {
    const key = r.list_id || 'none'; const g = groups.get(key) || {};
    const col = r.outcome == null ? 'Not called' : known.has(r.outcome) ? r.outcome : 'Other';
    g[col] = (g[col] || 0) + Number(r.n); groups.set(key, g);
  }
  const hasOther = [...groups.values()].some((g) => g.Other);
  const columns = [...names, ...(hasOther ? ['Other'] : []), 'Not called'];
  const order = [...lists.map((l) => ({ key: l.id, name: l.name, color: l.color })), { key: 'none', name: 'No list', color: '#66726f' }];
  const out = order.filter((o) => groups.has(o.key)).map((o) => {
    const g = groups.get(o.key); const total = Object.values(g).reduce((a, b) => a + b, 0);
    return { ...o, counts: g, total, calledPct: total ? Math.round(((total - (g['Not called'] || 0)) / total) * 100) : 0 };
  });
  return { columns, rows: out };
}

const fmt = (m) => Object.entries(m).filter(([, v]) => v > 0).map(([c, v]) => money(v, c)).join(' · ');

// Deals in each pipeline stage, plus won and lost.
export function shapeDeals(rows, pipelines, stages) {
  const open = new Map(); const won = { n: 0, v: {} }; const lost = { n: 0, v: {} };
  for (const r of rows) {
    const n = Number(r.n), v = Number(r.total);
    if (r.status === 'open') { const a = open.get(r.stage_id) || { n: 0, v: {} }; a.n += n; a.v[r.currency] = (a.v[r.currency] || 0) + v; open.set(r.stage_id, a); }
    else { const b = r.status === 'won' ? won : lost; b.n += n; b.v[r.currency] = (b.v[r.currency] || 0) + v; }
  }
  return {
    pipelines: pipelines.map((p) => ({
      id: p.id, name: p.name,
      stages: stages.filter((s) => s.pipeline_id === p.id).sort((a, b) => a.sort - b.sort)
        .map((s) => ({ name: s.name, open: open.get(s.id)?.n || 0, value: fmt(open.get(s.id)?.v || {}) })),
    })),
    won: { n: won.n, value: fmt(won.v) }, lost: { n: lost.n, value: fmt(lost.v) },
  };
}

// Called > Interested > Deal > Won, with the share kept at each step.
export function shapeFunnel(f) {
  const steps = [['Organizations', f.organizations], ['Called', f.called], ['Interested', f.interested], ['Deal created', f.deals], ['Won', f.won]];
  return steps.map(([label, v], i) => {
    const n = Number(v || 0), prev = i ? Number(steps[i - 1][1] || 0) : 0;
    return { label, n, pct: i && prev ? Math.round((n / prev) * 100) : null, width: steps[0][1] ? Math.max(2, Math.round((n / Number(steps[0][1])) * 100)) : 0 };
  });
}
