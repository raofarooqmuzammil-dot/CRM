import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { createClient } from '../../../lib/supabase/server';
import LabelTags from '../../../components/LabelTags';
import AddColumn from '../../../components/AddColumn';
import { CustomInputs, formatValue } from '../../../components/CustomFields';
import { loadFields, collectCustom } from '../../../lib/custom';

const ZONES = [
  ['America/New_York', 'US Eastern'], ['America/Chicago', 'US Central'],
  ['America/Denver', 'US Mountain'], ['America/Los_Angeles', 'US Pacific'],
  ['Europe/London', 'UK'], ['Australia/Sydney', 'AU Sydney / Melbourne'],
  ['Australia/Brisbane', 'AU Brisbane'], ['Australia/Adelaide', 'AU Adelaide'],
  ['Australia/Perth', 'AU Perth'],
];

export default async function Organizations({ searchParams }) {
  const sp = searchParams || {};
  const supabase = createClient();
  const cfields = await loadFields(supabase, 'organization');
  let query = supabase.from('organizations')
    .select('id, name, phone, website, country, time_zone, visible_to, label_ids, custom')
    .order('created_at', { ascending: false }).limit(200);
  const term = String(sp.q || '').replace(/[%,()*]/g, ' ').trim();
  if (term) query = query.or(`name.ilike.%${term}%,phone.ilike.%${term}%,website.ilike.%${term}%`);
  if (sp.label) query = query.contains('label_ids', [sp.label]);
  if (sp.country) query = query.eq('country', sp.country);
  const [{ data: orgs }, { data: labels }] = await Promise.all([
    query, supabase.from('labels').select('id, name, color').order('name'),
  ]);
  const filtered = Boolean(term || sp.label || sp.country);

  async function addOrganization(formData) {
    'use server';
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('organizations').insert({
      name: formData.get('name'),
      custom: collectCustom(formData, await loadFields(supabase, 'organization')),
      phone: formData.get('phone') || null,
      website: formData.get('website') || null,
      country: formData.get('country') || null,
      time_zone: formData.get('time_zone') || null,
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
      <section className="panel">
        <form className="grid" method="get">
          <label>Search<input name="q" defaultValue={sp.q || ''} placeholder="Name, phone, or website" /></label>
          <label>Label
            <select name="label" defaultValue={sp.label || ''}><option value="">Any</option>
              {labels?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          </label>
          <label>Country
            <select name="country" defaultValue={sp.country || ''}><option value="">Any</option>
              <option value="US">United States</option><option value="UK">United Kingdom</option>
              <option value="AU">Australia</option></select>
          </label>
          <button type="submit">Filter</button>
          {filtered && <Link href="/organizations">Clear filters</Link>}
        </form>
      </section>
      <details className="panel">
        <summary><strong>Add organization</strong></summary>
        <form className="grid" action={addOrganization}>
          <label>Name<input name="name" required /></label>
          <label>Phone<input name="phone" type="tel" /></label>
          <label>Website<input name="website" /></label>
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
                      <label className="check" key={l.id}>
                        <input type="checkbox" name="label_ids" value={l.id} /> {l.name}
                      </label>))
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
      <AddColumn entity="organization" />
      <section className="panel">
        <p className="muted">{orgs?.length || 0}{orgs?.length === 200 ? '+' : ''} {filtered ? 'matching' : ''} organizations</p>
        {orgs?.length ? (
          <table>
            <thead><tr><th>Name</th><th>Labels</th><th>Phone</th><th>Website</th><th>Country</th><th>Time zone</th>{cfields.map((f) => <th key={f.id}>{f.name}</th>)}</tr></thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.id}>
                  <td><Link href={`/organizations/${o.id}`}>{o.name}</Link> {o.visible_to === 'private' && <span className="tag">Private</span>}</td>
                  <td><LabelTags ids={o.label_ids} labels={labels} /></td>
                  <td>{o.phone}</td><td>{o.website}</td><td>{o.country}</td><td>{o.time_zone}</td>
                  {cfields.map((f) => <td key={f.id}>{formatValue(f, o.custom?.[f.id])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="empty">{filtered ? 'No organizations match these filters.' : 'No organizations yet. Add the first one above.'}</p>}
      </section>
    </>
  );
}
