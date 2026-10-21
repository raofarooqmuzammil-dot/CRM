import Link from 'next/link';
import { notFound } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '../../../../lib/supabase/server';
import ScheduleForm from '../../../../components/ScheduleForm';
import LocalTime from '../../../../components/LocalTime';
import LabelTags from '../../../../components/LabelTags';

export default async function PersonPage({ params }) {
  const supabase = createClient();
  const { data: person } = await supabase
    .from('persons')
    .select('id, name, phone, email, label_ids, visible_to, do_not_call, notes, organizations(name), owner:profiles!persons_owner_id_fkey(full_name)')
    .eq('id', params.id).maybeSingle();
  if (!person) notFound();

  const [{ data: labels }, { data: acts }] = await Promise.all([
    supabase.from('labels').select('id, name, color'),
    supabase.from('activities')
      .select('id, title, type, due_at, done, description, location, video_call, assignee:profiles!activities_assigned_to_fkey(full_name)')
      .eq('person_id', person.id).order('due_at'),
  ]);
  const open = (acts || []).filter((a) => !a.done);
  const done = (acts || []).filter((a) => a.done).reverse();

  async function schedule(formData) {
    'use server';
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('activities').insert({
      title: formData.get('title'),
      type: formData.get('type'),
      due_at: formData.get('due_at'),
      location: formData.get('location') || null,
      description: formData.get('description') || null,
      video_call: formData.get('video_call') === 'on',
      person_id: params.id,
      assigned_to: user.id,
      created_by: user.id,
    });
    if (error) throw new Error(error.message);
    revalidatePath('/', 'layout');
  }

  async function markDone(formData) {
    'use server';
    const { error } = await createClient().from('activities')
      .update({ done: true, done_at: new Date().toISOString() }).eq('id', formData.get('id'));
    if (error) throw new Error(error.message);
    revalidatePath('/', 'layout');
  }

  return (
    <>
      <p><Link href="/persons">Back to persons</Link></p>
      <h1>{person.name}</h1>
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
        <p className="muted">Owner: {person.owner?.full_name || 'none'}</p>
        {person.do_not_call && <p className="error">Marked Do not call. Do not phone this person.</p>}
      </section>

      <section className="panel">
        <h2>Schedule a follow-up</h2>
        {person.do_not_call
          ? <p className="muted">Scheduling is off because this person is marked Do not call.</p>
          : <ScheduleForm action={schedule} personId={person.id} />}
      </section>

      <section className="panel">
        <h2>Planned ({open.length})</h2>
        {open.length ? (
          <table><tbody>
            {open.map((a) => (
              <tr key={a.id}>
                <td className="when"><LocalTime iso={a.due_at} /></td>
                <td>{a.title}{a.video_call && ' (video call)'}
                  {(a.location || a.description) && <div className="muted">{[a.location, a.description].filter(Boolean).join(' · ')}</div>}</td>
                <td className="muted">{a.assignee?.full_name}</td>
                <td>
                  <form action={markDone}>
                    <input type="hidden" name="id" value={a.id} />
                    <button className="ghost" type="submit">Done</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody></table>
        ) : <p className="empty">Nothing planned for this person.</p>}
      </section>

      {done.length > 0 && (
        <section className="panel">
          <h2>Done ({done.length})</h2>
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
    </>
  );
}
