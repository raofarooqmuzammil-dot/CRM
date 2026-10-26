// Loads the Results board: one column per call outcome, based on each organization's latest result.
const COLS = 'id, name, phone, time_zone, list_id, call_count, last_outcome, last_called_at, last_called_by, owner_id';

export async function loadBoard(supabase, { list, owner, since, outcomes, limit = 25 }) {
  const base = () => {
    let q = supabase.from('organizations').select(COLS, { count: 'exact' });
    if (list === 'none') q = q.is('list_id', null); else if (list) q = q.eq('list_id', list);
    if (owner) q = q.eq('owner_id', owner);
    return q;
  };
  const recent = (q) => q.order('last_called_at', { ascending: false }).limit(limit);
  const names = outcomes.map((o) => o.name);
  const columns = outcomes.map((o) => {
    let q = base().eq('last_outcome', o.name);
    if (since) q = q.gte('last_called_at', since);
    return { key: o.name, name: o.name, query: recent(q) };
  });
  let other = base().not('last_outcome', 'is', null);
  if (names.length) other = other.not('last_outcome', 'in', `(${names.map((n) => `"${n.replace(/"/g, '\\"')}"`).join(',')})`);
  if (since) other = other.gte('last_called_at', since);
  columns.push({ key: '__other', name: 'Other results', query: recent(other), hideIfEmpty: true });
  columns.push({ key: '__none', name: 'Not called yet', query: base().is('last_outcome', null).order('created_at', { ascending: false }).limit(limit) });

  const results = await Promise.all(columns.map((c) => c.query));
  return columns.map((c, i) => ({
    key: c.key, name: c.name, hideIfEmpty: c.hideIfEmpty,
    count: results[i].count || 0, rows: results[i].data || [],
    viewAll: c.key === '__none' ? 'none' : c.key === '__other' ? null : c.name,
  })).filter((c) => !(c.hideIfEmpty && c.count === 0));
}
