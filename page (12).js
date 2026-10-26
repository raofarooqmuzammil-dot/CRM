import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { createClient, getClient, getUser } from '../../../lib/supabase/server';
import Grid from '../../../components/Grid';
import AddColumn from '../../../components/AddColumn';
import { CustomInputs } from '../../../components/CustomFields';
import { ZONES, zonesInHours } from '../../../lib/zones';
import { getHours } from '../../../lib/hours';
import { loadFields, collectCustom } from '../../../lib/custom';
import { PAGE_SIZE, orgColumns, orgRows, pageHref, sortHrefs } from '../../../lib/gridrows';

const SORTS = { name: 'name', country: 'country', calls: 'call_count' };

export default async function Organizations({ searchParams }) {
  const sp = searchParams || {};
  const supabase = getClient();
  const page = Math.max(1, Number(sp.page) || 1);
  const [cfields, hours, { data: labels }, { data: people }, { data: lists }] = await Promise.all([
    loadFields(supabase, 'organization'), getHours(supabase),
    supabase.from('labels').select('id, name, color').order('name'),
    supabase.from('profiles').select('id, full_name').order('full_name'),
    supabase.from('lists').select('id, name, color').order('sort').order('created_at'),
  ]);

  let query = supabase.from('organizations').select(
    'id, name, phone, email, website, address, country, time_zone, label_ids, owner_id, list_id, custom, do_not_call, possible_duplicate, call_count, last_outcome, persons(count)',
    { count: 'exact' });
  const term = String(sp.q || '').replace(/[%,()*]/g, ' ').trim();
  if (term) query = query.or(`name.ilike.%${term}%,phone.ilike.%${term}%,website.ilike.%${term}%,email.ilike.%${term}%`);
  if (sp.list === 'none') query = query.is('list_id', null);
  else if (sp.list) query = query.eq('list_id', sp.list);
  if (sp.label) query = query.contains('label_ids', [sp.label]);
  if (sp.country) query = query.eq('country', sp.country);
  if (sp.owner) query = query.eq('owner_id', sp.owner);
  if (sp.dup) query = query.eq('possible_duplicate', true);
  if (sp.calling) { const z = zonesInHours(hours); query = query.in('time_zone', z.length ? z : ['none']); }
  if (sp.calls === 'none') query = query.eq('call_count', 0);
  if (sp.calls === 'few') query = query.gte('call_count', 1).lte('call_count', 2);
  if (sp.calls === 'many') query = query.gte('call_count', 3);
  const sortCol = SORTS[sp.sort];
  query = (sortCol ? query.order(sortCol, { ascending: sp.dir === 'asc', nullsFirst: false }) : query.order('created_at', { ascending: false })).order('id');
  const from = (page - 1) * PAGE_SIZE;

  const count = (q) => q.then((r) => r.count || 0);
  const [{ data: orgs, count: total }, allCount, noneCount, ...listCounts] = await Promise.all([
    query.range(from, from + PAGE_SIZE - 1),
    count(supabase.from('organizations').select('id', { count: 'exact', head: true })),
    count(supabase.from('organizations').select('id', { count: 'exact', head: true }).is('list_id', null)),
    ...(lists || []).map((l) => count(supabase.from('organizations').select('id', { count: 'exact', head: true }).eq('list_id', l.id))),
  ]);

  const ids = (orgs || []).map((o) => o.id);
  const { data: acts } = ids.length
    ? await supabase.from('activities').select('organization_id, due_at').in('organization_id', ids).eq('done', false).order('due_at')
    : { data: [] };
  const next = new Map();
  (acts || []).forEach((a) => { if (!next.has(a.organization_id)) next.set(a.organization_id, a.due_at); });

  const columns = orgColumns(cfields, people || [], lists || []);
  const rows = orgRows(orgs || [], { cfields, next });
  const filtered = Boolean(term || sp.label || sp.country || sp.owner || sp.dup || sp.calling || sp.calls);
  const lastPage = Math.max(1, Math.ceil((total || 0) / PAGE_SIZE));
  const tab = (id, label, n) => (
    <Link key={id || 'all'} href={pageHref('/organizations', sp, { list: id, page: '' })}
      className={(sp.list || '') === (id || '') ? 'on' : ''}>{label}<span className="count">{n}</span></Link>
  );

  async function addOrganization(formData) {
    'use server';
    const s = createClient();
    const user = await getUser();
    const { error } = await s.from('organizations').insert({
      name: formData.get('name'),
      custom: collectCustom(formData, await loadFields(s, 'organization')),
      phone: formData.get('phone') || null,
      email: formData.get('email') || null,
      website: formData.get('website') || null,
      country: formData.get('country') || null,
      time_zone: formData.get('time_zone') || null,
      list_id: formData.get('list_id') || null,
      label_ids: formData.getAll('label_ids'),
      visible_to: formData.get('visible_to'),
      owner_id: user.id,
      created_by: user.id,
    });
    if (error) throw new Error(error.message);
    revalidatePath('/organizations');
  }

  return (
    <>
      <h1>Organizations</h1>
      <p className="tabs">
        {tab('', 'All', allCount)}
        {(lists || []).map((l, i) => tab(l.id, l.name, listCounts[i]))}
        {noneCount > 0 && tab('none', 'No list', noneCount)}
      </p>
      <section className="panel">
        <form className="grid" method="get">
          {sp.list && <input type="hidden" name="list" value={sp.list} />}
          <label>Search<input name="q" defaultValue={sp.q || ''} placeholder="Name, phone, website, or email" /></label>
          <label>Label
            <select name="label" defaultValue={sp.label || ''}><option value="">Any</option>
              {labels?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          </label>
          <label>Country
            <select name="country" defaultValue={sp.country || ''}><option value="">Any</option>
              <option value="US">United States</option><option value="UK">United Kingdom</option>
              <option value="AU">Australia</option></select>
          </label>
          <label>Owner
            <select name="owner" defaultValue={sp.owner || ''}><option value="">Anyone</option>
              {people?.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>
          </label>
          <label>Calls made
            <select name="calls" defaultValue={sp.calls || ''}><option value="">Any</option>
              <option value="none">Not called yet</option><option value="few">1 to 2 calls</option>
              <option value="many">3 or more calls</option></select>
          </label>
          <label>Duplicates
            <select name="dup" defaultValue={sp.dup || ''}><option value="">All</option><option value="1">Possible duplicates only</option></select>
          </label>
          <label>Time
            <select name="calling" defaultValue={sp.calling || ''}><option value="">Any</option><option value="1">Calling now ({hours.start}:00 to {hours.end}:00 local)</option></select>
          </label>
          <button type="submit">Filter</button>
          {filtered && <Link href={pageHref('/organizations', { list: sp.list }, {})}>Clear filters</Link>}
        </form>
      </section>
      <details className="panel">
        <summary><strong>Add organization</strong></summary>
        <form className="grid" action={addOrganization}>
          <label>Name<input name="name" required /></label>
          <label>Phone<input name="phone" type="tel" /></label>
          <label>Email<input name="email" type="email" /></label>
          <label>Website<input name="website" /></label>
          <label>List (industry)
            <select name="list_id" defaultValue={sp.list && sp.list !== 'none' ? sp.list : ''}><option value="">No list</option>
              {lists?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          </label>
          <label>Country
            <select name="country"><option value="">Not set</option>
              <option value="US">United States</option><option value="UK">United Kingdom</option>
              <option value="AU">Australia</option></select>
          </label>
          <label>Time zone
            <select name="time_zone"><option value="">Not set</option>
              {ZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </label>
          <label>Labels
            <details className="pick"><summary>Choose labels</summary>
              <div className="menu">
                {labels?.length
                  ? labels.map((l) => (
                      <label className="check" key={l.id}><input type="checkbox" name="label_ids" value={l.id} /> {l.name}</label>))
                  : <span className="muted">No labels yet. Add some in Settings.</span>}
              </div>
            </details>
          </label>
          <label>Visible to
            <select name="visible_to"><option value="everyone">Everyone</option>
              <option value="private">Private (me and admin)</option></select>
          </label>
          <CustomInputs fields={cfields} />
          <button type="submit">Save organization</button>
        </form>
      </details>
      <AddColumn entity="organization" open={Boolean(sp.addcol)} />
      <Grid
        entity="organizations" columns={columns} rows={rows} labels={labels || []} lists={lists || []}
        storageKey="callcrm-cols:organizations"
        sortHrefs={sortHrefs('/organizations', sp, columns)} sort={sortCol ? sp.sort : ''} dir={sp.dir}
        addHref={pageHref('/organizations', sp, { addcol: 1 }) + '#addcol'}
        total={total || 0} from={total ? from + 1 : 0} to={Math.min(from + PAGE_SIZE, total || 0)}
        prevHref={page > 1 ? pageHref('/organizations', sp, { page: page - 1 }) : null}
        nextHref={page < lastPage ? pageHref('/organizations', sp, { page: page + 1 }) : null}
      />
    </>
  );
}
