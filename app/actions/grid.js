'use server';
import { createClient } from '../../lib/supabase/server';
import { ZONES } from '../../lib/zones';

const FIELDS = {
  persons: ['name', 'phone', 'email', 'notes', 'owner_id', 'time_zone', 'label_ids'],
  organizations: ['name', 'phone', 'website', 'address', 'country', 'time_zone', 'owner_id', 'label_ids'],
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (v) => { const t = String(v ?? '').trim(); return t || null; };

function builtIn(entity, field, value) {
  if (field === 'name') { const t = text(value); if (!t) throw new Error('Name cannot be empty'); return { name: t }; }
  if (field === 'email') { const t = text(value); if (t && !t.includes('@')) throw new Error('That does not look like an email'); return { email: t }; }
  if (field === 'owner_id') { const t = text(value); if (t && !UUID.test(t)) throw new Error('Unknown owner'); return { owner_id: t }; }
  if (field === 'country') { const t = text(value); if (t && !['US', 'UK', 'AU'].includes(t)) throw new Error('Unknown country'); return { country: t }; }
  if (field === 'time_zone') {
    const t = text(value);
    if (t && !ZONES.some(([z]) => z === t)) throw new Error('Unknown time zone');
    return { time_zone: t, time_zone_guessed: false };
  }
  if (field === 'label_ids') {
    if (!Array.isArray(value) || value.some((x) => !UUID.test(x))) throw new Error('Invalid labels');
    return { label_ids: value };
  }
  return { [field]: text(value) };   // phone, notes, website, address
}

function customValue(type, value) {
  if (type === 'boolean') return Boolean(value);
  const t = String(value ?? '').trim();
  if (!t) return undefined;
  if (type === 'number') { const n = Number(t); if (!Number.isFinite(n)) throw new Error('Enter a number'); return n; }
  if (type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(t)) throw new Error('Enter a date');
  return t;
}

// Saves one edited cell. Row-level security still decides who can change what.
export async function updateCell({ entity, id, field, value }) {
  try {
    if (!FIELDS[entity]) throw new Error('Unknown table');
    const s = createClient();
    let patch;
    if (String(field).startsWith('custom:')) {
      const fid = field.slice(7);
      const { data: def } = await s.from('custom_fields').select('type').eq('id', fid).single();
      if (!def) throw new Error('That column no longer exists');
      const { data: cur } = await s.from(entity).select('custom').eq('id', id).single();
      const custom = { ...(cur?.custom || {}) };
      const v = customValue(def.type, value);
      if (v === undefined) delete custom[fid]; else custom[fid] = v;
      patch = { custom };
    } else if (FIELDS[entity].includes(field)) {
      patch = builtIn(entity, field, value);
    } else throw new Error('That field cannot be edited here');
    const { data, error } = await s.from(entity).update(patch).eq('id', id).select('id');
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error('You do not have permission to change this record');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || 'Could not save' };
  }
}
