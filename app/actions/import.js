'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '../../lib/supabase/server';

const phoneKey = (v) => { const d = String(v || '').replace(/\D/g, ''); return d ? d.slice(-9) : null; };
const emailKey = (v) => { const e = String(v || '').trim().toLowerCase(); return e.includes('@') ? e : null; };
const nameKey = (v) => String(v || '').trim().toLowerCase();
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

export async function startBatch({ fileName, mapping, newFields }) {
  const s = createClient();
  const resolved = { ...mapping };
  for (const [header, nf] of Object.entries(newFields || {})) {
    if (mapping[header] !== 'new') continue;
    const row = must(await s.from('custom_fields').insert({ entity: nf.entity, name: String(nf.name).trim(), type: nf.type }).select('id').single());
    resolved[header] = 'cf:' + (row.id);
  }
  const batch = must(await s.from('import_batches').insert({ file_name: fileName }).select('id').single());
  const labelIds = {};
  for (const [name, color] of [['Updated by import', '#2b6cb0'], ['Possible duplicate', '#c2410c']]) {
    const ex = must(await s.from('labels').select('id').ilike('name', name).limit(1));
    labelIds[name] = ex[0]?.id || must(await s.from('labels').insert({ name, color }).select('id').single()).id;
  }
  return { batchId: batch.id, mapping: resolved, labelIds };
}

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
    r.pk = phoneKey(r.phone); r.ek = emailKey(r.email); r.nk = nameKey(r.company);
    if (!r.name && !r.company && !r.pk && !r.ek) { skipped++; continue; }
    parsed.push(r);
  }

  const pks = [...new Set(parsed.map((r) => r.pk).filter(Boolean))];
  const eks = [...new Set(parsed.map((r) => r.ek).filter(Boolean))];
  const nks = [...new Set(parsed.map((r) => r.nk).filter(Boolean))];
  const cols = 'id, name, phone, email, notes, custom, label_ids, organization_id';
  const found = new Map();
  if (pks.length) must(await s.from('persons').select(cols).in('phone_key', pks)).forEach((p) => found.set(p.id, p));
  if (eks.length) must(await s.from('persons').select(cols).in('email_key', eks)).forEach((p) => found.set(p.id, p));
  const orgIds = [...new Set([...found.values()].map((p) => p.organization_id).filter(Boolean))];
  const orgById = new Map(orgIds.length
    ? must(await s.from('organizations').select('id, website, address, country, custom').in('id', orgIds)).map((o) => [o.id, o]) : []);
  const existingByName = new Map();
  if (nks.length) must(await s.from('organizations').select('id, name_key, import_batch_id').in('name_key', nks))
    .forEach((o) => existingByName.set(o.name_key, [...(existingByName.get(o.name_key) || []), o]));

  const people = new Map();
  const reg = (rec) => {
    if (phoneKey(rec.phone)) people.set('p' + phoneKey(rec.phone), rec);
    if (emailKey(rec.email)) people.set('e' + emailKey(rec.email), rec);
  };
  found.forEach((p) => { p._existing = true; p.label_ids = p.label_ids || []; reg(p); });

  const orgPlan = new Map(); const newOrgs = []; const newPeople = [];
  let created = 0, merged = 0, flagged = 0;

  for (const r of parsed) {
    const hit = (r.pk && people.get('p' + r.pk)) || (r.ek && people.get('e' + r.ek));
    if (hit) {
      fill(hit, 'phone', r.phone); fill(hit, 'email', r.email);
      if (r.notes.length) fill(hit, 'notes', r.notes.join('\n'));
      fillCustom(hit, r.pc);
      const org = hit._existing ? orgById.get(hit.organization_id) : hit._org;
      if (org && !org._ref) { fill(org, 'website', r.website); fill(org, 'address', r.address); fill(org, 'country', r.country); fillCustom(org, r.oc); org._dirty = true; }
      if (hit._existing) {
        if (!hit.label_ids.includes(labelIds['Updated by import'])) hit.label_ids.push(labelIds['Updated by import']);
        hit._dirty = true;
      }
      reg(hit); merged++;
      continue;
    }
    let org = null; let dup = false;
    if (r.nk) {
      org = orgPlan.get(r.nk);
      if (!org) {
        const ex = existingByName.get(r.nk) || [];
        const same = ex.find((o) => o.import_batch_id === batchId);
        if (same) org = { id: same.id, _ref: true };
        else {
          dup = ex.length > 0;
          org = {
            name: r.company, phone: r.phone || null, website: r.website || null, address: r.address || null,
            country: r.country || null, time_zone: r.country === 'UK' ? 'Europe/London' : null, custom: { ...r.oc },
            label_ids: dup ? [labelIds['Possible duplicate']] : [], owner_id: user.id, created_by: user.id, import_batch_id: batchId,
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
      notes: r.notes.join('\n') || null, custom: { ...r.pc }, label_ids: dup ? [labelIds['Possible duplicate']] : [],
      owner_id: user.id, created_by: user.id, import_batch_id: batchId, _org: org,
    };
    newPeople.push(rec); reg(rec); created++; if (dup) flagged++;
  }

  if (newOrgs.length) {
    const ids = must(await s.from('organizations').insert(newOrgs).select('id'));
    newOrgs.forEach((o, i) => { o.id = ids[i].id; });
  }
  if (newPeople.length) {
    must(await s.from('persons').insert(newPeople.map(({ _org, ...p }) => ({ ...p, organization_id: _org?.id || null }))));
  }
  for (const p of found.values()) {
    if (p._dirty) must(await s.from('persons').update({ phone: p.phone, email: p.email, notes: p.notes, custom: p.custom, label_ids: p.label_ids }).eq('id', p.id));
  }
  for (const o of orgById.values()) {
    if (o._dirty) must(await s.from('organizations').update({ website: o.website, address: o.address, country: o.country, custom: o.custom }).eq('id', o.id));
  }
  return { created, merged, flagged, skipped };
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
