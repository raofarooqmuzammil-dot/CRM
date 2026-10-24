import { createClient } from '../../../lib/supabase/server';
import { loadFields } from '../../../lib/custom';
import ImportWizard from '../../../components/ImportWizard';
import LocalTime from '../../../components/LocalTime';
import { startBatch, importChunk, finishBatch, undoBatch } from '../../actions/import';

export default async function ImportPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [persons, orgs, { data: batches }, { data: me }] = await Promise.all([
    loadFields(supabase, 'person'), loadFields(supabase, 'organization'),
    supabase.from('import_batches').select('id, file_name, created_at, stats, creator:profiles!import_batches_created_by_fkey(full_name)').order('created_at', { ascending: false }).limit(10),
    supabase.from('profiles').select('role').eq('id', user.id).single(),
  ]);
  return (
    <>
      <h1>Import</h1>
      <ImportWizard fields={[...persons, ...orgs]} startBatch={startBatch} importChunk={importChunk} finishBatch={finishBatch} />
      <section className="panel">
        <h2>Recent imports</h2>
        {batches?.length ? (
          <table><tbody>
            {batches.map((b) => (
              <tr key={b.id}>
                <td>{b.file_name}</td>
                <td className="muted"><LocalTime iso={b.created_at} /> · {b.creator?.full_name}</td>
                <td className="muted">{b.stats ? `${b.stats.created} imported, ${b.stats.flagged} flagged` : 'unfinished'}</td>
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
