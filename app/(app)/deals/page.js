import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { createClient } from '../../../lib/supabase/server';
import { resolveDealLinks } from '../../../lib/deals';
import AddColumn from '../../../components/AddColumn';
import { CustomInputs } from '../../../components/CustomFields';
import { loadFields, collectCustom } from '../../../lib/custom';
import MoveStage from '../../../components/MoveStage';
import LabelTags from '../../../components/LabelTags';
import { CURRENCIES, money, totals } from '../../../lib/money';

export default async function Deals({ searchParams }) {
  const sp = searchParams || {};
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: pipelines } = await supabase.from('pipelines').select('id, name').order('sort').order('created_at');
  if (!pipelines?.length) {
    return <><h1>Deals</h1><p className="panel empty">No pipeline yet. Create one in Settings, under Pipelines and stages.</p></>;
  }
  const pipeline = pipelines.find((p) => p.id === sp.pipeline) || pipelines[0];

  const [{ data: stages }, { data: deals }, { data: labels }, { data: people }, { data: pre }, cfields] = await Promise.all([
    supabase.from('stages').select('id, name').eq('pipeline_id', pipeline.id).order('sort').order('created_at'),
    supabase.from('deals')
      .select('id, title, value, currency, stage_id, expected_close_date, label_ids, person:persons(id, name), organization:organizations(name), owner:profiles!deals_owner_id_fkey(full_name)')
      .eq('pipeline_id', pipeline.id).eq('status', 'open').order('created_at', { ascending: false }),
    supabase.from('labels').select('id, name, color').order('name'),
    supabase.from('profiles').select('id, full_name').order('full_name'),
    sp.person ? supabase.from('persons').select('id, name, organizations(id, name)').eq('id', sp.person).maybeSingle() : Promise.resolve({ data: null }),
    loadFields(supabase, 'deal'),
  ]);

  async function moveDeal(fd) {
    'use server';
    const { error } = await createClient().from('deals').update({ stage_id: fd.get('stage_id') }).eq('id', fd.get('id'));
    if (error) throw new Error(error.message);
    revalidatePath('/deals');
  }
  async function addDeal(fd) {
    'use server';
    const s = createClient();
    const { data: { user } } = await s.auth.getUser();
    let phone = fd.get('phone') || null;
    let email = fd.get('email') || null;
    const { organization_id: orgId, person_id: personId } = await resolveDealLinks(s, fd.get('organization_name'), fd.get('contact_name'), user.id);
    if (personId && (!phone || !email)) {
      const { data: p } = await s.from('persons').select('phone, email').eq('id', personId).maybeSingle();
      phone = phone || p?.phone || null;
      email = email || p?.email || null;
    }
    const { error } = await s.from('deals').insert({
      title: fd.get('title'), person_id: personId, organization_id: orgId,
      value: Number(fd.get('value') || 0), currency: fd.get('currency'),
      pipeline_id: fd.get('pipeline_id'), stage_id: fd.get('stage_id'),
      label_ids: fd.getAll('label_ids'), custom: collectCustom(fd, await loadFields(s, 'deal')), expected_close_date: fd.get('expected_close_date') || null,
      owner_id: fd.get('owner_id') || user.id, source_channel: fd.get('source_channel') || null,
      source_channel_id: fd.get('source_channel_id') || null, visible_to: fd.get('visible_to'),
      phone, email, created_by: user.id,
    });
    if (error) throw new Error(error.message);
    revalidatePath('/deals');
  }

  return (
    <>
      <h1>Deals</h1>
      {pipelines.length > 1 && (
        <p className="tabs">{pipelines.map((p) => (
          <Link key={p.id} href={`/deals?pipeline=${p.id}`} className={p.id === pipeline.id ? 'on' : ''}>{p.name}</Link>
        ))}</p>
      )}
      <details className="panel" open={Boolean(pre)}>
        <summary><strong>Add deal</strong></summary>
        <form className="grid" action={addDeal}>
          <input type="hidden" name="pipeline_id" value={pipeline.id} />
          <label>Title<input name="title" required defaultValue={pre ? `${pre.name} deal` : ''} /></label>
          <label>Contact person (name)<input name="contact_name" defaultValue={pre?.name || ''} placeholder="Optional" /></label>
          <label>Organization (name)<input name="organization_name" defaultValue={pre?.organizations?.name || ''} placeholder="Created if it does not exist" /></label>
          <label>Value<input name="value" type="number" min="0" step="0.01" defaultValue="0" /></label>
          <label>Currency
            <select name="currency">{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
          </label>
          <label>Pipeline stage
            <select name="stage_id">{stages?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          </label>
          <label>Labels
            <details className="pick"><summary>Choose labels</summary>
              <div className="menu">
                {labels?.map((l) => (
                  <label className="check" key={l.id}><input type="checkbox" name="label_ids" value={l.id} /> {l.name}</label>))}
              </div>
            </details>
          </label>
          <label>Expected close date<input name="expected_close_date" type="date" /></label>
          <label>Owner
            <select name="owner_id" defaultValue={user.id}>{people?.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>
          </label>
          <label>Source channel<input name="source_channel" placeholder="Google, referral..." /></label>
          <label>Source channel ID<input name="source_channel_id" /></label>
          <label>Phone<input name="phone" type="tel" placeholder="Filled from the person if empty" /></label>
          <label>Email<input name="email" type="email" /></label>
          <label>Visible to
            <select name="visible_to"><option value="everyone">Everyone</option>
              <option value="private">Private (me and admin)</option></select>
          </label>
          <CustomInputs fields={cfields} />
          <button type="submit">Save deal</button>
        </form>
      </details>

      <AddColumn entity="deal" />
      <div className="board">
        {stages?.map((st) => {
          const col = (deals || []).filter((d) => d.stage_id === st.id);
          return (
            <section className="col" key={st.id}>
              <h2>{st.name}</h2>
              <p className="muted">{col.length} deals{totals(col) && ` · ${totals(col)}`}</p>
              {col.map((d) => (
                <article className="card" key={d.id}>
                  <Link href={`/deals/${d.id}`}><strong>{d.title}</strong></Link>
                  <div className="muted">{[d.organization?.name, d.person?.name].filter(Boolean).join(' · ')}</div>
                  <div>{money(d.value, d.currency)}{d.expected_close_date && <span className="muted"> · closes {d.expected_close_date}</span>}</div>
                  <div><LabelTags ids={d.label_ids} labels={labels} /></div>
                  <div className="muted">{d.owner?.full_name}</div>
                  <MoveStage action={moveDeal} dealId={d.id} stages={stages} current={st.id} />
                </article>
              ))}
              {!col.length && <p className="muted">Empty</p>}
            </section>
          );
        })}
        {!stages?.length && <p className="panel empty">This pipeline has no stages. Add some in Settings, under Pipelines and stages.</p>}
      </div>
    </>
  );
}
