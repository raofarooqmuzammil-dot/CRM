import Link from 'next/link';
import { createClient } from '../../../../lib/supabase/server';
import { saveField, deleteField } from '../../../actions/fields';
import AddColumn from '../../../../components/AddColumn';

const ENTITIES = [['person', 'Person fields'], ['organization', 'Organization fields'], ['deal', 'Deal fields']];

export default async function Fields() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data }, { data: me }] = await Promise.all([
    supabase.from('custom_fields').select('*').order('sort').order('created_at'),
    supabase.from('profiles').select('role').eq('id', user.id).single(),
  ]);
  const isAdmin = me?.role === 'admin';
  return (
    <>
      <p><Link href="/settings">Back to settings</Link></p>
      <h1>Custom fields</h1>
      <p className="muted">
        {isAdmin
          ? 'Anyone on the team can add a column. Only you can rename, hide, or delete one. Hiding keeps the data; deleting removes the column for good.'
          : 'Anyone can add a column. Only the admin can rename, hide, or delete columns.'}
      </p>
      {ENTITIES.map(([entity, title]) => (
        <section className="panel" key={entity}>
          <h2>{title}</h2>
          {data?.filter((f) => f.entity === entity).map((f) => isAdmin ? (
            <form className="row-form" action={saveField} key={f.id}>
              <input type="hidden" name="id" value={f.id} />
              <input name="sort" type="number" defaultValue={f.sort} aria-label="Order" className="num" />
              <input name="name" defaultValue={f.name} aria-label="Name" required />
              <span className="tag">{f.type}</span>
              {f.type === 'dropdown' && <input name="options" defaultValue={f.options.join(', ')} aria-label="Choices" />}
              <label className="check"><input type="checkbox" name="hidden" defaultChecked={f.hidden} /> Hidden</label>
              <button type="submit">Save</button>
              <button type="submit" className="ghost danger" formAction={deleteField} formNoValidate>Delete</button>
            </form>
          ) : (
            <p key={f.id}>{f.name} <span className="tag">{f.type}</span>{f.hidden && <span className="muted"> (hidden)</span>}</p>
          ))}
          {!data?.some((f) => f.entity === entity) && <p className="muted">No custom fields yet.</p>}
        </section>
      ))}
      <AddColumn entity="organization" />
      <p className="muted">The form above adds an Organization column. To add a Person column, use + Add column on the Persons page.</p>
    </>
  );
}
