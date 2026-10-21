import { revalidatePath } from 'next/cache';
import { createClient } from '../../../lib/supabase/server';

const ZONES = [
  ['America/New_York', 'US Eastern'], ['America/Chicago', 'US Central'],
  ['America/Denver', 'US Mountain'], ['America/Los_Angeles', 'US Pacific'],
  ['Europe/London', 'UK'], ['Australia/Sydney', 'AU Sydney / Melbourne'],
  ['Australia/Brisbane', 'AU Brisbane'], ['Australia/Adelaide', 'AU Adelaide'],
  ['Australia/Perth', 'AU Perth'],
];

export default async function Organizations() {
  const supabase = createClient();
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, name, phone, website, country, time_zone, visible_to')
    .order('created_at', { ascending: false });

  async function addOrganization(formData) {
    'use server';
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('organizations').insert({
      name: formData.get('name'),
      phone: formData.get('phone') || null,
      website: formData.get('website') || null,
      country: formData.get('country') || null,
      time_zone: formData.get('time_zone') || null,
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
        <h2>Add organization</h2>
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
          <label>Visible to
            <select name="visible_to"><option value="everyone">Everyone</option>
              <option value="private">Private (me and admin)</option></select>
          </label>
          <button type="submit">Save organization</button>
        </form>
      </section>
      <section className="panel">
        {orgs?.length ? (
          <table>
            <thead><tr><th>Name</th><th>Phone</th><th>Website</th><th>Country</th><th>Time zone</th></tr></thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.id}>
                  <td>{o.name} {o.visible_to === 'private' && <span className="tag">Private</span>}</td>
                  <td>{o.phone}</td><td>{o.website}</td><td>{o.country}</td><td>{o.time_zone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="empty">No organizations yet. Add the first one above.</p>}
      </section>
    </>
  );
}
