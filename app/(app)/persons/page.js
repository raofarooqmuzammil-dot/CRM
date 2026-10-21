import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { createClient } from '../../../lib/supabase/server';
import LocalTime from '../../../components/LocalTime';
import LabelTags from '../../../components/LabelTags';

export default async function Persons() {
  const supabase = createClient();
  const [{ data: persons }, { data: orgs }, { data: labels }, { data: upcoming }] = await Promise.all([
    supabase
      .from('persons')
      .select('id, name, phone, email, label_ids, visible_to, do_not_call, organizations(name), owner:profiles!persons_owner_id_fkey(full_name)')
      .order('created_at', { ascending: false }),
    supabase.from('organizations').select('id, name').order('name'),
    supabase.from('labels').select('id, name, color').order('name'),
    supabase.from('activities').select('person_id, due_at').eq('done', false).not('person_id', 'is', null).order('due_at'),
  ]);
  const next = new Map();
  (upcoming || []).forEach((a) => { if (!next.has(a.person_id)) next.set(a.person_id, a.due_at); });

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
        <h2>Add person</h2>
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
          <label>Visible to
            <select name="visible_to"><option value="everyone">Everyone</option>
              <option value="private">Private (me and admin)</option></select>
          </label>
          <label className="check"><input name="do_not_call" type="checkbox" /> Do not call</label>
          <button type="submit">Save person</button>
        </form>
      </section>
      <section className="panel">
        {persons?.length ? (
          <table>
            <thead><tr><th>Name</th><th>Organization</th><th>Phone</th><th>Labels</th><th>Next follow-up</th><th>Owner</th></tr></thead>
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
                  <td><LabelTags ids={p.label_ids} labels={labels} /></td>
                  <td>{next.has(p.id) ? <LocalTime iso={next.get(p.id)} /> : <span className="muted">None</span>}</td>
                  <td>{p.owner?.full_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="empty">No persons yet. Add the first one above.</p>}
      </section>
    </>
  );
}
