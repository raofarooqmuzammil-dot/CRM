import Link from 'next/link';
import { getClient, getUser } from '../../../lib/supabase/server';
import { getTeamZone } from '../../../lib/hours';
import { loadDashboard, shapeCalls, shapeResults, shapeDeals, shapeFunnel } from '../../../lib/dashboard';
import { TEAM_ZONES } from '../../../lib/zones';

const delta = (now, before) => (before ? `${now >= before ? '+' : ''}${Math.round(((now - before) / before) * 100)}% vs last week` : 'no calls last week');

export default async function Dashboard() {
  const supabase = getClient();
  const user = await getUser();
  const tz = await getTeamZone(supabase);
  const [d, { data: me }, { data: people }, { data: lists }, { data: outcomes }, { data: pipelines }, { data: stages }] = await Promise.all([
    loadDashboard(supabase, tz),
    supabase.from('profiles').select('role').eq('id', user.id).single(),
    supabase.from('profiles').select('id, full_name'),
    supabase.from('lists').select('id, name, color').order('name'),
    supabase.from('call_outcomes').select('id, name').order('sort').order('created_at'),
    supabase.from('pipelines').select('id, name').order('sort').order('created_at'),
    supabase.from('stages').select('id, pipeline_id, name, sort'),
  ]);
  const isAdmin = me?.role === 'admin';
  const calls = shapeCalls(d.calls, people || []);
  const results = shapeResults(d.results, lists || [], outcomes || []);
  const deals = shapeDeals(d.deals, pipelines || [], stages || []);
  const funnel = shapeFunnel(d.funnel);
  const t = calls.totals;

  return (
    <>
      <h1>Dashboard</h1>
      <p className="muted">
        Today and this week use the team time zone ({TEAM_ZONES.find(([z]) => z === tz)?.[1] || tz}). {isAdmin ? <>Change it in <Link href="/settings">Settings</Link>. You see every caller.</> : 'You see your own calls and follow-ups.'}
      </p>

      <div className="stats">
        <div className="stat"><div className="muted">Calls today</div><div className="num">{t.today}</div></div>
        <div className="stat"><div className="muted">Calls this week</div><div className="num">{t.week}</div><div className="muted">{delta(t.week, t.lastWeek)}</div></div>
        <div className="stat"><div className="muted">Interested today</div><div className="num">{t.interestedToday}</div></div>
        <div className="stat"><div className="muted">Interested this week</div><div className="num">{t.interestedWeek}</div><div className="muted">last week {t.interestedLastWeek}</div></div>
        <div className="stat"><div className="muted">Follow-ups due today</div><div className="num">{d.followups.due_today}</div><div className="muted">{d.followups.overdue} overdue</div></div>
      </div>

      <section className="panel">
        <h2>{isAdmin ? 'Calls per caller' : 'Your calls'}</h2>
        {calls.byCaller.length ? (
          <table>
            <thead><tr><th>Caller</th><th>Today</th><th>This week</th><th>Interested</th><th>Not interested</th></tr></thead>
            <tbody>{calls.byCaller.map((c) => <tr key={c.id}><td>{c.name}</td><td>{c.today}</td><td>{c.week}</td><td>{c.interested}</td><td>{c.notInterested}</td></tr>)}</tbody>
          </table>
        ) : <p className="empty">No calls logged this week yet.</p>}
      </section>

      <section className="panel">
        <h2>Results per list</h2>
        {results.rows.length ? (
          <table>
            <thead><tr><th>List</th>{results.columns.map((c) => <th key={c}>{c}</th>)}<th>Total</th><th>Called</th></tr></thead>
            <tbody>
              {results.rows.map((r) => (
                <tr key={r.key}>
                  <td><span className="tag" style={{ background: r.color + '26', color: r.color }}>{r.name}</span></td>
                  {results.columns.map((c) => <td key={c}>{r.counts[c] || 0}</td>)}
                  <td>{r.total}</td>
                  <td><div className="bar"><i style={{ width: r.calledPct + '%' }} /></div><span className="muted">{r.calledPct}%</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="empty">No organizations yet.</p>}
      </section>

      <section className="panel">
        <h2>Funnel</h2>
        {funnel.map((f) => (
          <div className="funnelrow" key={f.label}>
            <span className="flabel">{f.label}</span>
            <div className="bar"><i style={{ width: f.width + '%' }} /></div>
            <span className="fnum">{f.n}{f.pct !== null && <span className="muted"> ({f.pct}% of previous)</span>}</span>
          </div>
        ))}
        <p className="muted">Interested counts organizations that were ever logged as Interested.</p>
      </section>

      <section className="panel">
        <h2>Deals by stage</h2>
        {deals.pipelines.map((p) => (
          <div key={p.id}>
            {deals.pipelines.length > 1 && <h3>{p.name}</h3>}
            <table>
              <thead><tr><th>Stage</th><th>Open deals</th><th>Value</th></tr></thead>
              <tbody>{p.stages.map((s) => <tr key={s.name}><td>{s.name}</td><td>{s.open}</td><td>{s.value || '-'}</td></tr>)}</tbody>
            </table>
          </div>
        ))}
        <p><strong>Won:</strong> {deals.won.n}{deals.won.value && ` (${deals.won.value})`} · <strong>Lost:</strong> {deals.lost.n}{deals.lost.value && ` (${deals.lost.value})`}</p>
      </section>
    </>
  );
}
