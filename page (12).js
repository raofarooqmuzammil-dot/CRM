import { createClient } from '../../../lib/supabase/server';
import { loadFields } from '../../../lib/custom';
import ImportWizard from '../../../components/ImportWizard';
import LocalTime from '../../../components/LocalTime';
import { startBatch, importChunk, finishBatch, undoBatch, assignImportList } from '../../actions/import';

export default async function ImportPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [persons, orgs, { data: batches }, { data: me }, { data: lists }] = await Promise.all([
    loadFields(supabase, 'person'), loadFields(supabase, 'organization'),
    supabase.from('import_batches').select('id, file_name, created_at, stats, creator:profiles!import_batches_created_by_fkey(full_name)').order('created_at', { ascending: false }).limit(10),
    supabase.from('profiles').select('role').eq('id', user.id).single(),
    supabase.from('lists').select('id, name').order('name'),
  ]);
  return (
    <>
      <h1>Import</h1>
      <ImportWizard fields={[...persons, ...orgs]} lists={lists || []} startBatch={startBatch} importChunk={importChunk} finishBatch={finishBatch} />
      <section className="panel">
        <h2>Recent imports</h2>
        {batches?.length ? (
          <table><tbody>
            {batches.map((b) => (
              <tr key={b.id}>
                <td>{b.file_name}</td>
                <td className="muted"><LocalTime iso={b.created_at} /> · {b.creator?.full_name}</td>
                <td className="muted">{b.stats ? `${b.stats.created} organizations, ${b.stats.contacts ?? 0} contacts, ${b.stats.flagged} flagged` : 'unfinished'}</td>
                <td>
                  <form className="row-form" action={assignImportList}>
                    <input type="hidden" name="id" value={b.id} />
                    <select name="list_id" aria-label="List"><option value="">No list</option>
                      {lists?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
                    <button className="ghost" type="submit">Put whole import in list</button>
                  </form>
                </td>
                <td>{me?.role === 'admin' && (
                  <form action={undoBatch}><input type="hidden" name="id" value={b.id} />
                    <button className="ghost danger" type="submit">Undo (remove this import)</button></form>)}</td>
              </tr>
            ))}
          </tbody></table>
        ) : <p className="empty">No imports yet.</p>}
      </section>
    </>
  );
}
