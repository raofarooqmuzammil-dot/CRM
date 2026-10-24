import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { createClient } from '../../../../lib/supabase/server';

const done = () => revalidatePath('/', 'layout');
const run = async (q) => { const { error } = await q; if (error) throw new Error(error.message); done(); };

export default async function Pipelines() {
  const supabase = createClient();
  const [{ data: pipelines }, { data: stages }] = await Promise.all([
    supabase.from('pipelines').select('id, name, sort').order('sort').order('created_at'),
    supabase.from('stages').select('id, pipeline_id, name, sort').order('sort').order('created_at'),
  ]);

  async function addPipeline(fd) {
    'use server';
    await run(createClient().from('pipelines').insert({ name: String(fd.get('name')).trim() }));
  }
  async function savePipeline(fd) {
    'use server';
    await run(createClient().from('pipelines').update({ name: String(fd.get('name')).trim() }).eq('id', fd.get('id')));
  }
  async function deletePipeline(fd) {
    'use server';
    await run(createClient().from('pipelines').delete().eq('id', fd.get('id')));
  }
  async function addStage(fd) {
    'use server';
    const s = createClient();
    const { data } = await s.from('stages').select('sort').eq('pipeline_id', fd.get('pipeline_id')).order('sort', { ascending: false }).limit(1);
    await run(s.from('stages').insert({ pipeline_id: fd.get('pipeline_id'), name: String(fd.get('name')).trim(), sort: (data?.[0]?.sort || 0) + 1 }));
  }
  async function saveStage(fd) {
    'use server';
    await run(createClient().from('stages').update({ name: String(fd.get('name')).trim(), sort: Number(fd.get('sort')) }).eq('id', fd.get('id')));
  }
  async function deleteStage(fd) {
    'use server';
    await run(createClient().from('stages').delete().eq('id', fd.get('id')));
  }

  return (
    <>
      <p><Link href="/settings">Back to settings</Link></p>
      <h1>Pipelines and stages</h1>
      <p className="muted">A stage or pipeline that still has deals in it cannot be deleted. Move or delete those deals first. Stages appear left to right by their Order number.</p>
      {pipelines?.map((p) => (
        <section className="panel" key={p.id}>
          <form className="row-form" action={savePipeline}>
            <input type="hidden" name="id" value={p.id} />
            <input name="name" defaultValue={p.name} aria-label="Pipeline name" required />
            <button type="submit">Rename</button>
            <button type="submit" className="ghost danger" formAction={deletePipeline} formNoValidate>Delete pipeline</button>
          </form>
          {stages?.filter((s) => s.pipeline_id === p.id).map((s) => (
            <form className="row-form" action={saveStage} key={s.id}>
              <input type="hidden" name="id" value={s.id} />
              <input name="sort" type="number" defaultValue={s.sort} aria-label="Order" className="num" />
              <input name="name" defaultValue={s.name} aria-label="Stage name" required />
              <button type="submit">Save</button>
              <button type="submit" className="ghost danger" formAction={deleteStage} formNoValidate>Delete</button>
            </form>
          ))}
          <form className="row-form" action={addStage}>
            <input type="hidden" name="pipeline_id" value={p.id} />
            <input name="name" placeholder="New stage" required />
            <button type="submit">Add stage</button>
          </form>
        </section>
      ))}
      <section className="panel">
        <form className="row-form" action={addPipeline}>
          <input name="name" placeholder="New pipeline" required />
          <button type="submit">Add pipeline</button>
        </form>
      </section>
    </>
  );
}
