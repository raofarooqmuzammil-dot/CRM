import Link from 'next/link';
import { createClient } from '../../../../lib/supabase/server';
import { saveField, deleteField } from '../../../actions/fields';
import AddColumn from '../../../../components/AddColumn';

const ENTITIES = [['person', 'Person fields'], ['organization', 'Organization fields']];

export default async function Fields() {
  const { data } = await createClient().from('custom_fields').select('*').order('sort').order('created_at');
  return (
    <>
      <p><Link href="/settings">Back to settings</Link></p>
      <h1>Custom fields</h1>
      <p className="muted">Add a column any time. Hiding a field keeps its data, so you can bring it back. Deleting a field removes it for good. Type cannot be changed after creating.</p>
      {ENTITIES.map(([entity, title]) => (
        <section className="panel" key={entity}>
          <h2>{title}</h2>
          {data?.filter((f) => f.entity === entity).map((f) => (
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
          ))}
          {!data?.some((f) => f.entity === entity) && <p className="muted">No custom fields yet.</p>}
        </section>
      ))}
      <AddColumn entity="organization" />
      <p className="muted">The form above adds an Organization field. To add a Person field, use + Add column on the Persons page.</p>
    </>
  );
}
