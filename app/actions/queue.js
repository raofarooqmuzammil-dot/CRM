'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient, getUser } from '../../lib/supabase/server';
import { claimNext } from '../../lib/queue';
import { getHours } from '../../lib/hours';

// Each caller's own queue settings. Everything stays off until they turn it on.
export async function saveQueue(fd) {
  const u = await getUser();
  const { error } = await createClient().from('profiles').update({
    queue_enabled: fd.get('enabled') === 'on', queue_auto_next: fd.get('auto_next') === 'on', queue_hours_only: fd.get('hours_only') === 'on',
  }).eq('id', u.id);
  if (error) throw new Error(error.message);
  revalidatePath('/', 'layout');
}

// Opens the next never-called organization (in the list being viewed) ready to call.
export async function callNext(fd) {
  const s = createClient();
  const u = await getUser();
  const list = String(fd.get('list') || '');
  const { data: prof } = await s.from('profiles').select('queue_hours_only').eq('id', u.id).single();
  const id = await claimNext(s, { list, hoursOnly: prof?.queue_hours_only, hours: await getHours(s), skip: fd.get('skip') || null });
  revalidatePath('/', 'layout');
  const q = list ? `&list=${encodeURIComponent(list)}` : '';
  redirect(id ? `/organizations/${id}?call=1&q=1${q}` : `/organizations?queue=empty${q}`);
}
