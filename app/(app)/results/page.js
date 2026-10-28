import Link from 'next/link';
import { getClient, getUser } from '../../../lib/supabase/server';
import ResultsBoard from '../../../components/ResultsBoard';
import { localTime } from '../../../lib/zones';
import { loadBoard } from '../../../lib/results';
import { pageHref } from '../../../lib/gridrows';

const rel = (iso) => {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};
const ORDERS = [['recent', 'Recently called'], ['oldest', 'Called longest ago'], ['name', 'Name A to Z'], ['calls', 'Most calls']];

export default async function Results({ searchParams }) {
  const sp = searchParams || {};
  const supabase = getClient();
  const user = await getUser();
  const owner = sp.owner === 'mine' ? user.id : sp.owner || '';
  const since = sp.window === '7' || sp.window === '30' ? new Date(Date.now() - Number(sp.window) * 86400000).toISOString() : '';
  const order = ORDERS.some(([k]) => k === sp.order) ? sp.order : 'recent';

  const [{ data: outcomes }, { data: lists }, { data: people }, { data: pipes }] = await Promise.all([
    supabase.from('call_outcomes').select('id, name').order('sort').order('created_at'),
    supabase.from('lists').select('id, name, color').order('name'),
    supabase.from('profiles').select('id, full_name').order('full_name'),
    supabase.from('pipelines').select('id').limit(1),
  ]);
  const board = await loadBoard(supabase, { list: sp.list || '', owner, since, order, outcomes: outcomes || [] });

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

  const columns = board.map((c) => ({
    key: c.key, name: c.name, count: c.count, hot: c.name.trim().toLowerCase() === 'interested',
    viewAllHref: c.viewAll ? pageHref('/organizations', { list: sp.list, owner: sp.owner === 'mine' ? '' : owner, last: c.viewAll }, {}) : null,
    cards: c.rows.map((o) => ({
      id: o.id, name: o.name, phone: o.phone || '', localTime: localTime(o.time_zone), list: listOf.get(o.list_id) || null,
      calledText: o.last_called_at ? `${rel(o.last_called_at)}${nameOf.get(o.last_called_by) ? ` by ${nameOf.get(o.last_called_by)}` : ''}` : 'Not called',
      calls: o.call_count || 0, followup: next.get(o.id) || null, dealId: dealOf.get(o.id) || null,
    })),
  }));

  return (
    <>
      <h1>Results</h1>
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
          <label>Sort cards
            <select name="order" defaultValue={order}>{ORDERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </label>
          <button type="submit">Apply</button>
          {(sp.list || sp.owner || sp.window || sp.order) && <Link href="/results">Clear</Link>}
        </form>
      </section>
      <ResultsBoard columns={columns} hasPipeline={Boolean(pipes?.length)} />
    </>
  );
}
