import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient, getUser } from '../../../../lib/supabase/server';
import { resolveDealLinks } from '../../../../lib/deals';
import MoveStage from '../../../../components/MoveStage';
import LabelTags from '../../../../components/LabelTags';
import { CURRENCIES, money } from '../../../../lib/money';

export default async function DealPage({ params }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: deal } = await supabase.from('deals').select('*, person:persons(id, name), organization:organizations(id, name), owner:profiles!deals_owner_id_fkey(full_name)')
    .eq('id', params.id).maybeSingle();
  if (!deal) notFound();
  const [{ data: me }, { data: stages }, { data: pipe }, { data: reasons }, { data: labels }, { data: people }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).single(),
    supabase.from('stages').select('id, name').eq('pipeline_id', deal.pipeline_id).order('sort').order('created_at'),
    supabase.from('pipelines').select('name').eq('id', deal.pipeline_id).single(),
    supabase.from('lost_reasons').select('id, name').order('sort').order('created_at'),
    supabase.from('labels').select('id, name, color').order('name'),
    supabase.from('profiles').select('id, full_name').order('full_name'),
  ]);

  async function moveDeal(fd) {
    'use server';
    const { error } = await createClient().from('deals').update({ stage_id: fd.get('stage_id') }).eq('id', params.id);
    if (error) throw new Error(error.message);
    revalidatePath('/', 'layout');
  }
  async function setStatus(fd) {
    'use server';
    const status = fd.get('status');
    const { error } = await createClient().from('deals').update({
      status, lost_reason: status === 'lost' ? fd.get('lost_reason') || null : null,
      closed_at: status === 'open' ? null : new Date().toISOString(),
    }).eq('id', params.id);
    if (error) throw new Error(error.message);
    revalidatePath('/', 'layout');
  }
  async function updateDeal(fd) {
    'use server';
    const s = createClient();
    const u = await getUser();
    const links = await resolveDealLinks(s, fd.get('organization_name'), fd.get('contact_name'), u.id);
    const { error } = await s.from('deals').update({
      title: fd.get('title'), person_id: links.person_id,
      organization_id: links.organization_id, value: Number(fd.get('value') || 0),
      currency: fd.get('currency'), label_ids: fd.getAll('label_ids'),
      expected_close_date: fd.get('expected_close_date') || null, owner_id: fd.get('owner_id') || null,
      source_channel: fd.get('source_channel') || null, source_channel_id: fd.get('source_channel_id') || null,
      visible_to: fd.get('visible_to'), phone: fd.get('phone') || null, email: fd.get('email') || null,
    }).eq('id', params.id);
    if (error) throw new Error(error.message);
    revalidatePath('/', 'layout');
  }
  async function deleteDeal() {
    'use server';
    const { error } = await createClient().from('deals').delete().eq('id', params.id);
    if (error) throw new Error(error.message);
    revalidatePath('/', 'layout');
    redirect('/deals');
  }

  return (
    <>
      <p><Link href={`/deals?pipeline=${deal.pipeline_id}`}>Back to deals</Link></p>
      <h1>{deal.title} <span className={'tag' + (deal.status === 'lost' ? ' warn' : '')}>{deal.status}</span></h1>
      <section className="panel">
        <p><strong>{money(deal.value, deal.currency)}</strong>
          {deal.expected_close_date && <span className="muted"> · expected close {deal.expected_close_date}</span>}</p>
        <p>
          {deal.organization && <Link href={`/organizations/${deal.organization.id}`}>{deal.organization.name}</Link>}
          {deal.organization && deal.person && ' · '}
          {deal.person && <Link href={`/persons/${deal.person.id}`}>{deal.person.name}</Link>}
        </p>
        <p>
          {deal.phone && <a href={`tel:${deal.phone}`}>{deal.phone}</a>}
          {deal.phone && deal.email && ' · '}
          {deal.email && <a href={`mailto:${deal.email}`}>{deal.email}</a>}
        </p>
        <p><LabelTags ids={deal.label_ids} labels={labels} />
          <span className="muted"> {pipe?.name} · Owner: {deal.owner?.full_name || 'none'}
            {deal.source_channel && ` · Source: ${deal.source_channel}${deal.source_channel_id ? ` (${deal.source_channel_id})` : ''}`}</span></p>
        {deal.status === 'lost' && deal.lost_reason && <p className="error">Lost: {deal.lost_reason}</p>}
      </section>

      <section className="panel">
        <h2>Stage and outcome</h2>
        <div className="row-form">
          <MoveStage action={moveDeal} dealId={deal.id} stages={stages || []} current={deal.stage_id} />
          {deal.status === 'open' ? (
            <>
              <form action={setStatus}><input type="hidden" name="status" value="won" /><button type="submit">Mark won</button></form>
              <form className="row-form" action={setStatus}>
                <input type="hidden" name="status" value="lost" />
                <select name="lost_reason" aria-label="Lost reason">
                  <option value="">Lost reason</option>
                  {reasons?.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
                </select>
                <button type="submit" className="ghost danger">Mark lost</button>
              </form>
            </>
          ) : (
            <form action={setStatus}><input type="hidden" name="status" value="open" /><button type="submit" className="ghost">Reopen</button></form>
          )}
        </div>
      </section>

      <details className="panel">
        <summary><strong>Edit deal</strong></summary>
        <form className="grid" action={updateDeal}>
          <label>Title<input name="title" defaultValue={deal.title} required /></label>
          <label>Contact person (name)<input name="contact_name" defaultValue={deal.person?.name || ''} /></label>
          <label>Organization (name)<input name="organization_name" defaultValue={deal.organization?.name || ''} /></label>
          <label>Value<input name="value" type="number" min="0" step="0.01" defaultValue={deal.value} /></label>
          <label>Currency
            <select name="currency" defaultValue={deal.currency}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
          </label>
          <label>Labels
            <details className="pick"><summary>Choose labels</summary>
              <div className="menu">
                {labels?.map((l) => (
                  <label className="check" key={l.id}>
                    <input type="checkbox" name="label_ids" value={l.id} defaultChecked={deal.label_ids?.includes(l.id)} /> {l.name}
                  </label>))}
              </div>
            </details>
          </label>
          <label>Expected close date<input name="expected_close_date" type="date" defaultValue={deal.expected_close_date || ''} /></label>
          <label>Owner
            <select name="owner_id" defaultValue={deal.owner_id || ''}><option value="">None</option>
              {people?.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>
          </label>
          <label>Source channel<input name="source_channel" defaultValue={deal.source_channel || ''} /></label>
          <label>Source channel ID<input name="source_channel_id" defaultValue={deal.source_channel_id || ''} /></label>
          <label>Phone<input name="phone" type="tel" defaultValue={deal.phone || ''} /></label>
          <label>Email<input name="email" type="email" defaultValue={deal.email || ''} /></label>
          <label>Visible to
            <select name="visible_to" defaultValue={deal.visible_to}><option value="everyone">Everyone</option>
              <option value="private">Private (owner and admin)</option></select>
          </label>
          <button type="submit">Save deal</button>
          {me?.role === 'admin' && <button type="submit" className="ghost danger" formAction={deleteDeal} formNoValidate>Delete deal</button>}
        </form>
      </details>
    </>
  );
}
