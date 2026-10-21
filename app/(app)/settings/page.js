import { revalidatePath } from 'next/cache';
import { createClient } from '../../../lib/supabase/server';

export default async function Settings() {
  const supabase = createClient();
  const { data: labels } = await supabase.from('labels').select('id, name, color').order('name');

  async function addLabel(formData) {
    'use server';
    const { error } = await createClient().from('labels')
      .insert({ name: String(formData.get('name')).trim(), color: formData.get('color') });
    if (error) throw new Error(error.message);
    revalidatePath('/', 'layout');
  }
  async function saveLabel(formData) {
    'use server';
    const { error } = await createClient().from('labels')
      .update({ name: String(formData.get('name')).trim(), color: formData.get('color') })
      .eq('id', formData.get('id'));
    if (error) throw new Error(error.message);
    revalidatePath('/', 'layout');
  }
  async function deleteLabel(formData) {
    'use server';
    const { error } = await createClient().from('labels').delete().eq('id', formData.get('id'));
    if (error) throw new Error(error.message);
    revalidatePath('/', 'layout');
  }

  return (
    <>
      <h1>Settings</h1>
      <section className="panel">
        <h2>Labels</h2>
        <p className="muted">These appear as a dropdown when you add a person. Changes apply to the whole team.</p>
        {labels?.map((l) => (
          <form className="row-form" action={saveLabel} key={l.id}>
            <input type="hidden" name="id" value={l.id} />
            <input type="color" name="color" defaultValue={l.color} aria-label="Color" />
            <input name="name" defaultValue={l.name} required />
            <button type="submit">Save</button>
            <button type="submit" className="ghost danger" formAction={deleteLabel}>Delete</button>
          </form>
        ))}
        <form className="row-form add" action={addLabel}>
          <input type="color" name="color" defaultValue="#1c6b60" aria-label="Color" />
          <input name="name" placeholder="New label" required />
          <button type="submit">Add label</button>
        </form>
      </section>
    </>
  );
}
