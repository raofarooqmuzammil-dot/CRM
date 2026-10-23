'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '../../lib/supabase/server';

const phoneKey = (v) => { const d = String(v || '').replace(/\D/g, ''); return d.length >= 7 ? d.slice(-9) : null; };
const emailKey = (v) => { const e = String(v || '').trim().toLowerCase(); return e.includes('@') ? e : null; };
const nameKey = (v) => String(v || '').trim().toLowerCase();
// Internal bookkeeping keys start with an underscore and must never reach the database.
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('_')));
const must = (res) => { if (res.error) throw new Error(res.error.message); return res.data || []; };

function countryOf(v) {
  const s = String(v || '').trim().toLowerCase();
  if (['us', 'usa', 'united states', 'united states of america', 'america'].includes(s)) return 'US';
  if (['uk', 'gb', 'united kingdom', 'great britain', 'england', 'scotland', 'wales'].includes(s)) return 'UK';
  if (['au', 'aus', 'australia'].includes(s)) return 'AU';
  return null;
}
function coerce(type, raw) {
  const v = String(raw ?? '').trim();
  if (!v) return undefined;
  if (type === 'number') { const n = Number(v.replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : undefined; }
  if (type === 'boolean') return /^(yes|true|1|y)$/i.test(v);
  if (type === 'date') { const d = new Date(v); return isNaN(d) ? undefined : d.toISOString().slice(0, 10); }
  return v;
}
const fill = (t, k, v) => {
  if (v !== undefined && v !== null && v !== '' && (t[k] === undefined || t[k] === null || t[k] === '')) { t[k] = v; return true; }
  return false;
};
const fillCustom = (t, vals) => {
  t.custom = t.custom || {};
  for (const [k, v] of Object.entries(vals)) if (t.custom[k] === undefined) t.custom[k] = v;
};

const REASONS = {
  phone: 'Duplicate: same phone', email: 'Duplicate: same email',
  name: 'Duplicate: same name', org: 'Duplicate: same organization',
};

export async function startBatch({ fileName, mapping, newFields }) {
  const s = createClient();
  const resolved = { ...mapping };
  for (const [header, nf] of Object.entries(newFields || {})) {
    if (mapping[header] !== 'new') continue;
    const row = must(await s.from('custom_fields').insert({ entity: nf.entity, name: String(nf.name).trim(), type: nf.type }).select('id').single());
    resolved[header] = 'cf:' + row.id;
  }
  const batch = must(await s.from('import_batches').insert({ file_name: fileName }).select('id').single());
  const labelIds = {};
  for (const [key, name] of Object.entries(REASONS)) {
    const ex = must(await s.from('labels').select('id').ilike('name', name).limit(1));
    labelIds[key] = ex[0]?.id || must(await s.from('labels').insert({ name, color: '#c2410c' }).select('id').single()).id;
  }
  return { batchId: batch.id, mapping: resolved, labelIds };
}

// Every row is imported as its own record. Likely duplicates are only flagged, never merged.
export async function importChunk({ batchId, mapping, labelIds, rows }) {
  const s = createClient();
  const { data: { user } } = await s.auth.getUser();
  const defs = new Map(must(await s.from('custom_fields').select('id, entity, type')).map((f) => [f.id, f]));

  const parsed = [];
  let skipped = 0;
  for (const row of rows) {
    const r = { notes: [], pc: {}, oc: {} };
    for (const [h, target] of Object.entries(mapping)) {
      const raw = String(row[h] ?? '').trim();
      if (!raw || target === 'skip') continue;
      if (target === 'person.name') r.name = raw;
      else if (target === 'org.name') r.company = raw;
      else if (target === 'phone') r.phone = raw;
      else if (target === 'email') { if (emailKey(raw)) r.email = raw; }
      else if (target === 'org.country') r.country = countryOf(raw);
      else if (target === 'org.website') r.website = raw;
      else if (target === 'org.address') r.address = raw;
      else if (target === 'notes') r.notes.push(`${h}: ${raw}`);
      else if (target.startsWith('cf:')) {
        const f = defs.get(target.slice(3));
        const v = f && coerce(f.type, raw);
        if (f && v !== undefined) (f.entity === 'person' ? r.pc : r.oc)[f.id] = v;
      }
    }
    r.pk = phoneKey(r.phone); r.ek = emailKey(r.email); r.nk = nameKey(r.company); r.pn = nameKey(r.name);
    if (!r.name && !r.company && !r.phone && !r.email) { skipped++; continue; }
    parsed.push(r);
  }

  const uniq = (k) => [...new Set(parsed.map((r) => r[k]).filter(Boolean))];
  const pks = uniq('pk'), eks = uniq('ek'), nks = uniq('nk'), pns = uniq('pn');
  const known = { phone: new Map(), email: new Map(), name: new Map() };
  const add = (list) => list.forEach((p) => {
    if (p.phone_key && !known.phone.has(p.phone_key)) known.phone.set(p.phone_key, p.id);
    if (p.email_key && !known.email.has(p.email_key)) known.email.set(p.email_key, p.id);
    if (p.name_key && !known.name.has(p.name_key)) known.name.set(p.name_key, p.id);
  });
  const cols = 'id, phone_key, email_key, name_key';
  if (pks.length) add(must(await s.from('persons').select(cols).in('phone_key', pks)));
  if (eks.length) add(must(await s.from('persons').select(cols).in('email_key', eks)));
  if (pns.length) add(must(await s.from('persons').select(cols).in('name_key', pns)));
  const existingByName = new Map();
  if (nks.length) must(await s.from('organizations').select('id, name_key, import_batch_id').in('name_key', nks))
    .forEach((o) => existingByName.set(o.name_key, [...(existingByName.get(o.name_key) || []), o]));

  const inFile = { phone: new Map(), email: new Map(), name: new Map() };
  const orgPlan = new Map(); const newOrgs = []; const newPeople = [];
  let flagged = 0;

  for (const r of parsed) {
    const reasons = []; let dupId = null; let dupRec = null;
    for (const [kind, key] of [['phone', r.pk], ['email', r.ek], ['name', r.pn]]) {
      if (!key) continue;
      if (known[kind].has(key)) { reasons.push(kind); dupId = dupId || known[kind].get(key); }
      else if (inFile[kind].has(key)) { reasons.push(kind); dupRec = dupRec || inFile[kind].get(key); }
    }
    let org = null; let dupOrg = null;
    if (r.nk) {
      const ex = existingByName.get(r.nk) || [];
      const before = ex.filter((o) => o.import_batch_id !== batchId);
      if (before.length) { reasons.push('org'); dupOrg = before[0].id; }
      org = orgPlan.get(r.nk);
      if (!org) {
        const same = ex.find((o) => o.import_batch_id === batchId);
        if (same) org = { id: same.id, _ref: true };
        else {
          org = {
            name: r.company, phone: r.phone || null, website: r.website || null, address: r.address || null,
            country: r.country || null, time_zone: r.country === 'UK' ? 'Europe/London' : null, custom: { ...r.oc },
            label_ids: before.length ? [labelIds.org] : [], owner_id: user.id, created_by: user.id, import_batch_id: batchId,
          };
          newOrgs.push(org);
        }
        orgPlan.set(r.nk, org);
      } else if (!org._ref) {
        fill(org, 'website', r.website); fill(org, 'address', r.address); fill(org, 'country', r.country); fillCustom(org, r.oc);
      }
    }
    const rec = {
      name: r.name || r.company || r.phone || r.email, phone: r.phone || null, email: r.email || null,
      notes: r.notes.join('\n') || null, custom: { ...r.pc }, label_ids: reasons.map((k) => labelIds[k]),
      possible_duplicate: reasons.length > 0, duplicate_of: dupId, duplicate_of_org: dupOrg,
      owner_id: user.id, created_by: user.id, import_batch_id: batchId, _org: org, _dupRec: dupRec,
    };
    newPeople.push(rec);
    if (reasons.length) flagged++;
    if (r.pk && !inFile.phone.has(r.pk)) inFile.phone.set(r.pk, rec);
    if (r.ek && !inFile.email.has(r.ek)) inFile.email.set(r.ek, rec);
    if (r.name && r.pn && !inFile.name.has(r.pn)) inFile.name.set(r.pn, rec);
  }

  if (newOrgs.length) {
    const ids = must(await s.from('organizations').insert(newOrgs.map(clean)).select('id'));
    newOrgs.forEach((o, i) => { o.id = ids[i].id; });
  }
  if (newPeople.length) {
    const ids = must(await s.from('persons')
      .insert(newPeople.map((p) => clean({ ...p, organization_id: p._org?.id || null }))).select('id'));
    newPeople.forEach((p, i) => { p.id = ids[i].id; });
    for (const p of newPeople) {
      if (p._dupRec) must(await s.from('persons').update({ duplicate_of: p._dupRec.id }).eq('id', p.id));
    }
  }
  return { created: newPeople.length, flagged, skipped };
}

export async function finishBatch({ batchId, stats }) {
  await createClient().from('import_batches').update({ stats }).eq('id', batchId);
  revalidatePath('/', 'layout');
}

// Removes the records this import created. Merged changes to older records stay.
export async function undoBatch(fd) {
  const s = createClient();
  const id = fd.get('id');
  must(await s.from('persons').delete().eq('import_batch_id', id));
  must(await s.from('organizations').delete().eq('import_batch_id', id));
  must(await s.from('import_batches').delete().eq('id', id));
  revalidatePath('/', 'layout');
}
