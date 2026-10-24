'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '../../lib/supabase/server';
import { guessZone } from '../../lib/tzguess';

const must = (res) => { if (res.error) throw new Error(res.error.message); return res.data; };
const phoneKey = (v) => { const d = String(v || '').replace(/\D/g, ''); return d.length >= 7 ? d.slice(-9) : null; };
const emailKey = (v) => { const e = String(v || '').trim().toLowerCase(); return e.includes('@') ? e : null; };
const nameKey = (v) => String(v || '').trim().toLowerCase();
const REASONS = { phone: 'Duplicate: same phone', email: 'Duplicate: same email', name: 'Duplicate: same name', org: 'Duplicate: same organization' };

// Looks for records that already exist, so callers can see who owns them and when they were last called.
export async function checkDuplicates({ phone, email, company, name }) {
  const s = createClient();
  const out = { persons: [], orgs: [] };
  const sel = 'id, name, phone, last_called_at, last_outcome, owner:profiles!persons_owner_id_fkey(full_name)';
  const seen = new Set();
  for (const [col, val, why] of [['phone_key', phoneKey(phone), 'phone'], ['email_key', emailKey(email), 'email'], ['name_key', nameKey(name), 'name']]) {
    if (!val) continue;
    const { data } = await s.from('persons').select(sel).eq(col, val).limit(5);
    (data || []).forEach((p) => { if (!seen.has(p.id)) { seen.add(p.id); out.persons.push({ ...p, why }); } });
  }
  const nk = nameKey(company);
  if (nk) {
    const { data } = await s.from('organizations').select('id, name, owner:profiles!organizations_owner_id_fkey(full_name)').eq('name_key', nk).limit(5);
    out.orgs = data || [];
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

export async function quickAdd(input) {
  const s = createClient();
  const { data: { user } } = await s.auth.getUser();
  const dups = await checkDuplicates(input);
  const reasons = new Set(dups.persons.map((p) => p.why));
  if (dups.orgs.length) reasons.add('org');
  const labelIds = reasons.size ? await dupLabels(s) : {};

  let zone = input.time_zone || null; let guessed = false;
  if (!zone) {
    zone = input.country === 'UK' ? 'Europe/London' : guessZone({ phone: input.phone, country: input.country });
    guessed = Boolean(zone) && input.country !== 'UK';
  }
  let orgId = null;
  const company = String(input.company || '').trim();
  if (company) {
    orgId = must(await s.from('organizations').insert({
      name: company, phone: input.phone || null, country: input.country || null,
      time_zone: zone, time_zone_guessed: guessed, label_ids: dups.orgs.length ? [labelIds.org] : [],
      owner_id: user.id, created_by: user.id,
    }).select('id').single()).id;
  }
  const person = must(await s.from('persons').insert({
    name: String(input.name || '').trim() || company || input.phone,
    phone: input.phone || null, email: input.email || null, notes: input.notes || null,
    organization_id: orgId,
    time_zone: orgId ? null : zone, time_zone_guessed: orgId ? false : guessed,
    label_ids: [...reasons].map((k) => labelIds[k]), possible_duplicate: reasons.size > 0,
    duplicate_of: dups.persons[0]?.id || null, duplicate_of_org: dups.orgs[0]?.id || null,
    owner_id: user.id, created_by: user.id,
  }).select('id').single());
  revalidatePath('/', 'layout');
  return { id: person.id, flagged: reasons.size > 0 };
}
