import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { createClient, getClient, getUser } from '../../../lib/supabase/server';
import Grid from '../../../components/Grid';
import AddColumn from '../../../components/AddColumn';
import { CustomInputs } from '../../../components/CustomFields';
import { ZONES, zonesInHours } from '../../../lib/zones';
import { getHours } from '../../../lib/hours';
import { loadFields, collectCustom } from '../../../lib/custom';
import { resolveOrg } from '../../../lib/orgs';
import { PAGE_SIZE, personColumns, personRows, pageHref, sortHrefs } from '../../../lib/gridrows';

const SORTS = { name: 'name', phone: 'phone', calls: 'call_count' };

export default async function Persons({ searchParams }) {
  const sp = searchParams || {};
  const supabase = getClient();
  const page = Math.max(1, Number(sp.page) || 1);
  const [cfields, hours, { data: labels }, { data: people }] = await Promise.all([
    loadFields(supabase, 'person'), getHours(supabase),
    supabase.from('labels').select('id, name, color').order('name'),
    supabase.from('profiles').select('id, full_name').order('full_name'),
  ]);

  let query = supabase.from('persons').select(
    'id, name, phone, email, notes, label_ids, owner_id, time_zone, eff_time_zone, do_not_call, possible_duplicate, custom, call_count, last_outcome, organizations(id, name)',
    { count: 'exact' });
  const term = String(sp.q || '').replace(/[%,()*]/g, ' ').trim();
  if (term) query = query.or(`name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`);
  if (sp.label) query = query.contains('label_ids', [sp.label]);
  if (sp.owner) query = query.eq('owner_id', sp.owner);
  if (sp.calling) { const z = zonesInHours(hours); query = query.in('eff_time_zone', z.length ? z : ['none']); }
  if (sp.dup) query = query.eq('possible_duplicate', true);
  if (sp.calls === 'none') query = query.eq('call_count', 0);
  if (sp.calls === 'few') query = query.gte('call_count', 1).lte('call_count', 2);
  if (sp.calls === 'many') query = query.gte('call_count', 3);
  const sortCol = SORTS[sp.sort];
  query = (sortCol ? query.order(sortCol, { ascending: sp.dir === 'asc', nullsFirst: false }) : query.order('created_at', { ascending: false })).order('id');
  const from = (page - 1) * PAGE_SIZE;
  const { data: persons, count } = await query.range(from, from + PAGE_SIZE - 1);

  const ids = (persons || []).map((p) => p.id);
  const { data: acts } = ids.length
    ? await supabase.from('activities').select('person_id, due_at').in('person_id', ids).eq('done', false).order('due_at')
    : { data: [] };
  const next = new Map();
  (acts || []).forEach((a) => { if (!next.has(a.person_id)) next.set(a.person_id, a.due_at); });

  const columns = personColumns(cfields, people || []);
  const rows = personRows(persons || [], { cfields, next });
  const total = count || 0;
  const filtered = Boolean(term || sp.label || sp.owner || sp.calls || sp.dup || sp.calling);
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function addPerson(formData) {
    'use server';
    const s = createClient();
    const user = await getUser();
    const orgId = await resolveOrg(s, formData.get('organization_name'), user.id);
    const { error } = await s.from('persons').insert({
      name: formData.get('name'),
      organization_id: orgId,
      phone: formData.get('phone') || null,
      email: formData.get('email') || null,
      label_ids: formData.getAll('label_ids'),
      visible_to: formData.get('visible_to'),
      do_not_call: formData.get('do_not_call') === 'on',
      time_zone: formData.get('time_zone') || null,
      custom: collectCustom(formData, await loadFields(s, 'person')),
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
          <label>Organization (name)<input name="organization_name" placeholder="Created if it does not exist" /></label>
          <label>Phone<input name="phone" type="tel" /></label>
          <label>Email<input name="email" type="email" /></label>
          <label>Labels
            <details className="pick">
              <summary>Choose labels</summary>
              <div className="menu">
                {labels?.length
                  ? labels.map((l) => (
                      <label className="check" key={l.id}><input type="checkbox" name="label_ids" value={l.id} /> {l.name}</label>))
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
      <AddColumn entity="person" open={Boolean(sp.addcol)} />
      <Grid
        entity="persons" columns={columns} rows={rows} labels={labels || []} storageKey="callcrm-cols:persons"
        sortHrefs={sortHrefs('/persons', sp, columns)} sort={sortCol ? sp.sort : ''} dir={sp.dir}
        addHref={pageHref('/persons', sp, { addcol: 1 }) + '#addcol'}
        total={total} from={total ? from + 1 : 0} to={Math.min(from + PAGE_SIZE, total)}
        prevHref={page > 1 ? pageHref('/persons', sp, { page: page - 1 }) : null}
        nextHref={page < lastPage ? pageHref('/persons', sp, { page: page + 1 }) : null}
      />
    </>
  );
}
