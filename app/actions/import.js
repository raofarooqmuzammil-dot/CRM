'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '../../lib/supabase/server';
import { guessZone, parseZone } from '../../lib/tzguess';

const phoneKey = (v) => { const d = String(v || '').replace(/\D/g, ''); return d.length >= 7 ? d.slice(-9) : null; };
const emailKey = (v) => { const e = String(v || '').trim().toLowerCase(); return e.includes('@') ? e : null; };
const nameKey = (v) => String(v || '').trim().toLowerCase();
// Internal bookkeeping keys start with an underscore and must never reach the database.
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('_')));
const must = (res) => { if (res.error) throw new Error(res.error.message); return res.data || []; };
const push = (map, key, val) => { if (key && !map.has(key)) map.set(key, val); };

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
  if (v !== undefined && v !== null && v !== '' && (t[k] === undefined || t[k] === null || t[k] === '')) t[k] = v;
};
const fillCustom = (t, vals) => {
  t.custom = t.custom || {};
  for (const [k, v] of Object.entries(vals)) if (t.custom[k] === undefined) t.custom[k] = v;
};

const REASONS = {
  phone: 'Duplicate: same phone', email: 'Duplicate: same email',
  name: 'Duplicate: same name', org: 'Duplicate: same organization',
};

async function findOrCreateList(s, name, cache) {
  const n = String(name || '').trim();
  if (!n) return null;
  const k = n.toLowerCase();
  if (cache.has(k)) return cache.get(k);
  const ex = must(await s.from('lists').select('id').ilike('name', n.replace(/[%_\\]/g, '\\$&')).limit(1));
  const id = ex[0]?.id || must(await s.from('lists').insert({ name: n }).select('id').single()).id;
  cache.set(k, id);
  return id;
}

export async function startBatch({ fileName, mapping, newFields, listId, newListName }) {
  const s = createClient();
  const resolved = { ...mapping };
  for (const [header, nf] of Object.entries(newFields || {})) {
    if (mapping[header] !== 'new') continue;
    const row = must(await s.from('custom_fields').insert({ entity: nf.entity, name: String(nf.name).trim(), type: nf.type }).select('id').single());
    resolved[header] = 'cf:' + row.id;
  }
  const fileList = String(newListName || '').trim()
    ? await findOrCreateList(s, newListName, new Map())
    : listId || null;
  const batch = must(await s.from('import_batches').insert({ file_name: fileName }).select('id').single());
  const labelIds = {};
  for (const [key, name] of Object.entries(REASONS)) {
    const ex = must(await s.from('labels').select('id').ilike('name', name).limit(1));
    labelIds[key] = ex[0]?.id || must(await s.from('labels').insert({ name, color: '#c2410c' }).select('id').single()).id;
  }
  return { batchId: batch.id, mapping: resolved, labelIds, listId: fileList };
}

// Each row becomes an organization. A contact person is created only when the row has contact details.
// Likely duplicates are flagged, never merged.
export async function importChunk({ batchId, mapping, labelIds, listId, rows }) {
  const s = createClient();
  const { data: { user } } = await s.auth.getUser();
  const defs = new Map(must(await s.from('custom_fields').select('id, entity, type')).map((f) => [f.id, f]));
  const listCache = new Map();

  const parsed = [];
  let skipped = 0;
  for (const row of rows) {
    const r = { notes: [], pc: {}, oc: {} };
    for (const [h, target] of Object.entries(mapping)) {
      const raw = String(row[h] ?? '').trim();
      if (!raw || target === 'skip') continue;
      if (target === 'org.name') r.company = raw;
      else if (target === 'phone') r.phone = raw;
      else if (target === 'email') { if (emailKey(raw)) r.email = raw; }
      else if (target === 'org.country') r.country = countryOf(raw);
      else if (target === 'org.website') r.website = raw;
      else if (target === 'org.address') r.address = raw;
      else if (target === 'time_zone') r.tzRaw = raw;
      else if (target === 'list') r.listName = raw;
      else if (target === 'person.name') r.cname = raw;
      else if (target === 'person.phone') r.cphone = raw;
      else if (target === 'person.email') { if (emailKey(raw)) r.cemail = raw; }
      else if (target === 'notes') r.notes.push(`${h}: ${raw}`);
      else if (target.startsWith('cf:')) {
        const f = defs.get(target.slice(3));
        const v = f && coerce(f.type, raw);
        if (f && v !== undefined) (f.entity === 'person' ? r.pc : r.oc)[f.id] = v;
      }
    }
    r.orgName = r.company || r.cname || r.phone || r.email;
    if (!r.orgName) { skipped++; continue; }
    r.pk = phoneKey(r.phone); r.ek = emailKey(r.email); r.nk = nameKey(r.orgName);
    r.cpk = phoneKey(r.cphone); r.cek = emailKey(r.cemail); r.cnk = nameKey(r.cname);
    r.hasContact = Boolean(r.cname || r.cphone || r.cemail);
    r.zone = parseZone(r.tzRaw); r.guessed = false;
    if (!r.zone && r.country === 'UK') r.zone = 'Europe/London';
    if (!r.zone) { r.zone = guessZone({ phone: r.phone, country: r.country, address: r.address }); r.guessed = Boolean(r.zone); }
    r.listId = r.listName ? await findOrCreateList(s, r.listName, listCache) : listId || null;
    parsed.push(r);
  }

  // What already exists
  const uniq = (...ks) => [...new Set(parsed.flatMap((r) => ks.map((k) => r[k])).filter(Boolean))];
  const phoneKeys = uniq('pk', 'cpk'), emailKeys = uniq('ek', 'cek'), nameKeys = uniq('nk'), personNames = uniq('cnk');
  const orgs = { phone: new Map(), email: new Map() }; const orgsByName = new Map();
  const people = { phone: new Map(), email: new Map(), name: new Map() };
  const addOrgs = (list) => list.forEach((o) => {
    push(orgs.phone, o.phone_key, o.id); push(orgs.email, o.email_key, o.id);
    orgsByName.set(o.name_key, [...(orgsByName.get(o.name_key) || []), o]);
  });
  const addPeople = (list) => list.forEach((p) => {
    push(people.phone, p.phone_key, p); push(people.email, p.email_key, p); push(people.name, p.name_key, p);
  });
  const oc = 'id, name_key, phone_key, email_key, import_batch_id';
  const pc = 'id, organization_id, phone_key, email_key, name_key';
  if (phoneKeys.length) { addOrgs(must(await s.from('organizations').select(oc).in('phone_key', phoneKeys))); addPeople(must(await s.from('persons').select(pc).in('phone_key', phoneKeys))); }
  if (emailKeys.length) { addOrgs(must(await s.from('organizations').select(oc).in('email_key', emailKeys))); addPeople(must(await s.from('persons').select(pc).in('email_key', emailKeys))); }
  if (nameKeys.length) addOrgs(must(await s.from('organizations').select(oc).in('name_key', nameKeys)));
  if (personNames.length) addPeople(must(await s.from('persons').select(pc).in('name_key', personNames)));
  // the same organization can be found by several keys
  for (const [k, list] of orgsByName) orgsByName.set(k, [...new Map(list.map((o) => [o.id, o])).values()]);

  const orgPlan = new Map(); const inFile = { phone: new Map(), email: new Map(), name: new Map() };
  const pInFile = { phone: new Map(), email: new Map(), name: new Map() };
  const newOrgs = []; const newPeople = [];
  let flagged = 0;

  for (const r of parsed) {
    // 1. the same organization again in this file (same name and phone): keep one record, add the contact to it
    const sameKey = `${r.nk}|${r.pk || ''}`;
    let org = orgPlan.get(sameKey);
    if (!org) {
      const mine = (orgsByName.get(r.nk) || []).find((o) => o.import_batch_id === batchId && (o.phone_key || '') === (r.pk || ''));
      if (mine) { org = { id: mine.id, _ref: true }; orgPlan.set(sameKey, org); }
    }
    if (org && !org._ref) {
      fill(org, 'website', r.website); fill(org, 'address', r.address); fill(org, 'email', r.email); fillCustom(org, r.oc);
    }
    // 2. otherwise a new organization, flagged if it looks like one we already have
    if (!org) {
      const reasons = []; let dupOrg = null; let dupPerson = null; let dupRec = null;
      const hit = (kind, key, existingOrg, existingPerson, planned) => {
        if (!key) return;
        if (existingOrg?.has(key)) { reasons.push(kind); dupOrg = dupOrg || existingOrg.get(key); }
        else if (existingPerson?.has(key)) { reasons.push(kind); const p = existingPerson.get(key); dupPerson = dupPerson || p.id; dupOrg = dupOrg || p.organization_id; }
        else if (planned.has(key)) { reasons.push(kind); dupRec = dupRec || planned.get(key); }
      };
      hit('phone', r.pk, orgs.phone, people.phone, inFile.phone);
      hit('email', r.ek, orgs.email, people.email, inFile.email);
      const before = (orgsByName.get(r.nk) || []).filter((o) => o.import_batch_id !== batchId);
      if (before.length) { reasons.push('org'); dupOrg = dupOrg || before[0].id; }
      else if (inFile.name.has(r.nk)) { reasons.push('org'); dupRec = dupRec || inFile.name.get(r.nk); }
      org = {
        name: r.orgName, phone: r.phone || null, email: r.email || null, website: r.website || null, address: r.address || null,
        country: r.country || null, time_zone: r.zone, time_zone_guessed: r.guessed,
        notes: r.notes.join('\n') || null, custom: { ...r.oc }, list_id: r.listId,
        label_ids: reasons.map((k) => labelIds[k]), possible_duplicate: reasons.length > 0,
        duplicate_of_org: dupOrg, duplicate_of_person: dupPerson,
        owner_id: user.id, created_by: user.id, import_batch_id: batchId, _dupRec: dupRec,
      };
      newOrgs.push(org); orgPlan.set(sameKey, org);
      push(inFile.phone, r.pk, org); push(inFile.email, r.ek, org); push(inFile.name, r.nk, org);
      if (reasons.length) flagged++;
    }
    // 3. the contact person, only when the row has contact details
    if (r.hasContact) {
      const reasons = []; let dupPerson = null; let dupRec = null;
      for (const [kind, key] of [['phone', r.cpk], ['email', r.cek], ['name', r.cname ? r.cnk : null]]) {
        if (!key) continue;
        if (people[kind].has(key)) { reasons.push(kind); dupPerson = dupPerson || people[kind].get(key).id; }
        else if (pInFile[kind].has(key)) { reasons.push(kind); dupRec = dupRec || pInFile[kind].get(key); }
      }
      const rec = {
        name: r.cname || r.cphone || r.cemail, phone: r.cphone || null, email: r.cemail || null,
        custom: { ...r.pc }, label_ids: reasons.map((k) => labelIds[k]), possible_duplicate: reasons.length > 0,
        duplicate_of: dupPerson, owner_id: user.id, created_by: user.id, import_batch_id: batchId, _org: org, _dupRec: dupRec,
      };
      newPeople.push(rec);
      push(pInFile.phone, r.cpk, rec); push(pInFile.email, r.cek, rec); push(pInFile.name, r.cname ? r.cnk : null, rec);
      if (reasons.length) flagged++;
    }
  }

  if (newOrgs.length) {
    const ids = must(await s.from('organizations').insert(newOrgs.map(clean)).select('id'));
    newOrgs.forEach((o, i) => { o.id = ids[i].id; });
    for (const o of newOrgs) {
      if (o._dupRec) must(await s.from('organizations').update({ duplicate_of_org: o._dupRec.id }).eq('id', o.id));
    }
  }
  if (newPeople.length) {
    const ids = must(await s.from('persons')
      .insert(newPeople.map((p) => clean({ ...p, organization_id: p._org?.id || null }))).select('id'));
    newPeople.forEach((p, i) => { p.id = ids[i].id; });
    for (const p of newPeople) {
      if (p._dupRec) must(await s.from('persons').update({ duplicate_of: p._dupRec.id }).eq('id', p.id));
    }
  }
  return { created: newOrgs.length, contacts: newPeople.length, flagged, skipped };
}

export async function finishBatch({ batchId, stats }) {
  await createClient().from('import_batches').update({ stats }).eq('id', batchId);
  revalidatePath('/', 'layout');
}

// Puts every organization from an earlier import into one list.
export async function assignImportList(fd) {
  const listId = String(fd.get('list_id') || '') || null;
  must(await createClient().from('organizations').update({ list_id: listId }).eq('import_batch_id', fd.get('id')).select('id'));
  revalidatePath('/', 'layout');
}

// Removes the records this import created.
export async function undoBatch(fd) {
  const s = createClient();
  const id = fd.get('id');
  must(await s.from('persons').delete().eq('import_batch_id', id));
  must(await s.from('organizations').delete().eq('import_batch_id', id));
  must(await s.from('import_batches').delete().eq('id', id));
  revalidatePath('/', 'layout');
}
