'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '../../lib/supabase/server';
import { createAdminClient } from '../../lib/supabase/admin';

const must = (res) => { if (res.error) throw new Error(res.error.message); return res.data || []; };

async function requireAdmin() {
  const s = createClient();
  const { data: { user } } = await s.auth.getUser();
  const { data: me } = await s.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') throw new Error('Admins only');
  return user;
}

// The person can no longer log in. Their calls, notes, and history stay with their name.
export async function removeAccess(fd) {
  const me = await requireAdmin();
  const id = String(fd.get('id') || '');
  const heir = String(fd.get('heir') || '') || null;
  if (!id || id === me.id) throw new Error('You cannot remove your own access');
  if (fd.get('confirm') !== 'on') throw new Error('Tick the box to confirm');
  const admin = createAdminClient();
  const people = must(await admin.from('profiles').select('id, role, disabled'));
  const target = people.find((p) => p.id === id);
  if (!target) throw new Error('User not found');
  if (heir) {
    const h = people.find((p) => p.id === heir);
    if (!h || h.disabled || heir === id) throw new Error('Pick an active person to take over');
  }
  if (target.role === 'admin' && people.filter((p) => p.role === 'admin' && !p.disabled).length <= 1) throw new Error('This is the last admin');

  const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: '876000h' });
  if (error) throw new Error(error.message);
  must(await admin.from('profiles').update({ disabled: true }).eq('id', id));
  for (const table of ['organizations', 'persons', 'deals']) must(await admin.from(table).update({ owner_id: heir }).eq('owner_id', id));
  must(await admin.from('activities').update({ assigned_to: heir }).eq('assigned_to', id).eq('done', false));
  revalidatePath('/', 'layout');
}

export async function restoreAccess(fd) {
  await requireAdmin();
  const id = String(fd.get('id') || '');
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: 'none' });
  if (error) throw new Error(error.message);
  must(await admin.from('profiles').update({ disabled: false }).eq('id', id));
  revalidatePath('/', 'layout');
}
