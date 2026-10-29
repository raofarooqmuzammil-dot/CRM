// Finds a list by name (ignoring case) or creates it, so lists never get duplicated by typos like "nemt" and "NEMT".
export async function findOrCreateList(s, name, color = '#66726f') {
  const n = String(name || '').trim();
  if (!n) return null;
  const { data: ex } = await s.from('lists').select('id').ilike('name', n.replace(/[%_\\]/g, '\\$&')).limit(1);
  if (ex?.[0]) return ex[0].id;
  const { data, error } = await s.from('lists').insert({ name: n, color }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id;
}
