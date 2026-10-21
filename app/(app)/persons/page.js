import { revalidatePath } from 'next/cache';
import { createClient } from '../../../lib/supabase/server';

export default async function Persons() {
  const supabase = createClient();
  const [{ data: persons }, { data: orgs }] = await Promise.all([
    supabase
      .from('persons')
      .select('id, name, phone, email, labels, visible_to, do_not_call, organizations(name), owner:profiles!persons_owner_id_fkey(full_name)')
      .order('created_at', { ascending: false }),
    supabase.from('organizations').select('id, name').order('name'),
  ]);

  async function addPerson(formData) {
    'use server';
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const labels = String(formData.get('labels') || '').split(',').map((s) => s.trim()).filter(Boolean);
    const { error } = await supabase.from('persons').insert({
      name: formData.get('name'),
      organization_id: formData.get('organization_id') || null,
      phone: formData.get('phone') || null,
      email: formData.get('email') || null,
      labels,
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
          <label>Labels (comma separated)<input name="labels" /></label>
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
            <thead><tr><th>Name</th><th>Organization</th><th>Phone</th><th>Email</th><th>Labels</th><th>Owner</th></tr></thead>
            <tbody>
              {persons.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.name}{' '}
                    {p.visible_to === 'private' && <span className="tag">Private</span>}
                    {p.do_not_call && <span className="tag warn">Do not call</span>}
                  </td>
                  <td>{p.organizations?.name}</td>
                  <td>{p.phone && <a href={`tel:${p.phone}`}>{p.phone}</a>}</td>
                  <td>{p.email}</td>
                  <td>{p.labels?.map((l) => <span className="tag" key={l}>{l}</span>)}</td>
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
