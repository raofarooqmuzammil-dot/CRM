export async function loadFields(supabase, entity) {
  const { data } = await supabase.from('custom_fields')
    .select('id, entity, name, type, options, sort, hidden')
    .eq('entity', entity).eq('hidden', false).order('sort').order('created_at');
  return data || [];
}

// Builds the stored values from a submitted form, keeping values for fields not on the form.
export function collectCustom(fd, fields, base = {}) {
  const out = { ...base };
  for (const f of fields) {
    const key = 'cf_' + f.id;
    if (f.type === 'boolean') { out[f.id] = fd.get(key) === 'on'; continue; }
    const raw = String(fd.get(key) ?? '').trim();
    if (!raw) { delete out[f.id]; continue; }
    if (f.type === 'number') { const n = Number(raw); if (Number.isFinite(n)) out[f.id] = n; } else out[f.id] = raw;
  }
  return out;
}
