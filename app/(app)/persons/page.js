import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { createClient } from '../../../lib/supabase/server';
import LocalTime from '../../../components/LocalTime';
import LabelTags from '../../../components/LabelTags';
import { ZONES, localTime, zonesInHours } from '../../../lib/zones';
import { getHours } from '../../../lib/hours';
import AddColumn from '../../../components/AddColumn';
import { CustomInputs, formatValue } from '../../../components/CustomFields';
import { loadFields, collectCustom } from '../../../lib/custom';

export default async function Persons({ searchParams }) {
  const sp = searchParams || {};
  const supabase = createClient();

  const cfields = await loadFields(supabase, 'person');
  const hours = await getHours(supabase);
  let query = supabase
    .from('persons')
    .select('id, name, phone, email, label_ids, visible_to, do_not_call, call_count, last_outcome, custom, eff_time_zone, organizations(name), owner:profiles!persons_owner_id_fkey(full_name)')
    .order('created_at', { ascending: false })
    .limit(200);
  const term = String(sp.q || '').replace(/[%,()*]/g, ' ').trim();
  if (term) query = query.or(`name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`);
  if (sp.label) query = query.contains('label_ids', [sp.label]);
  if (sp.owner) query = query.eq('owner_id', sp.owner);
  if (sp.calling) { const z = zonesInHours(hours); query = query.in('eff_time_zone', z.length ? z : ['none']); }
  if (sp.dup) query = query.eq('possible_duplicate', true);
  if (sp.calls === 'none') query = query.eq('call_count', 0);
  if (sp.calls === 'few') query = query.gte('call_count', 1).lte('call_count', 2);
  if (sp.calls === 'many') query = query.gte('call_count', 3);

  const [{ data: persons }, { data: orgs }, { data: labels }, { data: people }, { data: upcoming }] = await Promise.all([
    query,
    supabase.from('organizations').select('id, name').order('name'),
    supabase.from('labels').select('id, name, color').order('name'),
    supabase.from('profiles').select('id, full_name').order('full_name'),
    supabase.from('activities').select('person_id, due_at').eq('done', false).not('person_id', 'is', null).order('due_at'),
  ]);
  const next = new Map();
  (upcoming || []).forEach((a) => { if (!next.has(a.person_id)) next.set(a.person_id, a.due_at); });
  const filtered = Boolean(term || sp.label || sp.owner || sp.calls || sp.dup || sp.calling);

  async function addPerson(formData) {
    'use server';
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('persons').insert({
      name: formData.get('name'),
      organization_id: formData.get('organization_id') || null,
      phone: formData.get('phone') || null,
      email: formData.get('email') || null,
      label_ids: formData.getAll('label_ids'),
      visible_to: formData.get('visible_to'),
      do_not_call: formData.get('do_not_call') === 'on',
      time_zone: formData.get('time_zone') || null,
      custom: collectCustom(formData, await loadFields(supabase, 'person')),
      owner_id: user.id,
      created_by: user.id,
    });
    if (error) throw new Error(error.message);
    revalidatePath('/persons');
  }

  return (
    <>
      <h1>Persons</h1>
      <section className="panel">
        <form className="grid" method="get">
          <label>Search<input name="q" defaultValue={sp.q || ''} placeholder="Name, phone, or email" /></label>
          <label>Label
            <select name="label" defaultValue={sp.label || ''}><option value="">Any</option>
              {labels?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
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
          {filtered && <Link href="/persons">Clear filters</Link>}
        </form>
      </section>
      <details className="panel">
        <summary><strong>Add person</strong></summary>
        <form className="grid" action={addPerson}>
          <label>Name<input name="name" required /></label>
          <label>Organization
            <select name="organization_id"><option value="">None</option>
              {orgs?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
          </label>
          <label>Phone<input name="phone" type="tel" /></label>
          <label>Email<input name="email" type="email" /></label>
          <label>Labels
            <details className="pick">
              <summary>Choose labels</summary>
              <div className="menu">
                {labels?.length
                  ? labels.map((l) => (
                      <label className="check" key={l.id}>
                        <input type="checkbox" name="label_ids" value={l.id} /> {l.name}
                      </label>))
                  : <span className="muted">No labels yet. Add some in Settings.</span>}
              </div>
            </details>
          </label>
          <label>Time zone
            <select name="time_zone"><option value="">Same as organization</option>
              {ZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </label>
          <label>Visible to
            <select name="visible_to"><option value="everyone">Everyone</option>
              <option value="private">Private (me and admin)</option></select>
          </label>
          <label className="check"><input name="do_not_call" type="checkbox" /> Do not call</label>
          <CustomInputs fields={cfields} />
          <button type="submit">Save person</button>
        </form>
      </details>
      <AddColumn entity="person" />
      <section className="panel">
        <p className="muted">{persons?.length || 0}{persons?.length === 200 ? '+' : ''} {filtered ? 'matching' : ''} persons</p>
        {persons?.length ? (
          <table>
            <thead><tr><th>Name</th><th>Organization</th><th>Phone</th><th>Local time</th><th>Labels</th><th>Calls</th><th>Next follow-up</th><th>Owner</th>{cfields.map((f) => <th key={f.id}>{f.name}</th>)}</tr></thead>
            <tbody>
              {persons.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/persons/${p.id}`}>{p.name}</Link>{' '}
                    {p.visible_to === 'private' && <span className="tag">Private</span>}
                    {p.do_not_call && <span className="tag warn">Do not call</span>}
                  </td>
                  <td>{p.organizations?.name}</td>
                  <td>{p.phone && <a href={`tel:${p.phone}`}>{p.phone}</a>}</td>
                  <td>{localTime(p.eff_time_zone)}</td>
                  <td><LabelTags ids={p.label_ids} labels={labels} /></td>
                  <td>{p.call_count}{p.last_outcome && <div className="muted">{p.last_outcome}</div>}</td>
                  <td>{next.has(p.id) ? <LocalTime iso={next.get(p.id)} /> : <span className="muted">None</span>}</td>
                  <td>{p.owner?.full_name}</td>
                  {cfields.map((f) => <td key={f.id}>{formatValue(f, p.custom?.[f.id])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="empty">{filtered ? 'No persons match these filters.' : 'No persons yet. Add the first one above.'}</p>}
      </section>
    </>
  );
}
