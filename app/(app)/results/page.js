import Link from 'next/link';
import { getClient, getUser } from '../../../lib/supabase/server';
import LocalTime from '../../../components/LocalTime';
import { localTime } from '../../../lib/zones';
import { loadBoard } from '../../../lib/results';
import { pageHref } from '../../../lib/gridrows';
import { createDealFromOrg } from '../../actions/results';

const rel = (iso) => {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} minutes ago` : m < 1440 ? `${Math.round(m / 60)} hours ago` : `${Math.round(m / 1440)} days ago`;
};

export default async function Results({ searchParams }) {
  const sp = searchParams || {};
  const supabase = getClient();
  const user = await getUser();
  const owner = sp.owner === 'mine' ? user.id : sp.owner || '';
  const since = sp.window === '7' || sp.window === '30' ? new Date(Date.now() - Number(sp.window) * 86400000).toISOString() : '';

  const [{ data: outcomes }, { data: lists }, { data: people }, { data: pipes }] = await Promise.all([
    supabase.from('call_outcomes').select('id, name').order('sort').order('created_at'),
    supabase.from('lists').select('id, name, color').order('name'),
    supabase.from('profiles').select('id, full_name').order('full_name'),
    supabase.from('pipelines').select('id').limit(1),
  ]);
  const board = await loadBoard(supabase, { list: sp.list || '', owner, since, outcomes: outcomes || [] });

  const ids = board.flatMap((c) => c.rows.map((r) => r.id));
  const [{ data: acts }, { data: deals }] = ids.length
    ? await Promise.all([
        supabase.from('activities').select('organization_id, due_at').in('organization_id', ids).eq('done', false).order('due_at'),
        supabase.from('deals').select('id, organization_id').in('organization_id', ids).eq('status', 'open'),
      ])
    : [{ data: [] }, { data: [] }];
  const next = new Map(); (acts || []).forEach((a) => { if (!next.has(a.organization_id)) next.set(a.organization_id, a.due_at); });
  const dealOf = new Map((deals || []).map((d) => [d.organization_id, d.id]));
  const listOf = new Map((lists || []).map((l) => [l.id, l]));
  const nameOf = new Map((people || []).map((p) => [p.id, p.full_name]));
  const mine = sp.owner === 'mine';

  return (
    <>
      <h1>Results</h1>
      <p className="muted">Each column is the latest result for an organization, including calls to its contacts. Logging a new call moves it.</p>
      <section className="panel">
        <form className="grid" method="get">
          <label>List
            <select name="list" defaultValue={sp.list || ''}><option value="">All lists</option>
              {lists?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}<option value="none">No list</option></select>
          </label>
          <label>Owner
            <select name="owner" defaultValue={sp.owner || ''}><option value="">Anyone</option><option value="mine">Mine</option>
              {people?.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>
          </label>
          <label>Called
            <select name="window" defaultValue={sp.window || ''}><option value="">Any time</option>
              <option value="7">In the last 7 days</option><option value="30">In the last 30 days</option></select>
          </label>
          <button type="submit">Apply</button>
          {(sp.list || sp.owner || sp.window) && <Link href="/results">Clear</Link>}
        </form>
      </section>
      <div className="board">
        {board.map((c) => {
          const hot = c.name.trim().toLowerCase() === 'interested';
          return (
            <section className={'col' + (hot ? ' hot' : '')} key={c.key}>
              <h2>{c.name} ({c.count})</h2>
              {c.viewAll && c.count > c.rows.length && (
                <p className="muted"><Link href={pageHref('/organizations', { list: sp.list, owner: mine ? '' : owner, last: c.viewAll }, {})}>View all {c.count}</Link></p>
              )}
              {c.rows.map((o) => {
                const list = listOf.get(o.list_id);
                return (
                  <article className="card" key={o.id}>
                    <Link href={`/organizations/${o.id}`}><strong>{o.name}</strong></Link>
                    <div>{o.phone && <a href={`tel:${o.phone}`}>{o.phone}</a>}{o.time_zone && <span className="muted"> · {localTime(o.time_zone)}</span>}</div>
                    {list && <div><span className="tag" style={{ background: list.color + '26', color: list.color }}>{list.name}</span></div>}
                    <div className="muted">
                      {o.last_called_at ? `Called ${rel(o.last_called_at)}${nameOf.get(o.last_called_by) ? ` by ${nameOf.get(o.last_called_by)}` : ''}` : 'Not called yet'}
                      {o.call_count > 0 && ` · ${o.call_count} calls`}
                    </div>
                    {next.get(o.id) && <div className="muted">Follow-up: <LocalTime iso={next.get(o.id)} /></div>}
                    {hot && (dealOf.get(o.id)
                      ? <Link href={`/deals/${dealOf.get(o.id)}`}>View deal</Link>
                      : pipes?.length ? (
                        <form action={createDealFromOrg}><input type="hidden" name="id" value={o.id} />
                          <button className="ghost" type="submit">Create deal</button></form>
                      ) : null)}
                  </article>
                );
              })}
              {!c.rows.length && <p className="muted">Nothing here</p>}
            </section>
          );
        })}
      </div>
    </>
  );
}
