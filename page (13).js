import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { ZONES } from '../../../../lib/zones';
import { createClient } from '../../../../lib/supabase/server';
import { CustomInputs, CustomValues } from '../../../../components/CustomFields';
import { loadFields, collectCustom } from '../../../../lib/custom';

export default async function OrganizationPage({ params }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: org } = await supabase.from('organizations')
    .select('id, name, phone, website, address, country, time_zone, visible_to, owner_id, label_ids, custom, time_zone_guessed')
    .eq('id', params.id).maybeSingle();
  if (!org) notFound();
  const cfields = await loadFields(supabase, 'organization');
  const [{ data: me }, { data: people }, { data: members }, { data: labels }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).single(),
    supabase.from('profiles').select('id, full_name').order('full_name'),
    supabase.from('persons').select('id, name, phone, email').eq('organization_id', org.id).order('name'),
    supabase.from('labels').select('id, name').order('name'),
  ]);

  async function updateOrg(fd) {
    'use server';
    const s = createClient();
    const fl = await loadFields(s, 'organization');
    const { data: cur } = await s.from('organizations').select('custom, time_zone, time_zone_guessed').eq('id', params.id).single();
    const { error } = await s.from('organizations').update({
      custom: collectCustom(fd, fl, cur?.custom || {}),
      name: fd.get('name'), phone: fd.get('phone') || null, website: fd.get('website') || null,
      address: fd.get('address') || null, country: fd.get('country') || null,
      time_zone: fd.get('time_zone') || null,
      time_zone_guessed: (fd.get('time_zone') || null) === cur?.time_zone ? Boolean(cur?.time_zone_guessed) : false, visible_to: fd.get('visible_to'),
      owner_id: fd.get('owner_id') || null,
      label_ids: fd.getAll('label_ids'),
    }).eq('id', params.id);
    if (error) throw new Error(error.message);
    revalidatePath('/', 'layout');
  }
  async function deleteOrg() {
    'use server';
    const { error } = await createClient().from('organizations').delete().eq('id', params.id);
    if (error) throw new Error(error.message);
    revalidatePath('/', 'layout');
    redirect('/organizations');
  }

  return (
    <>
      <p><Link href="/organizations">Back to organizations</Link></p>
      <h1>{org.name}</h1>
      {cfields.some((f) => org.custom?.[f.id] !== undefined && org.custom?.[f.id] !== '') && (
        <section className="panel"><CustomValues fields={cfields} values={org.custom} /></section>
      )}
      <section className="panel">
        <h2>People ({members?.length || 0})</h2>
        {members?.length ? (
          <table><tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td><Link href={`/persons/${m.id}`}>{m.name}</Link></td>
                <td>{m.phone && <a href={`tel:${m.phone}`}>{m.phone}</a>}</td>
                <td>{m.email}</td>
              </tr>
            ))}
          </tbody></table>
        ) : <p className="empty">No people in this organization yet.</p>}
      </section>
      <section className="panel">
        <h2>Edit organization</h2>
        <form className="grid" action={updateOrg}>
          <label>Name<input name="name" defaultValue={org.name} required /></label>
          <label>Phone<input name="phone" type="tel" defaultValue={org.phone || ''} /></label>
          <label>Website<input name="website" defaultValue={org.website || ''} /></label>
          <label>Address<input name="address" defaultValue={org.address || ''} /></label>
          <label>Country
            <select name="country" defaultValue={org.country || ''}><option value="">Not set</option>
              <option value="US">United States</option><option value="UK">United Kingdom</option>
              <option value="AU">Australia</option></select>
          </label>
          <label>Time zone{org.time_zone_guessed && ' (guessed, please check)'}
            <select name="time_zone" defaultValue={org.time_zone || ''}><option value="">Not set</option>
              {ZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </label>
          <label>Labels
            <details className="pick"><summary>Choose labels</summary>
              <div className="menu">
                {labels?.map((l) => (
                  <label className="check" key={l.id}>
                    <input type="checkbox" name="label_ids" value={l.id} defaultChecked={org.label_ids?.includes(l.id)} /> {l.name}
                  </label>))}
              </div>
            </details>
          </label>
          <label>Owner
            <select name="owner_id" defaultValue={org.owner_id || ''}><option value="">None</option>
              {people?.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>
          </label>
          <label>Visible to
            <select name="visible_to" defaultValue={org.visible_to}><option value="everyone">Everyone</option>
              <option value="private">Private (owner and admin)</option></select>
          </label>
          <CustomInputs fields={cfields} values={org.custom} />
          <button type="submit">Save organization</button>
          {me?.role === 'admin' && <button type="submit" className="ghost danger" formAction={deleteOrg} formNoValidate>Delete organization</button>}
        </form>
      </section>
    </>
  );
}
