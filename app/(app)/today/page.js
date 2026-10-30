import { revalidatePath } from 'next/cache';
import { createClient, getClient, getUser } from '../../../lib/supabase/server';
import Agenda from '../../../components/Agenda';

export default async function Today() {
  const supabase = getClient();
  const user = await getUser();
  const { data: items } = await supabase
    .from('activities')
    .select('id, title, type, due_at, description, person:persons(id, name, phone, organizations(name)), org:organizations(id, name, phone), deal:deals(id, title)')
    .eq('assigned_to', user.id)
    .eq('done', false)
    .order('due_at');

  async function markDone(formData) {
    'use server';
    const supabase = createClient();
    const { error } = await supabase.from('activities')
      .update({ done: true, done_at: new Date().toISOString() }).eq('id', formData.get('id'));
    if (error) throw new Error(error.message);
    revalidatePath('/', 'layout');
  }

  return (
    <>
      <h1>My follow-ups</h1>
      <Agenda items={items || []} markDone={markDone} />
    </>
  );
}
