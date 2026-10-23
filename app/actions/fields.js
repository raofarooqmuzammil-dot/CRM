'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '../../lib/supabase/server';

const run = async (q) => { const { error } = await q; if (error) throw new Error(error.message); revalidatePath('/', 'layout'); };
async function requireAdmin() {
  const s = createClient();
  const { data: { user } } = await s.auth.getUser();
  const { data: me } = await s.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') throw new Error('Only the admin can change or delete columns');
}
const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

export async function addField(fd) {
  const s = createClient();
  const { data } = await s.from('custom_fields').select('sort').eq('entity', fd.get('entity')).order('sort', { ascending: false }).limit(1);
  await run(s.from('custom_fields').insert({
    entity: fd.get('entity'), name: String(fd.get('name')).trim(), type: fd.get('type'),
    options: list(fd.get('options')), sort: (data?.[0]?.sort || 0) + 1,
  }));
}
export async function saveField(fd) {
  await requireAdmin();
  await run(createClient().from('custom_fields').update({
    name: String(fd.get('name')).trim(), options: list(fd.get('options')),
    hidden: fd.get('hidden') === 'on', sort: Number(fd.get('sort')),
  }).eq('id', fd.get('id')));
}
export async function deleteField(fd) {
  await requireAdmin();
  await run(createClient().from('custom_fields').delete().eq('id', fd.get('id')));
}
