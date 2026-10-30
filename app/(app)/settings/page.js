import Link from 'next/link';
import { getHours, getTeamZone } from '../../../lib/hours';
import { TEAM_ZONES } from '../../../lib/zones';
import { revalidatePath } from 'next/cache';
import { createClient } from '../../../lib/supabase/server';

const LISTS = [
  { table: 'lists', title: 'Lists (industries)', colored: true, note: 'One list per organization, like NEMT, Roofers, or HVAC. They become tabs on the Organizations page.' },
  { table: 'contact_roles', title: 'Contact roles', colored: false, note: 'Who you can say you spoke to: Front desk, Owner, Manager, CEO, and anything you add.' },
  { table: 'labels', title: 'Labels', colored: true, note: 'Tags you can put on persons, like Hot or Warm.' },
  { table: 'activity_types', title: 'Activity types', colored: false, note: 'What is planned: Call, Follow-up, Meeting, Demo, and anything you add.' },
  { table: 'lost_reasons', title: 'Lost reasons', colored: false, note: 'Why a deal was lost. Shown when you mark a deal lost.' },
  { table: 'call_outcomes', title: 'Call outcomes', colored: true, note: 'What happened on a call. These are the buttons when you log a call.' },
];
const allowed = (t) => LISTS.find((l) => l.table === t);

async function save(fd, mode) {
  const t = fd.get('table');
  const list = allowed(t);
  if (!list) return;
  const s = createClient();
  const row = { name: String(fd.get('name') || '').trim() };
  if (list.colored) row.color = fd.get('color');
  const { error } = mode === 'add'
    ? await s.from(t).insert(row)
    : await s.from(t).update(row).eq('id', fd.get('id'));
  if (error) throw new Error(error.message);
  revalidatePath('/', 'layout');
}

export default async function Settings() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: me }, hours, teamZone] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).single(), getHours(supabase), getTeamZone(supabase),
  ]);
  const data = await Promise.all(LISTS.map((l) =>
    supabase.from(l.table).select('*').order(l.table === 'labels' ? 'name' : 'sort').order('created_at')));

  async function saveHours(fd) {
    'use server';
    const start = Number(fd.get('start')), end = Number(fd.get('end'));
    if (!(start >= 0 && end <= 24 && start < end)) throw new Error('Start must be before end');
    const { error } = await createClient().from('app_settings').upsert({ key: 'business_hours', value: { start, end } });
    if (error) throw new Error(error.message);
    revalidatePath('/', 'layout');
  }
  async function saveZone(fd) {
    'use server';
    const { error } = await createClient().from('app_settings').upsert({ key: 'team_timezone', value: { zone: String(fd.get('zone')) } });
    if (error) throw new Error(error.message);
    revalidatePath('/', 'layout');
  }
  async function addItem(fd) { 'use server'; await save(fd, 'add'); }
  async function saveItem(fd) { 'use server'; await save(fd, 'edit'); }
  async function deleteItem(fd) {
    'use server';
    if (!allowed(fd.get('table'))) return;
    const { error } = await createClient().from(fd.get('table')).delete().eq('id', fd.get('id'));
    if (error) throw new Error(error.message);
    revalidatePath('/', 'layout');
  }

  return (
    <>
      <h1>Settings</h1>
      <section className="panel">
        <h2>Business hours</h2>
        <p className="muted">Used by the Calling now filter, in each person's own time zone, on weekdays.</p>
        {me?.role === 'admin' ? (
          <form className="row-form" action={saveHours}>
            <input name="start" type="number" min="0" max="23" defaultValue={hours.start} className="num" aria-label="Start hour" />
            <span>to</span>
            <input name="end" type="number" min="1" max="24" defaultValue={hours.end} className="num" aria-label="End hour" />
            <button type="submit">Save</button>
          </form>
        ) : <p>{hours.start}:00 to {hours.end}:00 (set by the admin)</p>}
      </section>
      <section className="panel">
        <h2>Team time zone</h2>
        <p className="muted">Decides when "today" and "this week" start on the dashboard.</p>
        {me?.role === 'admin' ? (
          <form className="row-form" action={saveZone}>
            <select name="zone" defaultValue={teamZone}>{TEAM_ZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <button type="submit">Save</button>
          </form>
        ) : <p>{teamZone} (set by the admin)</p>}
      </section>
      <section className="panel">
        <h2>Custom fields</h2>
        <p className="muted">Add, rename, hide, or remove extra columns like Website or LinkedIn.</p>
        <Link href="/settings/fields">Manage custom fields</Link>
      </section>
      <section className="panel">
        <h2>Pipelines and stages</h2>
        <p className="muted">Add, rename, reorder, or remove deal stages and pipelines.</p>
        <Link href="/settings/pipelines">Manage pipelines and stages</Link>
      </section>
      {LISTS.map((l, i) => (
        <section className="panel" key={l.table}>
          <h2>{l.title}</h2>
          <p className="muted">{l.note} Changes apply to the whole team.</p>
          {data[i].data?.map((item) => (
            <form className="row-form" action={saveItem} key={item.id}>
              <input type="hidden" name="table" value={l.table} />
              <input type="hidden" name="id" value={item.id} />
              {l.colored && <input type="color" name="color" defaultValue={item.color} aria-label="Color" />}
              <input name="name" defaultValue={item.name} required />
              <button type="submit">Save</button>
              <button type="submit" className="ghost danger" formAction={deleteItem} formNoValidate>Delete</button>
            </form>
          ))}
          <form className="row-form" action={addItem}>
            <input type="hidden" name="table" value={l.table} />
            {l.colored && <input type="color" name="color" defaultValue="#1c6b60" aria-label="Color" />}
            <input name="name" placeholder={`New ${l.title.toLowerCase().replace(/s$/, '')}`} required />
            <button type="submit">Add</button>
          </form>
        </section>
      ))}
    </>
  );
}
