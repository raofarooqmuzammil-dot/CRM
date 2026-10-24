import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { createClient, getClient, getUser } from '../../../lib/supabase/server';
import Grid from '../../../components/Grid';
import AddColumn from '../../../components/AddColumn';
import { CustomInputs } from '../../../components/CustomFields';
import { ZONES } from '../../../lib/zones';
import { loadFields, collectCustom } from '../../../lib/custom';
import { PAGE_SIZE, orgColumns, orgRows, pageHref, sortHrefs } from '../../../lib/gridrows';

const SORTS = { name: 'name', country: 'country' };

export default async function Organizations({ searchParams }) {
  const sp = searchParams || {};
  const supabase = getClient();
  const page = Math.max(1, Number(sp.page) || 1);
  const [cfields, { data: labels }, { data: people }] = await Promise.all([
    loadFields(supabase, 'organization'),
    supabase.from('labels').select('id, name, color').order('name'),
    supabase.from('profiles').select('id, full_name').order('full_name'),
  ]);

  let query = supabase.from('organizations').select(
    'id, name, phone, website, address, country, time_zone, label_ids, owner_id, custom, persons(count)', { count: 'exact' });
  const term = String(sp.q || '').replace(/[%,()*]/g, ' ').trim();
  if (term) query = query.or(`name.ilike.%${term}%,phone.ilike.%${term}%,website.ilike.%${term}%`);
  if (sp.label) query = query.contains('label_ids', [sp.label]);
  if (sp.country) query = query.eq('country', sp.country);
  const sortCol = SORTS[sp.sort];
  query = (sortCol ? query.order(sortCol, { ascending: sp.dir === 'asc', nullsFirst: false }) : query.order('created_at', { ascending: false })).order('id');
  const from = (page - 1) * PAGE_SIZE;
  const { data: orgs, count } = await query.range(from, from + PAGE_SIZE - 1);

  const columns = orgColumns(cfields, people || []);
  const rows = orgRows(orgs || [], { cfields });
  const total = count || 0;
  const filtered = Boolean(term || sp.label || sp.country);
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function addOrganization(formData) {
    'use server';
    const s = createClient();
    const user = await getUser();
    const { error } = await s.from('organizations').insert({
      name: formData.get('name'),
      custom: collectCustom(formData, await loadFields(s, 'organization')),
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
        entity="organizations" columns={columns} rows={rows} labels={labels || []} storageKey="callcrm-cols:organizations"
        sortHrefs={sortHrefs('/organizations', sp, columns)} sort={sortCol ? sp.sort : ''} dir={sp.dir}
        addHref={pageHref('/organizations', sp, { addcol: 1 }) + '#addcol'}
        total={total} from={total ? from + 1 : 0} to={Math.min(from + PAGE_SIZE, total)}
        prevHref={page > 1 ? pageHref('/organizations', sp, { page: page - 1 }) : null}
        nextHref={page < lastPage ? pageHref('/organizations', sp, { page: page + 1 }) : null}
      />
    </>
  );
}
