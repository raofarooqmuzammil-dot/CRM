'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '../../lib/supabase/server';

// Puts an interested organization into the first stage of the first pipeline, unless it already has an open deal.
export async function createDealFromOrg(fd) {
  const s = createClient();
  const { data: { user } } = await s.auth.getUser();
  const id = fd.get('id');
  const { data: org } = await s.from('organizations').select('id, name, phone, email, owner_id').eq('id', id).maybeSingle();
  if (!org) throw new Error('Organization not found');
  const { data: open } = await s.from('deals').select('id').eq('organization_id', id).eq('status', 'open').limit(1);
  if (open?.[0]) redirect(`/deals/${open[0].id}`);
  const { data: pipes } = await s.from('pipelines').select('id').order('sort').order('created_at').limit(1);
  if (!pipes?.[0]) throw new Error('Create a pipeline in Settings first');
  const { data: stages } = await s.from('stages').select('id').eq('pipeline_id', pipes[0].id).order('sort').order('created_at').limit(1);
  if (!stages?.[0]) throw new Error('Add a stage to your pipeline first');
  const { data: deal, error } = await s.from('deals').insert({
    title: org.name, organization_id: org.id, pipeline_id: pipes[0].id, stage_id: stages[0].id,
    owner_id: org.owner_id || user.id, phone: org.phone, email: org.email, source_channel: 'Cold call', created_by: user.id,
  }).select('id').single();
  if (error) throw new Error(error.message);
  revalidatePath('/', 'layout');
  redirect(`/deals/${deal.id}`);
}
