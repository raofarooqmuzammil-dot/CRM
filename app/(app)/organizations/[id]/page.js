import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient, getClient, getUser } from '../../../../lib/supabase/server';
import ScheduleForm from '../../../../components/ScheduleForm';
import LogCall from '../../../../components/LogCall';
import LocalTime from '../../../../components/LocalTime';
import LabelTags from '../../../../components/LabelTags';
import { CustomInputs, CustomValues } from '../../../../components/CustomFields';
import { loadFields, collectCustom } from '../../../../lib/custom';
import { parseWho } from '../../../../lib/who';
import { claimNext } from '../../../../lib/queue';
import { callNext } from '../../../actions/queue';
import { getHours } from '../../../../lib/hours';
import { ZONES, localTime, inHours, zoneLabel } from '../../../../lib/zones';

// Kept outside the component: server actions must not capture functions from the page.
const activityFields = (fd) => ({
  title: fd.get('title'), type: fd.get('type'), due_at: fd.get('due_at'),
  location: fd.get('location') || null, description: fd.get('description') || null,
  video_call: fd.get('video_call') === 'on',
});
const rel = (iso) => {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} minutes ago` : m < 1440 ? `${Math.round(m / 60)} hours ago` : `${Math.round(m / 1440)} days ago`;
};

export default async function OrganizationPage({ params, searchParams }) {
  const supabase = getClient();
  const user = await getUser();
  const [{ data: org }, { data: me }, { data: labels }, { data: people }, { data: lists }, { data: contacts },
    { data: acts }, { data: calls }, { data: types }, { data: outcomes }, hours, cfields, { data: roles }] = await Promise.all([
    supabase.from('organizations').select('*').eq('id', params.id).maybeSingle(),
    supabase.from('profiles').select('role, queue_enabled').eq('id', user.id).single(),
    supabase.from('labels').select('id, name, color').order('name'),
    supabase.from('profiles').select('id, full_name').order('full_name'),
    supabase.from('lists').select('id, name, color').order('name'),
    supabase.from('persons').select('id, name, role, phone, email, call_count, last_outcome, do_not_call').eq('organization_id', params.id).order('name'),
    supabase.from('activities')
      .select('id, title, type, due_at, done, description, location, video_call, assigned_to, person:persons(id, name), assignee:profiles!activities_assigned_to_fkey(full_name)')
      .eq('organization_id', params.id).order('due_at'),
    supabase.from('call_logs')
      .select('id, outcome, note, spoke_with, called_at, person:persons(id, name, role), caller:profiles!call_logs_created_by_fkey(full_name)')
      .eq('organization_id', params.id).order('called_at', { ascending: false }),
    supabase.from('activity_types').select('id, name').order('sort').order('created_at'),
    supabase.from('call_outcomes').select('id, name').order('sort').order('created_at'),
    getHours(supabase), loadFields(supabase, 'organization'),
    supabase.from('contact_roles').select('id, name').order('sort').order('created_at'),
  ]);
  if (!org) notFound();

  const [{ data: dupO }, { data: dupP }] = await Promise.all([
    org.duplicate_of_org ? supabase.from('organizations').select('id, name').eq('id', org.duplicate_of_org).maybeSingle() : { data: null },
    org.duplicate_of_person ? supabase.from('persons').select('id, name').eq('id', org.duplicate_of_person).maybeSingle() : { data: null },
  ]);
  const isAdmin = me?.role === 'admin';
  const nameOf = (id) => people?.find((p) => p.id === id)?.full_name;
  const open = (acts || []).filter((a) => !a.done);
  const done = (acts || []).filter((a) => a.done).reverse();
  const mine = open.find((a) => a.assigned_to === user.id);
  const hint = mine ? `Logging this call will mark "${mine.title}" as done.` : '';
  const mins = org.last_called_at ? Math.round((Date.now() - new Date(org.last_called_at)) / 60000) : null;
  const recentByOther = mins !== null && mins < 4320 && org.last_called_by && org.last_called_by !== user.id;
  const zone = org.time_zone;
  const list = lists?.find((l) => l.id === org.list_id);

  async function schedule(fd) {
    'use server';
    const s = createClient();
    const u = await getUser();
    const { error } = await s.from('activities').insert({ ...activityFields(fd), organization_id: params.id, assigned_to: u.id, created_by: u.id });
    if (error) throw new Error(error.message);
    revalidatePath('/', 'layout');
  }
  async function updateActivity(fd) {
    'use server';
    const { error } = await createClient().from('activities').update(activityFields(fd)).eq('id', fd.get('id'));
    if (error) throw new Error(error.message);
    revalidatePath('/', 'layout');
  }
  async function markDone(fd) {
    'use server';
    const { error } = await createClient().from('activities')
      .update({ done: true, done_at: new Date().toISOString() }).eq('id', fd.get('id'));
    if (error) throw new Error(error.message);
    revalidatePath('/', 'layout');
  }
  async function logCall(fd) {
    'use server';
    const s = createClient();
    const u = await getUser();
    const who = parseWho((k) => fd.get(k));
    let contactId = who.contactId;
    let askFor = who.spokeWith;
    if (who.newContact) {
      const { data: made, error: pe } = await s.from('persons').insert({
        name: who.newContact.name, role: who.newContact.role, phone: who.newContact.phone,
        organization_id: params.id, owner_id: u.id, created_by: u.id,
      }).select('id').single();
      if (pe) throw new Error(pe.message);
      contactId = made.id;
      askFor = who.newContact.name;
    }
    const { error } = await s.from('call_logs').insert({
      organization_id: params.id, person_id: contactId, outcome: fd.get('outcome'),
      note: fd.get('note') || null, spoke_with: askFor, created_by: u.id,
    });
    if (error) throw new Error(error.message);
    const { data: next } = await s.from('activities').select('id').eq('organization_id', params.id)
      .eq('assigned_to', u.id).eq('done', false).order('due_at').limit(1);
    if (next?.[0]) await s.from('activities').update({ done: true, done_at: new Date().toISOString() }).eq('id', next[0].id);
    const at = fd.get('next_at');
    if (at) {
      const desc = [askFor && `Ask for ${askFor}`, fd.get('note')].filter(Boolean).join(' · ') || null;
      const { error: e2 } = await s.from('activities').insert({
        title: 'Follow-up call', type: 'Call', due_at: at, description: desc,
        organization_id: params.id, person_id: contactId, assigned_to: u.id, created_by: u.id,
      });
      if (e2) throw new Error(e2.message);
    }
    revalidatePath('/', 'layout');
    if (fd.get('queue') === '1') {
      const { data: prof } = await s.from('profiles').select('queue_auto_next, queue_hours_only').eq('id', u.id).single();
      if (prof?.queue_auto_next) {
        const list = String(fd.get('queue_list') || '');
        const nextId = await claimNext(s, { list, hoursOnly: prof.queue_hours_only, hours: await getHours(s) });
        const q = list ? `&list=${encodeURIComponent(list)}` : '';
        redirect(nextId ? `/organizations/${nextId}?call=1&q=1${q}` : `/organizations?queue=empty${q}`);
      }
    }
  }
  async function addContact(fd) {
    'use server';
    const u = await getUser();
    const { error } = await createClient().from('persons').insert({
      name: fd.get('name'), role: fd.get('role') || null, phone: fd.get('phone') || null, email: fd.get('email') || null,
      organization_id: params.id, owner_id: u.id, created_by: u.id,
    });
    if (error) throw new Error(error.message);
    revalidatePath('/', 'layout');
  }
  async function dismissDuplicate() {
    'use server';
    const s = createClient();
    const { data: dl } = await s.from('labels').select('id').ilike('name', 'Duplicate:%');
    const ids = (dl || []).map((l) => l.id);
    const { data: cur } = await s.from('organizations').select('label_ids').eq('id', params.id).single();
    const { error } = await s.from('organizations').update({
      possible_duplicate: false, duplicate_of_org: null, duplicate_of_person: null,
      label_ids: (cur?.label_ids || []).filter((x) => !ids.includes(x)),
    }).eq('id', params.id);
    if (error) throw new Error(error.message);
    revalidatePath('/', 'layout');
  }
  async function updateOrg(fd) {
    'use server';
    const s = createClient();
    const fl = await loadFields(s, 'organization');
    const { data: cur } = await s.from('organizations').select('custom, time_zone, time_zone_guessed').eq('id', params.id).single();
    const { error } = await s.from('organizations').update({
      custom: collectCustom(fd, fl, cur?.custom || {}),
      name: fd.get('name'), phone: fd.get('phone') || null, email: fd.get('email') || null,
      website: fd.get('website') || null, address: fd.get('address') || null, country: fd.get('country') || null,
      time_zone: fd.get('time_zone') || null,
      time_zone_guessed: (fd.get('time_zone') || null) === cur?.time_zone ? Boolean(cur?.time_zone_guessed) : false,
      list_id: fd.get('list_id') || null, owner_id: fd.get('owner_id') || null,
      visible_to: fd.get('visible_to'), label_ids: fd.getAll('label_ids'),
      notes: fd.get('notes') || null, do_not_call: fd.get('do_not_call') === 'on',
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
      {searchParams?.call && org.phone && !org.do_not_call && <p><a className="callbtn" href={`tel:${org.phone}`}>Call {org.phone}</a></p>}
      {searchParams?.q === '1' && me?.queue_enabled && (
        <form action={callNext} className="row-form">
          <input type="hidden" name="list" value={searchParams.list || ''} /><input type="hidden" name="skip" value={org.id} />
          <button className="ghost" type="submit">Skip, next organization</button>
        </form>
      )}
      {recentByOther && (
        <section className="panel notice">
          <strong>{nameOf(org.last_called_by) || 'Someone'}</strong> called this {rel(org.last_called_at)}{org.last_outcome ? ` (${org.last_outcome})` : ''}. You can still call.
        </section>
      )}
      <section className="panel">
        <p>
          {list && <span className="tag" style={{ background: list.color + '26', color: list.color }}>{list.name}</span>}
          {org.visible_to === 'private' && <span className="tag">Private</span>}
          <LabelTags ids={org.label_ids} labels={labels} />
        </p>
        <p>
          {org.phone && <a href={`tel:${org.phone}`}>{org.phone}</a>}
          {org.phone && org.email && ' · '}
          {org.email && <a href={`mailto:${org.email}`}>{org.email}</a>}
          {org.website && <> · <a href={/^https?:\/\//i.test(org.website) ? org.website : 'https://' + org.website} target="_blank" rel="noreferrer">{org.website}</a></>}
        </p>
        {org.address && <p className="muted">{org.address}</p>}
        {zone && (
          <p className="muted">
            Local time {localTime(zone)} ({zoneLabel(zone)}{org.time_zone_guessed ? ', guessed, please check' : ''})
            {' · '}{inHours(zone, hours) ? 'inside business hours' : 'outside business hours'}
          </p>
        )}
        <p className="muted">
          Owner: {nameOf(org.owner_id) || 'none'} · Calls: <strong>{org.call_count}</strong> (all calls to this organization and its contacts)
          {org.last_called_at && <> · Last: {org.last_outcome}, <LocalTime iso={org.last_called_at} /></>}
        </p>
        {org.notes && <p>{org.notes}</p>}
        <CustomValues fields={cfields} values={org.custom} />
        {org.do_not_call && <p className="error">Marked Do not call. Do not phone this organization.</p>}
      </section>

      {org.possible_duplicate && (
        <section className="panel dup">
          <h2>Possible duplicate</h2>
          <p>
            {dupO && <>Matches organization <Link href={`/organizations/${dupO.id}`}>{dupO.name}</Link>. </>}
            {dupP && <>Matches contact <Link href={`/persons/${dupP.id}`}>{dupP.name}</Link>. </>}
            {!dupO && !dupP && 'Matches another record from the same file or one that has since been removed. '}
            See the orange tags for the reason.
          </p>
          <form action={dismissDuplicate}><button type="submit" className="ghost">Not a duplicate</button></form>
        </section>
      )}

      <section className="panel">
        <h2>Log a call</h2>
        {org.do_not_call
          ? <p className="muted">Calling is off because this organization is marked Do not call.</p>
          : <LogCall action={logCall} outcomes={outcomes || []} hint={hint} contacts={contacts || []} roles={roles || []}
            hidden={searchParams?.q === '1' ? { queue: '1', queue_list: searchParams.list || '' } : undefined} />}
      </section>

      <section className="panel">
        <h2>Planned ({open.length})</h2>
        {open.length ? (
          <table><tbody>
            {open.map((a) => (
              <>
                <tr key={a.id}>
                  <td className="when"><LocalTime iso={a.due_at} /></td>
                  <td><span className="tag">{a.type}</span> {a.title}{a.person && <> for <Link href={`/persons/${a.person.id}`}>{a.person.name}</Link></>}{a.video_call && ' (video call)'}
                    {(a.location || a.description) && <div className="muted">{[a.location, a.description].filter(Boolean).join(' · ')}</div>}</td>
                  <td className="muted">{a.assignee?.full_name}</td>
                  <td>
                    <form action={markDone}><input type="hidden" name="id" value={a.id} /><button className="ghost" type="submit">Done</button></form>
                  </td>
                </tr>
                <tr key={a.id + 'e'} className="sub"><td colSpan={4}>
                  <details><summary>Edit or reschedule</summary>
                    <ScheduleForm action={updateActivity} types={types || []} initial={a} submitLabel="Save changes" />
                  </details>
                </td></tr>
              </>
            ))}
          </tbody></table>
        ) : <p className="empty">Nothing planned for this organization.</p>}
        <details>
          <summary>+ Add task, meeting or demo</summary>
          {org.do_not_call
            ? <p className="muted">Scheduling is off because this organization is marked Do not call.</p>
            : <ScheduleForm action={schedule} orgId={org.id} types={types || []} defaultTitle="Meeting" defaultType="Meeting" />}
        </details>
      </section>

      <section className="panel">
        <h2>Contacts ({contacts?.length || 0})</h2>
        {contacts?.length ? (
          <table><tbody>
            {contacts.map((c) => (
              <tr key={c.id}>
                <td><Link href={`/persons/${c.id}`}>{c.name}</Link>{c.role && <span className="muted"> ({c.role})</span>}{c.do_not_call && <span className="tag warn">Do not call</span>}</td>
                <td>{c.phone && <a href={`tel:${c.phone}`}>{c.phone}</a>}</td>
                <td>{c.email}</td>
                <td className="muted">{c.call_count} calls{c.last_outcome && ` · ${c.last_outcome}`}</td>
              </tr>
            ))}
          </tbody></table>
        ) : <p className="empty">No contacts yet. When you learn a name or number, add it here.</p>}
        <details>
          <summary>Add contact</summary>
          <form className="grid" action={addContact}>
            <label>Name<input name="name" required /></label>
            <label>Role
              <select name="role" defaultValue=""><option value="">Not set</option>
                {roles?.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}</select>
            </label>
            <label>Phone<input name="phone" type="tel" /></label>
            <label>Email<input name="email" type="email" /></label>
            <button type="submit">Add contact</button>
          </form>
        </details>
      </section>

      <section className="panel">
        <h2>Call history ({calls?.length || 0})</h2>
        {calls?.length ? (
          <table><tbody>
            {calls.map((c) => (
              <tr key={c.id}>
                <td className="when"><LocalTime iso={c.called_at} /></td>
                <td>
                  {c.person ? <>{c.person.role ? `${c.person.role} ` : 'Contact '}<Link href={`/persons/${c.person.id}`}>{c.person.name}</Link>: </> : c.spoke_with ? `${c.spoke_with}: ` : 'Organization: '}
                  {c.outcome}
                  {c.note && <div className="muted">{c.note}</div>}
                </td>
                <td className="muted">{c.caller?.full_name}</td>
              </tr>
            ))}
          </tbody></table>
        ) : <p className="empty">No calls logged yet.</p>}
      </section>

      {done.length > 0 && (
        <section className="panel">
          <h2>Completed follow-ups ({done.length})</h2>
          <table><tbody>
            {done.map((a) => (
              <tr key={a.id}>
                <td className="when muted"><LocalTime iso={a.due_at} /></td>
                <td className="muted">{a.title}{a.person && ` for ${a.person.name}`}</td>
                <td className="muted">{a.assignee?.full_name}</td>
              </tr>
            ))}
          </tbody></table>
        </section>
      )}

      <details className="panel">
        <summary><strong>Edit organization</strong></summary>
        <form className="grid" action={updateOrg}>
          <label>Name<input name="name" defaultValue={org.name} required /></label>
          <label>Phone<input name="phone" type="tel" defaultValue={org.phone || ''} /></label>
          <label>Email<input name="email" type="email" defaultValue={org.email || ''} /></label>
          <label>Website<input name="website" defaultValue={org.website || ''} /></label>
          <label>Address<input name="address" defaultValue={org.address || ''} /></label>
          <label>List (industry)
            <select name="list_id" defaultValue={org.list_id || ''}><option value="">No list</option>
              {lists?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          </label>
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
          <label>Notes<input name="notes" defaultValue={org.notes || ''} /></label>
          <label className="check"><input name="do_not_call" type="checkbox" defaultChecked={org.do_not_call} /> Do not call</label>
          <CustomInputs fields={cfields} values={org.custom} />
          <button type="submit">Save organization</button>
          {isAdmin && <button type="submit" className="ghost danger" formAction={deleteOrg} formNoValidate>Delete organization</button>}
        </form>
      </details>
    </>
  );
}
