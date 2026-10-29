'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '../../lib/supabase/server';
import { findOrCreateList } from '../../lib/lists';

// Creates a list (or reuses one with the same name) and opens its tab.
export async function createList(fd) {
  const name = String(fd.get('name') || '').trim();
  if (!name) throw new Error('Enter a list name');
  const id = await findOrCreateList(createClient(), name, String(fd.get('color') || '#66726f'));
  revalidatePath('/', 'layout');
  redirect(`/organizations?list=${id}`);
}
