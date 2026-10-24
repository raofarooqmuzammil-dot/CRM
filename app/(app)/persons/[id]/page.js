import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '../../../../lib/supabase/server';
import ScheduleForm from '../../../../components/ScheduleForm';
import LogCall from '../../../../components/LogCall';
import LocalTime from '../../../../components/LocalTime';
import LabelTags from '../../../../components/LabelTags';
import { ZONES, localTime, inHours, zoneLabel } from '../../../../lib/zones';
import { getHours } from '../../../../lib/hours';
import { CustomInputs, CustomValues } from '../../../../components/CustomFields';
import { loadFields, collectCustom } from '../../../../lib/custom';

// Kept outside the component: server actions must not capture functions from the page.
const fields = (fd) => ({
  title: fd.get('title'),
  type: fd.get('type'),
  due_at: fd.get('due_at'),
  location: fd.get('location') || null,
  description: fd.get('description') || null,
  video_call: fd.get('video_call') === 'on',
});

export default async function PersonPage({ params, searchParams }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: person } = await supabase
    .from('persons')
    .select('id, name, phone, email, label_ids, visible_to, do_not_call, notes, organization_id, owner_id, custom, possible_duplicate, duplicate_of, duplicate_of_org, call_count, last_called_at, last_outcome, last_called_by, time_zone, time_zone_guessed, eff_time_zone, organizations(name, time_zone_guessed), lastcaller:profiles!persons_last_called_by_fkey(full_name), owner:profiles!persons_owner_id_fkey(full_name)')
    .eq('id', params.id).maybeSingle();
  if (!person) notFound();
  const cfields = await loadFields(supabase, 'person');
  const hours = await getHours(supabase);
  const zone = person.eff_time_zone;
  const guessed = person.time_zone ? person.time_zone_guessed : person.organizations?.time_zone_guessed;
  const mins = person.last_called_at ? Math.round((Date.now() - new Date(person.last_called_at)) / 60000) : null;
  const recentByOther = mins !== null && mins < 4320 && person.last_called_by && person.last_called_by !== user.id;
  const agoText = mins < 1 ? 'just now' : mins < 60 ? `${mins} minutes ago` : mins < 1440 ? `${Math.round(mins / 60)} hours ago` : `${Math.round(mins / 1440)} days ago`;
  const [{ data: dupP }, { data: dupO }] = await Promise.all([
    person.duplicate_of ? supabase.from('persons').select('id, name, phone').eq('id', person.duplicate_of).maybeSingle() : { data: null },
    person.duplicate_of_org ? supabase.from('organizations').select('id, name').eq('id', person.duplicate_of_org).maybeSingle() : { data: null },
  ]);

  const [{ data: me }, { data: labels }, { data: acts }, { data: calls }, { data: types }, { data: outcomes }, { data: orgs }, { data: people }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).single(),
    supabase.from('labels').select('id, name, color').order('name'),
    supabase.from('activities')
      .select('id, title, type, due_at, done, description, location, video_call, assigned_to, assignee:profiles!activities_assigned_to_fkey(full_name)')
      .eq('person_id', person.id).order('due_at'),
    supabase.from('call_logs')
      .select('id, outcome, note, called_at, caller:profiles!call_logs_created_by_fkey(full_name)')
      .eq('person_id', person.id).order('called_at', { ascending: false }),
    supabase.from('activity_types').select('id, name').order('sort').order('created_at'),
    supabase.from('call_outcomes').select('id, name').order('sort').order('created_at'),
    supabase.from('organizations').select('id, name').order('name'),
    supabase.from('profiles').select('id, full_name').order('full_name'),
  ]);
  const isAdmin = me?.role === 'admin';
  const open = (acts || []).filter((a) => !a.done);
  const done = (acts || []).filter((a) => a.done).reverse();
  const mine = open.find((a) => a.assigned_to === user.id);
  const hint = mine ? `Logging this call will mark "${mine.title}" as done.` : '';

  async function schedule(fd) {
    'use server';
    const s = createClient();
    const { data: { user } } = await s.auth.getUser();
    const { error } = await s.from('activities').insert({ ...fields(fd), person_id: params.id, assigned_to: user.id, created_by: user.id });
    if (error) throw new Error(error.message);
    revalidatePath('/', 'layout');
  }
  async function updateActivity(fd) {
    'use server';
    const { error } = await createClient().from('activities').update(fields(fd)).eq('id', fd.get('id'));
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
    const { data: { user } } = await s.auth.getUser();
    const { error } = await s.from('call_logs')
      .insert({ person_id: params.id, outcome: fd.get('outcome'), note: fd.get('note') || null, created_by: user.id });
    if (error) throw new Error(error.message);
    const { data: next } = await s.from('activities').select('id').eq('person_id', params.id)
      .eq('assigned_to', user.id).eq('done', false).order('due_at').limit(1);
    if (next?.[0]) await s.from('activities').update({ done: true, done_at: new Date().toISOString() }).eq('id', next[0].id);
    const at = fd.get('next_at');
    if (at) await s.from('activities').insert({ title: 'Follow-up call', type: 'Call', due_at: at, person_id: params.id, assigned_to: user.id, created_by: user.id });
    revalidatePath('/', 'layout');
  }
  async function dismissDuplicate() {
    'use server';
    const s = createClient();
    const { data: dl } = await s.from('labels').select('id').ilike('name', 'Duplicate:%');
    const ids = (dl || []).map((l) => l.id);
    const { data: cur } = await s.from('persons').select('label_ids').eq('id', params.id).single();
    const { error } = await s.from('persons').update({
      possible_duplicate: false, duplicate_of: null, duplicate_of_org: null,
      label_ids: (cur?.label_ids || []).filter((x) => !ids.includes(x)),
    }).eq('id', params.id);
    if (error) throw new Error(error.message);
    revalidatePath('/', 'layout');
  }
  async function updatePerson(fd) {
    'use server';
    const s = createClient();
    const fl = await loadFields(s, 'person');
    const { data: cur } = await s.from('persons').select('custom, time_zone, time_zone_guessed').eq('id', params.id).single();
    const { error } = await s.from('persons').update({
      custom: collectCustom(fd, fl, cur?.custom || {}),
      time_zone: fd.get('time_zone') || null,
      time_zone_guessed: (fd.get('time_zone') || null) === cur?.time_zone ? Boolean(cur?.time_zone_guessed) : false,
      name: fd.get('name'), organization_id: fd.get('organization_id') || null,
      phone: fd.get('phone') || null, email: fd.get('email') || null,
      label_ids: fd.getAll('label_ids'), visible_to: fd.get('visible_to'),
      owner_id: fd.get('owner_id') || null, do_not_call: fd.get('do_not_call') === 'on',
      notes: fd.get('notes') || null,
    }).eq('id', params.id);
    if (error) throw new Error(error.message);
    revalidatePath('/', 'layout');
  }
  async function deletePerson() {
    'use server';
    const { error } = await createClient().from('persons').delete().eq('id', params.id);
    if (error) throw new Error(error.message);
    revalidatePath('/', 'layout');
    redirect('/persons');
  }

  return (
    <>
      <p><Link href="/persons">Back to persons</Link></p>
      <h1>{person.name}</h1>
      {searchParams?.call && person.phone && !person.do_not_call && <p><a className="callbtn" href={`tel:${person.phone}`}>Call {person.phone}</a></p>}
      {recentByOther && (
        <section className="panel notice">
          <strong>{person.lastcaller?.full_name || 'Someone'}</strong> called this {agoText}{person.last_outcome ? ` (${person.last_outcome})` : ''}. You can still call.
        </section>
      )}
      <p><Link href={`/deals?person=${person.id}`}>Create a deal for this person</Link></p>
      <section className="panel">
        <p>
          {person.organizations?.name && <strong>{person.organizations.name} </strong>}
          {person.visible_to === 'private' && <span className="tag">Private</span>}
          <LabelTags ids={person.label_ids} labels={labels} />
        </p>
        <p>
          {person.phone && <a href={`tel:${person.phone}`}>{person.phone}</a>}
          {person.phone && person.email && ' · '}
          {person.email && <a href={`mailto:${person.email}`}>{person.email}</a>}
        </p>
        {zone && (
          <p className="muted">
            Local time {localTime(zone)} ({zoneLabel(zone)}{guessed ? ', guessed, please check' : ''})
            {' · '}{inHours(zone, hours) ? 'inside business hours' : 'outside business hours'}
          </p>
        )}
        <p className="muted">
          Owner: {person.owner?.full_name || 'none'} · Calls: <strong>{person.call_count}</strong>
          {person.last_called_at && <> · Last: {person.last_outcome}, <LocalTime iso={person.last_called_at} /></>}
        </p>
        {person.notes && <p>{person.notes}</p>}
        <CustomValues fields={cfields} values={person.custom} />
        {person.do_not_call && <p className="error">Marked Do not call. Do not phone this person.</p>}
      </section>

      {person.possible_duplicate && (
        <section className="panel dup">
          <h2>Possible duplicate</h2>
          <p>
            {dupP && <>Matches person <Link href={`/persons/${dupP.id}`}>{dupP.name}</Link>{dupP.phone && ` (${dupP.phone})`}. </>}
            {dupO && <>Same organization name as <Link href={`/organizations/${dupO.id}`}>{dupO.name}</Link>. </>}
            {!dupP && !dupO && 'Matches another record from the same file or one that has since been removed.'}
            {' '}See the orange tags for the reason.
          </p>
          <form action={dismissDuplicate}><button type="submit" className="ghost">Not a duplicate</button></form>
        </section>
      )}
      <section className="panel">
        <h2>Log a call</h2>
        <LogCall action={logCall} personId={person.id} outcomes={outcomes || []} hint={hint} />
      </section>

      <section className="panel">
        <h2>Schedule a follow-up</h2>
        {person.do_not_call
          ? <p className="muted">Scheduling is off because this person is marked Do not call.</p>
          : <ScheduleForm action={schedule} personId={person.id} types={types || []} />}
      </section>

      <section className="panel">
        <h2>Planned ({open.length})</h2>
        {open.length ? (
          <table><tbody>
            {open.map((a) => (
              <>
                <tr key={a.id}>
                  <td className="when"><LocalTime iso={a.due_at} /></td>
                  <td><span className="tag">{a.type}</span> {a.title}{a.video_call && ' (video call)'}
                    {(a.location || a.description) && <div className="muted">{[a.location, a.description].filter(Boolean).join(' · ')}</div>}</td>
                  <td className="muted">{a.assignee?.full_name}</td>
                  <td>
                    <form action={markDone}>
                      <input type="hidden" name="id" value={a.id} />
                      <button className="ghost" type="submit">Done</button>
                    </form>
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
        ) : <p className="empty">Nothing planned for this person.</p>}
      </section>

      <section className="panel">
        <h2>Call history ({calls?.length || 0})</h2>
        {calls?.length ? (
          <table><tbody>
            {calls.map((c) => (
              <tr key={c.id}>
                <td className="when"><LocalTime iso={c.called_at} /></td>
                <td>{c.outcome}{c.note && <div className="muted">{c.note}</div>}</td>
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
                <td className="muted">{a.title}</td>
                <td className="muted">{a.assignee?.full_name}</td>
              </tr>
            ))}
          </tbody></table>
        </section>
      )}

      <details className="panel">
        <summary><strong>Edit person</strong></summary>
        <form className="grid" action={updatePerson}>
          <label>Name<input name="name" defaultValue={person.name} required /></label>
          <label>Organization
            <select name="organization_id" defaultValue={person.organization_id || ''}><option value="">None</option>
              {orgs?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
          </label>
          <label>Phone<input name="phone" type="tel" defaultValue={person.phone || ''} /></label>
          <label>Email<input name="email" type="email" defaultValue={person.email || ''} /></label>
          <label>Labels
            <details className="pick"><summary>Choose labels</summary>
              <div className="menu">
                {labels?.map((l) => (
                  <label className="check" key={l.id}>
                    <input type="checkbox" name="label_ids" value={l.id} defaultChecked={person.label_ids?.includes(l.id)} /> {l.name}
                  </label>))}
              </div>
            </details>
          </label>
          <label>Owner
            <select name="owner_id" defaultValue={person.owner_id || ''}><option value="">None</option>
              {people?.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>
          </label>
          <label>Visible to
            <select name="visible_to" defaultValue={person.visible_to}><option value="everyone">Everyone</option>
              <option value="private">Private (owner and admin)</option></select>
          </label>
          <label>Time zone
            <select name="time_zone" defaultValue={person.time_zone || ''}><option value="">Same as organization</option>
              {ZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </label>
          <label>Notes<input name="notes" defaultValue={person.notes || ''} /></label>
          <label className="check"><input name="do_not_call" type="checkbox" defaultChecked={person.do_not_call} /> Do not call</label>
          <CustomInputs fields={cfields} values={person.custom} />
          <button type="submit">Save person</button>
          {isAdmin && <button type="submit" className="ghost danger" formAction={deletePerson} formNoValidate>Delete person</button>}
        </form>
      </details>
    </>
  );
}
