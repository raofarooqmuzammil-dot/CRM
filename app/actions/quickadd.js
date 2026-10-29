'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '../../lib/supabase/server';
import { guessZone } from '../../lib/tzguess';
import { findOrCreateList } from '../../lib/lists';

const must = (res) => { if (res.error) throw new Error(res.error.message); return res.data; };
const phoneKey = (v) => { const d = String(v || '').replace(/\D/g, ''); return d.length >= 7 ? d.slice(-9) : null; };
const emailKey = (v) => { const e = String(v || '').trim().toLowerCase(); return e.includes('@') ? e : null; };
const nameKey = (v) => String(v || '').trim().toLowerCase();
const REASONS = { phone: 'Duplicate: same phone', email: 'Duplicate: same email', org: 'Duplicate: same organization' };

// Looks for what already exists, so callers can see who owns it and when it was last called.
export async function checkDuplicates({ phone, email, company }) {
  const s = createClient();
  const out = { orgs: [], persons: [] };
  const seenO = new Set(); const seenP = new Set();
  const osel = 'id, name, last_called_at, last_outcome, owner:profiles!organizations_owner_id_fkey(full_name)';
  const psel = 'id, name, phone, organizations(id, name), owner:profiles!persons_owner_id_fkey(full_name)';
  for (const [col, val, why] of [['phone_key', phoneKey(phone), 'phone'], ['email_key', emailKey(email), 'email'], ['name_key', nameKey(company), 'org']]) {
    if (!val) continue;
    const { data } = await s.from('organizations').select(osel).eq(col, val).limit(5);
    (data || []).forEach((o) => { if (!seenO.has(o.id)) { seenO.add(o.id); out.orgs.push({ ...o, why }); } });
  }
  for (const [col, val, why] of [['phone_key', phoneKey(phone), 'phone'], ['email_key', emailKey(email), 'email']]) {
    if (!val) continue;
    const { data } = await s.from('persons').select(psel).eq(col, val).limit(5);
    (data || []).forEach((p) => { if (!seenP.has(p.id)) { seenP.add(p.id); out.persons.push({ ...p, why }); } });
  }
  return out;
}

async function dupLabels(s) {
  const ids = {};
  for (const [key, name] of Object.entries(REASONS)) {
    const ex = must(await s.from('labels').select('id').ilike('name', name).limit(1));
    ids[key] = ex[0]?.id || must(await s.from('labels').insert({ name, color: '#c2410c' }).select('id').single()).id;
  }
  return ids;
}

// Creates an organization (and a contact person if a contact name was given).
export async function quickAdd(input) {
  const s = createClient();
  const { data: { user } } = await s.auth.getUser();
  const dups = await checkDuplicates(input);
  const reasons = new Set([...dups.orgs, ...dups.persons].map((d) => d.why));
  const labelIds = reasons.size ? await dupLabels(s) : {};

  let zone = input.time_zone || null; let guessed = false;
  if (!zone) {
    zone = input.country === 'UK' ? 'Europe/London' : guessZone({ phone: input.phone, country: input.country });
    guessed = Boolean(zone) && input.country !== 'UK';
  }
  const org = must(await s.from('organizations').insert({
    name: String(input.company).trim(), phone: input.phone || null, email: input.email || null, notes: input.notes || null,
    country: input.country || null, time_zone: zone, time_zone_guessed: guessed, list_id: String(input.new_list_name || '').trim() ? await findOrCreateList(s, input.new_list_name) : input.list_id || null,
    label_ids: [...reasons].map((k) => labelIds[k]), possible_duplicate: reasons.size > 0,
    duplicate_of_org: dups.orgs[0]?.id || dups.persons[0]?.organizations?.id || null, duplicate_of_person: dups.persons[0]?.id || null,
    owner_id: user.id, created_by: user.id,
  }).select('id').single());
  if (String(input.name || '').trim()) {
    must(await s.from('persons').insert({ name: String(input.name).trim(), organization_id: org.id, owner_id: user.id, created_by: user.id }).select('id'));
  }
  revalidatePath('/', 'layout');
  return { id: org.id, flagged: reasons.size > 0 };
}
